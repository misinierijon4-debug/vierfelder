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

export function erstelleThinkFilter(onText: (teil: string) => void) {
  let inThink = false;
  let puffer = "";
  let akkumuliert = "";
  /**
   * Was hinter <think> verschwindet, heben wir trotzdem auf. Bricht der Strom
   * ab, bevor </think> kommt, ist das der einzige Text, den es gibt — dann ist
   * ein angefangener Gedanke immer noch besser als eine leere Antwort.
   */
  let denkText = "";

  function gibFrei(text: string) {
    if (!text) return;
    akkumuliert += text;
    onText(text);
  }

  function verarbeite(teil: string) {
    puffer += teil;
    while (puffer.length > 0) {
      if (!inThink) {
        const lower = puffer.toLowerCase();
        const startIdx = lower.indexOf("<think>");
        if (startIdx !== -1) {
          gibFrei(puffer.slice(0, startIdx));
          puffer = puffer.slice(startIdx + "<think>".length);
          if (akkumuliert === "") {
            puffer = puffer.replace(/^\n+/, "");
          }
          inThink = true;
        } else {
          const matchPrefix = ["<think", "<thin", "<thi", "<th", "<t", "<"].find((p) =>
            lower.endsWith(p)
          );
          if (matchPrefix) {
            const sichererText = puffer.slice(0, puffer.length - matchPrefix.length);
            gibFrei(sichererText);
            puffer = puffer.slice(puffer.length - matchPrefix.length);
            break;
          } else {
            gibFrei(puffer);
            puffer = "";
          }
        }
      } else {
        const lower = puffer.toLowerCase();
        const endeIdx = lower.indexOf("</think>");
        if (endeIdx !== -1) {
          denkText = "";
          puffer = puffer.slice(endeIdx + "</think>".length);
          if (akkumuliert === "") {
            puffer = puffer.replace(/^\n+/, "");
          }
          inThink = false;
        } else {
          const matchPrefix = [
            "</think",
            "</thin",
            "</thi",
            "</th",
            "</t",
            "</",
            "<",
          ].find((p) => lower.endsWith(p));
          if (matchPrefix) {
            denkText += puffer.slice(0, puffer.length - matchPrefix.length);
            puffer = puffer.slice(puffer.length - matchPrefix.length);
            break;
          } else {
            denkText += puffer;
            puffer = "";
          }
        }
      }
    }
  }

  function abschliessen(): string {
    if (!inThink && puffer.length > 0) {
      gibFrei(puffer);
      puffer = "";
    }
    // <think> ohne </think>: der Strom ist mitten im Denken abgerissen. Alles
    // zu verwerfen hiesse leerer Bildschirm und leere Zeile in der Datenbank.
    // Steht sonst nichts da, geben wir den angefangenen Gedanken frei.
    if (inThink && akkumuliert === "") {
      gibFrei((denkText + puffer).trim());
      puffer = "";
      denkText = "";
    }
    return akkumuliert;
  }

  return { verarbeite, abschliessen };
}

export async function liesModellStrom(
  body: ReadableStream<Uint8Array>,
  onText: (text: string) => void,
): Promise<string> {
  const filter = erstelleThinkFilter(onText);
  let fertig = false;
  for await (const zeile of streamZeilen(body)) {
    if (!zeile.startsWith("data:")) continue;
    const roh = zeile.slice(5).trim();
    if (roh === "[DONE]") {
      fertig = true;
      break;
    }
    if (!roh) continue;
    let event: Record<string, any>;
    try {
      event = JSON.parse(roh);
    } catch {
      continue;
    }
    if (event.error) throw new Error("Modellstream fehlgeschlagen");
    const wahl = event.choices?.[0];
    if (wahl?.finish_reason === "content_filter")
      throw new Error("Modellstream abgelehnt");
    if (wahl?.finish_reason && !["stop", "length"].includes(wahl.finish_reason))
      throw new Error("Modellstream abgebrochen");
    if (wahl?.finish_reason) fertig = true;
    const teil = wahl?.delta?.content;
    if (typeof teil === "string" && teil) {
      filter.verarbeite(teil);
    }
  }
  const text = filter.abschliessen();
  if (!fertig) throw new Error("Unvollstaendiger Modellstream");
  return text;
}
