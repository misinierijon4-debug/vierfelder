import { createClient } from 'npm:@supabase/supabase-js@2.112.4'
import {
  ABLEHNUNG,
  behandleEni,
  MAX_TOKENS,
  type EniDatenbank,
  type ModellAnfrage,
} from '../_shared/eniModell.ts'
import type { Anbieter } from '../_shared/eniAnbieter.ts'

/**
 * ENIs modellverbindung. Welche Gegenstellen es gibt, steht in
 * `_shared/eniAnbieter.ts`; welche davon gerufen wird, entscheidet der
 * Handler. Hier steht nur, wie gerufen wird.
 *
 * Die Schluessel stehen ausschliesslich in der Umgebung dieser Function, einer
 * je Anbieter:
 *
 *   supabase secrets set DEEPSEEK_API_KEY=...
 *   supabase secrets set OPENROUTER_API_KEY=...
 *
 * Keiner darf je in das Browser-Bundle, in das Repository oder in eine
 * Antwort. Die Regeln, wer hier ueberhaupt hereindarf, stehen im gemeinsamen
 * Handler.
 *
 * Bewusst ein blankes `fetch` statt eines SDK: beide Gegenstellen sprechen
 * dasselbe OpenAI-Chatformat, ein einzelner POST mit JSON hin und JSON
 * zurueck. Genau deshalb ist der zweite Anbieter auch nur eine Zeile in der
 * Liste und keine zweite Funktion: ein npm-Paket dafuer waere ein halber
 * Node-Unterbau in einer Deno-Function, fuer nichts. Dieselbe Entscheidung wie
 * bei `webpush.ts`.
 *
 * Bilder gehen ueber dasselbe Modell und denselben Schluessel. `deepseek-flash`
 * nimmt seit August 2026 Bildbloecke im Chat-Format entgegen; der frueher dafuer
 * noetige Name `deepseek-v4-flash-vision-exp` ist zurueckgezogen und wird auf
 * Flash umgeleitet. Beim zweiten Anbieter steht das VL im Namen: auch er sieht
 * die Bloecke selbst.
 */

/** eine haengende gegenstelle darf die function nicht festhalten */
const FRIST_MS = 60_000

type ChatAntwort = {
  choices?: Array<{
    finish_reason?: string
    message?: { content?: string }
  }>
  /**
   * OpenRouter legt einen Fehler auch mal in einen 200er-Rumpf, statt ihn im
   * Status zu sagen. Ohne diese Zeile waere das eine leere Antwort ohne Grund.
   */
  error?: { message?: string; code?: number }
}

async function rufeModell(
  anfrage: ModellAnfrage,
  anbieter: Anbieter,
  schluessel: string
): Promise<string> {
  const antwort = await fetch(anbieter.endpunkt, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${schluessel}`,
      'content-type': 'application/json',
    },
    signal: AbortSignal.timeout(FRIST_MS),
    body: JSON.stringify({
      model: anbieter.modell,
      /**
       * Eine Zeile, die vordenkt, bekommt mehr Luft: denk-token sind
       * ausgabe-token und gehen von demselben Deckel ab.
       */
      max_tokens: anbieter.maxTokens ?? MAX_TOKENS,
      /**
       * Jede Gegenstelle nennt den Schalter fuers Vordenken anders, und nicht
       * jede hat ihn in derselben Stellung stehen. Wie er heisst und wo er
       * steht, sagt der Anbieter; warum, steht dort auch.
       */
      ...anbieter.denken,
      messages: [
        { role: 'system', content: anfrage.system },
        ...anfrage.nachrichten.map((nachricht) => ({
          role: nachricht.rolle,
          /**
           * Ohne Bild bleibt der Inhalt ein blanker String. Das ist nicht nur
           * kuerzer, sondern die Form, die beide fuer den Kontext-Cache
           * wiedererkennt; ein Verlauf, der ploetzlich als Blockliste kommt,
           * waere ein Cache-Fehlschlag bei jeder Vorlage.
           */
          content:
            nachricht.bilder && nachricht.bilder.length > 0
              ? [
                  ...(nachricht.text === ''
                    ? []
                    : [{ type: 'text' as const, text: nachricht.text }]),
                  ...nachricht.bilder.map((url) => ({
                    type: 'image_url' as const,
                    /**
                     * Eine signierte Adresse aus dem Bucket, zehn Minuten
                     * gueltig. Das Modell holt das Bild selbst ab, statt dass es
                     * base64 durch diese Function laeuft: das waere ein Drittel
                     * mehr Daten auf beiden Seiten fuer dasselbe Bild.
                     *
                     * Kein `detail: 'low'`. Ein Bild kostet ohnehin hoechstens
                     * 384 Token, egal wie es hereinkommt, und wer einen
                     * Screenshot vom Raster hinhaelt, will, dass ENI die Zahlen
                     * darauf lesen kann.
                     */
                    image_url: { url },
                  })),
                ]
              : nachricht.text,
        })),
      ],
    }),
  })

  if (!antwort.ok) {
    // Der Koerper kann den Schluessel nicht enthalten, aber sicherheitshalber
    // geht nur der Status weiter, nie die Antwort der Gegenstelle.
    throw new Error(`${anbieter.id} antwortet ${antwort.status}`)
  }

  const inhalt = (await antwort.json()) as ChatAntwort
  if (inhalt.error) {
    // Auch hier nur der Code, nicht der Text der Gegenstelle.
    throw new Error(`${anbieter.id} meldet fehler ${inhalt.error.code ?? '?'}`)
  }
  const wahl = inhalt.choices?.[0]

  if (wahl?.finish_reason === 'content_filter') {
    const fehler = new Error('vom filter abgelehnt')
    fehler.name = ABLEHNUNG
    throw fehler
  }
  if (
    wahl?.finish_reason === 'insufficient_system_resource' ||
    wahl?.finish_reason === 'aborted'
  ) {
    throw new Error(`${anbieter.id} bricht ab: ${wahl.finish_reason}`)
  }

  // `length` heisst abgeschnitten. Der angefangene satz ist trotzdem mehr wert
  // als ein fehler, also geht er durch.
  return wahl?.message?.content ?? ''
}

Deno.serve((request) =>
  behandleEni(request, {
    umgebung: (name) => Deno.env.get(name),
    datenbank: (url, key, autorisierung) =>
      createClient(url, key, {
        global: { headers: { authorization: autorisierung } },
        auth: { autoRefreshToken: false, persistSession: false },
      }) as unknown as EniDatenbank,
    modell: rufeModell,
    protokoll: console,
  })
)
