import { describe, expect, it } from "vitest";
import {
  ereignisStrom,
  liesModellStrom,
  StromFehler,
  streamZeilen,
} from "../../supabase/functions/_shared/eniStream";
function strom(text: string) {
  const bytes = new TextEncoder().encode(text);
  return new ReadableStream<Uint8Array>({
    start(c) {
      for (const b of bytes) c.enqueue(new Uint8Array([b]));
      c.close();
    },
  });
}
describe("ENI Streaming", () => {
  it("liest UTF8 auch bei getrennten Umlauten und transportiert Teile sofort", async () => {
    const teile: string[] = [];
    const text = await liesModellStrom(
      strom(
        'data: {"choices":[{"delta":{"content":"Grüße"}}]}\r\n\r\ndata: {"choices":[{"delta":{"content":"!"},"finish_reason":"stop"}]}\n\ndata: [DONE]\n',
      ),
      (teil) => teile.push(teil),
    );
    expect(text).toBe("Grüße!");
    expect(teile).toEqual(["Grüße", "!"]);
  });
  it("verwirft abgebrochene und vom Anbieter abgelehnte Antworten", async () => {
    await expect(
      liesModellStrom(
        strom('data: {"choices":[{"delta":{"content":"Halb"}}]}\n'),
        () => {},
      ),
    ).rejects.toThrow("Unvollstaendiger");
    await expect(
      liesModellStrom(
        strom('data: {"choices":[{"finish_reason":"content_filter"}]}\n'),
        () => {},
      ),
    ).rejects.toThrow("abgelehnt");
  });
  it("traegt den Code aus einem Fehler im 200er-Strom weiter", async () => {
    // Eine Durchleitung legt den Fehler eines freien Modells gern in einen
    // Strom mit Status 200. Ohne den Code daraus waere jeder dieser Faelle
    // dasselbe nichtssagende Schweigen.
    const ursache = await liesModellStrom(
      strom('data: {"error":{"code":402,"message":"balance too low"}}\n'),
      () => {},
    ).catch((f) => f);
    expect(ursache).toBeInstanceOf(StromFehler);
    expect((ursache as StromFehler).status).toBe(402);
    expect((ursache as StromFehler).message).not.toContain("balance");
  });
  it("erkennt eine Antwort, die nur aus Gedanken besteht", async () => {
    const ursache = await liesModellStrom(
      strom(
        'data: {"choices":[{"delta":{"reasoning":"hm"}}]}\n\ndata: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n',
      ),
      () => {},
    ).catch((f) => f);
    expect((ursache as StromFehler).art).toBe("gedacht");
  });
  it("gibt Teile vor Abschluss frei und transportiert Fehler im fertigen Ereignis", async () => {
    let fertig!: () => void;
    const warten = new Promise<void>((r) => {
      fertig = r;
    });
    const antwort = ereignisStrom(async (sende) => {
      sende({ typ: "text", text: "Schon da" });
      await warten;
      return new Response(JSON.stringify({ error: "nicht gespeichert" }), {
        status: 500,
      });
    }, {});
    const zeilen = streamZeilen(antwort.body!);
    expect(JSON.parse((await zeilen.next()).value!).text).toBe("Schon da");
    fertig();
    expect(JSON.parse((await zeilen.next()).value!).status).toBe(500);
  });
  it("bricht die Anbieterarbeit beim Schließen des Readers ab", async () => {
    let signal!: AbortSignal;
    let fertig!: () => void;
    const antwort = ereignisStrom(async (_, s) => {
      signal = s;
      await new Promise<void>((r) => {
        fertig = r;
      });
      return new Response("{}");
    }, {});
    await antwort.body!.cancel();
    expect(signal.aborted).toBe(true);
    fertig();
  });
});
