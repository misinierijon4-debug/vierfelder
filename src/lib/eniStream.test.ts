import { describe, expect, it } from "vitest";
import {
  ereignisStrom,
  liesModellStrom,
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
  it("überspringt fehlerhafte oder unvollständige JSON-Zeilen im Stream", async () => {
    const teile: string[] = [];
    const payload = [
      'data: {defektes json',
      'data: {"choices":[{"delta":{"content":"Klar"}}]}',
      'data: {"choices":[{"delta":{"content":"!"},"finish_reason":"stop"}]}',
      'data: [DONE]',
    ].join('\n');
    const text = await liesModellStrom(strom(payload), (teil) => teile.push(teil));
    expect(text).toBe("Klar!");
    expect(teile).toEqual(["Klar", "!"]);
  });
  it("filtert Inline-<think>-Blöcke vollständig aus Stream und Gesamtergebnis", async () => {
    const teile: string[] = [];
    const payload = [
      'data: {"choices":[{"delta":{"content":"<th"}}]}',
      'data: {"choices":[{"delta":{"content":"ink>Interne Überlegungen</th"}}]}',
      'data: {"choices":[{"delta":{"content":"ink>\\n\\nDie Lösung ist "}}]}',
      'data: {"choices":[{"delta":{"content":"42."},"finish_reason":"stop"}]}',
      'data: [DONE]',
    ].join('\n');
    const text = await liesModellStrom(strom(payload), (teil) => teile.push(teil));
    expect(text).toBe("Die Lösung ist 42.");
    expect(teile).toEqual(["Die Lösung ist ", "42."]);
  });
  it("verliert die Antwort nicht, wenn <think> nie geschlossen wird", async () => {
    // Reisst der Strom mitten im Denken ab, war der Gedanke der einzige Text.
    // Ihn zu verwerfen hiesse: leerer Bildschirm und leere Zeile im Verlauf.
    const teile: string[] = [];
    const payload = [
      'data: {"choices":[{"delta":{"content":"<think>Ich rechne nach"}}]}',
      'data: {"choices":[{"delta":{"content":" und komme auf 42."},"finish_reason":"stop"}]}',
      'data: [DONE]',
    ].join('\n');
    const text = await liesModellStrom(strom(payload), (teil) => teile.push(teil));
    expect(text).toBe("Ich rechne nach und komme auf 42.");
    expect(teile.join("")).toBe("Ich rechne nach und komme auf 42.");
  });
  it("wirft einen unvollstaendigen Gedanken weg, wenn danach echter Text kam", async () => {
    const payload = [
      'data: {"choices":[{"delta":{"content":"<think>egal</think>Die Antwort ist 42."}}]}',
      'data: {"choices":[{"delta":{"content":" <think>noch ein Rest"},"finish_reason":"stop"}]}',
      'data: [DONE]',
    ].join('\n');
    const text = await liesModellStrom(strom(payload), () => {});
    expect(text).toBe("Die Antwort ist 42. ");
  });
  it("behält normale spitze Klammern bei, die keine <think>-Tags sind", async () => {
    const teile: string[] = [];
    const payload = [
      'data: {"choices":[{"delta":{"content":"Ist 3 <"}}]}',
      'data: {"choices":[{"delta":{"content":" 5?"}}]}',
      'data: {"choices":[{"delta":{"content":" Ja."},"finish_reason":"stop"}]}',
      'data: [DONE]',
    ].join('\n');
    const text = await liesModellStrom(strom(payload), (teil) => teile.push(teil));
    expect(text).toBe("Ist 3 < 5? Ja.");
  });
});
