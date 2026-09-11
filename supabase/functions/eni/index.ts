import { createClient } from 'npm:@supabase/supabase-js@2.112.4'
import {
  ABLEHNUNG,
  behandleEni,
  MAX_TOKENS,
  MODELL,
  type EniDatenbank,
  type ModellAnfrage,
} from '../_shared/eniModell.ts'

/**
 * ENIs modellverbindung zu DeepSeek. Der Schluessel steht ausschliesslich in
 * der Umgebung dieser Function:
 *
 *   supabase secrets set DEEPSEEK_API_KEY=...
 *
 * Er darf nie in das Browser-Bundle, nie in das Repository und nie in eine
 * Antwort. Die Regeln, wer hier ueberhaupt hereindarf, stehen im gemeinsamen
 * Handler; hier steht nur, wie das Modell gerufen wird.
 *
 * Bewusst ein blankes `fetch` statt eines SDK: die DeepSeek-API ist ein
 * einzelner POST mit JSON hin und JSON zurueck. Ein npm-Paket dafuer waere ein
 * halber Node-Unterbau in einer Deno-Function, fuer nichts. Dieselbe
 * Entscheidung wie bei `webpush.ts`.
 *
 * Bilder gehen ueber dasselbe Modell und denselben Schluessel: `deepseek-flash`
 * nimmt seit August 2026 Bildbloecke im Chat-Format entgegen. Der frueher dafuer
 * noetige Name `deepseek-v4-flash-vision-exp` ist zurueckgezogen und wird auf
 * Flash umgeleitet; er gehoert deshalb nicht mehr hierher.
 */

const ENDPUNKT = 'https://api.deepseek.com/chat/completions'

/** eine haengende gegenstelle darf die function nicht festhalten */
const FRIST_MS = 60_000

type DeepSeekAntwort = {
  choices?: Array<{
    finish_reason?: string
    message?: { content?: string }
  }>
}

async function rufeModell(anfrage: ModellAnfrage, schluessel: string): Promise<string> {
  const antwort = await fetch(ENDPUNKT, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${schluessel}`,
      'content-type': 'application/json',
    },
    signal: AbortSignal.timeout(FRIST_MS),
    body: JSON.stringify({
      model: MODELL,
      max_tokens: MAX_TOKENS,
      /**
       * DeepSeek denkt sonst von sich aus mit `reasoning_effort: high` vor.
       * ENI ist eine haltung, keine rechenaufgabe: das kostet nur zeit und
       * geld, und die denk-token zaehlen gegen dasselbe `max_tokens`, koennten
       * eine lange erklaerung also mittendrin abschneiden.
       */
      thinking: { type: 'disabled' },
      messages: [
        { role: 'system', content: anfrage.system },
        ...anfrage.nachrichten.map((nachricht) => ({
          role: nachricht.rolle,
          /**
           * Ohne Bild bleibt der Inhalt ein blanker String. Das ist nicht nur
           * kuerzer, sondern die Form, die DeepSeek fuer den Kontext-Cache
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
                     * gueltig. DeepSeek holt das Bild selbst ab, statt dass es
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
    throw new Error(`deepseek antwortet ${antwort.status}`)
  }

  const inhalt = (await antwort.json()) as DeepSeekAntwort
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
    throw new Error(`deepseek bricht ab: ${wahl.finish_reason}`)
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
