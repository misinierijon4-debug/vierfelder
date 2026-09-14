/** Incremental UTF-8 reader shared by provider SSE and our NDJSON transport. */
export async function* streamZeilen(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let rest = "";
  try {
    for (;;) {
      const { value, done } = await reader.read();
      rest += done ? decoder.decode() : decoder.decode(value, { stream: true });
      let ende: number;
      while ((ende = rest.indexOf("\n")) !== -1) {
        yield rest.slice(0, ende).replace(/\r$/, "");
        rest = rest.slice(ende + 1);
      }
      if (rest.length > 8_000_000) throw new Error("Stream-Ereignis zu gross");
      if (done) break;
    }
    if (rest.trim()) yield rest;
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

export function ereignisStrom(
  arbeite: (
    sende: (ereignis: Record<string, unknown>) => void,
    signal: AbortSignal,
  ) => Promise<Response>,
  headers: Record<string, string>,
): Response {
  const abbruch = new AbortController();
  let geschlossen = false;
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const sende = (e: Record<string, unknown>) => {
        if (!geschlossen)
          controller.enqueue(encoder.encode(JSON.stringify(e) + "\n"));
      };
      try {
        const ergebnis = await arbeite(sende, abbruch.signal);
        sende({
          typ: "fertig",
          status: ergebnis.status,
          inhalt: await ergebnis.json(),
        });
      } catch {
        sende({
          typ: "fertig",
          status: 502,
          inhalt: {
            error: "Die Übertragung wurde unterbrochen.",
            code: "modell_fehler",
          },
        });
      } finally {
        if (!geschlossen) {
          geschlossen = true;
          controller.close();
        }
      }
    },
    cancel() {
      geschlossen = true;
      abbruch.abort();
    },
  });
  return new Response(stream, {
    headers: {
      ...headers,
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-store",
      "x-accel-buffering": "no",
    },
  });
}

/**
 * Was im Strom schiefging, als Feld statt als Satz.
 *
 * Der Leser kennt den Anbieter nicht, deshalb haengt hier noch keine id dran;
 * wer ihn ruft, setzt sie, bevor daraus eine Meldung fuer einen Menschen wird.
 * Ohne diese Felder wurde jeder Strom-Fehlschlag zu demselben nichtssagenden
 * "ENI hat nicht geantwortet" — auch der, in dem die Gegenstelle sehr genau
 * gesagt hat, was ihr fehlt.
 */
export class StromFehler extends Error {
  constructor(
    /** code aus dem fehlerereignis, 0 wenn keiner genannt ist */
    readonly status: number,
    /** was es war, wenn kein status dabei ist */
    readonly art: 'strom' | 'gedacht',
    nachricht: string,
  ) {
    super(nachricht);
    this.name = "EniStrom";
  }
}

/** eine zahl aus dem code der gegenstelle, oder 0. `"429"` zaehlt, `"rate_limit"` nicht. */
function codeZahl(wert: unknown): number {
  const zahl = typeof wert === "number" ? wert : Number(wert);
  return Number.isFinite(zahl) && zahl > 0 ? zahl : 0;
}

export async function liesModellStrom(
  body: ReadableStream<Uint8Array>,
  onText: (text: string) => void,
): Promise<string> {
  let text = "";
  let fertig = false;
  /**
   * Ob ueberhaupt gedacht wurde. Ein Modell, dem das Vordenken nicht
   * abgeschaltet werden konnte, schickt seine Gedanken in `reasoning` und laesst
   * `content` leer. Das sieht von aussen aus wie Schweigen, ist aber das
   * Gegenteil, und nur dieser Zaehler kann die beiden auseinanderhalten.
   */
  let gedacht = false;
  for await (const zeile of streamZeilen(body)) {
    if (!zeile.startsWith("data:")) continue;
    const roh = zeile.slice(5).trim();
    if (roh === "[DONE]") {
      fertig = true;
      break;
    }
    if (!roh) continue;
    const event = JSON.parse(roh);
    // Eine Gegenstelle, die den Fehler in einen 200er-Strom legt, sagt trotzdem
    // meist einen Code. Der geht mit: er ist das, woran man es erkennt.
    if (event.error) {
      throw new StromFehler(
        codeZahl(event.error?.code ?? event.error?.status),
        "strom",
        "Modellstream fehlgeschlagen",
      );
    }
    const wahl = event.choices?.[0];
    if (wahl?.finish_reason === "content_filter") {
      throw new Error("Modellstream abgelehnt");
    }
    if (wahl?.finish_reason && !["stop", "length"].includes(wahl.finish_reason)) {
      throw new StromFehler(0, "strom", "Modellstream abgebrochen");
    }
    if (wahl?.finish_reason) fertig = true;
    const denkt = wahl?.delta?.reasoning ?? wahl?.delta?.reasoning_content;
    if (typeof denkt === "string" && denkt) gedacht = true;
    const teil = wahl?.delta?.content;
    if (typeof teil === "string" && teil) {
      text += teil;
      onText(teil);
    }
  }
  if (!fertig) throw new StromFehler(0, "strom", "Unvollstaendiger Modellstream");
  // Nur gedacht und nichts gesagt: ein zweiter Versuch endet genauso, denn das
  // Modell denkt wieder. Das muss als eigener Fall heraus, nicht als Schweigen.
  if (text.trim() === "" && gedacht) {
    throw new StromFehler(0, "gedacht", "Modellstream nur mit Gedanken");
  }
  return text;
}
