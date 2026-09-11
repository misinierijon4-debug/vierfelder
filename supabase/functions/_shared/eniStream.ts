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

export async function liesModellStrom(
  body: ReadableStream<Uint8Array>,
  onText: (text: string) => void,
): Promise<string> {
  let text = "";
  let fertig = false;
  for await (const zeile of streamZeilen(body)) {
    if (!zeile.startsWith("data:")) continue;
    const roh = zeile.slice(5).trim();
    if (roh === "[DONE]") {
      fertig = true;
      break;
    }
    if (!roh) continue;
    const event = JSON.parse(roh);
    if (event.error) throw new Error("Modellstream fehlgeschlagen");
    const wahl = event.choices?.[0];
    if (wahl?.finish_reason === "content_filter")
      throw new Error("Modellstream abgelehnt");
    if (wahl?.finish_reason && !["stop", "length"].includes(wahl.finish_reason))
      throw new Error("Modellstream abgebrochen");
    if (wahl?.finish_reason) fertig = true;
    const teil = wahl?.delta?.content;
    if (typeof teil === "string" && teil) {
      text += teil;
      onText(teil);
    }
  }
  if (!fertig) throw new Error("Unvollstaendiger Modellstream");
  return text;
}
