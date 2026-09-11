import { createClient } from 'npm:@supabase/supabase-js@2.112.4'
import {
  behandleEniStimme,
  type EniStimmeAbhaengigkeiten,
  type StimmAnfrage,
  type StimmDatenbank,
} from '../_shared/eniStimmeModell.ts'

/**
 * ENIs Stimme bei der Gemini-API. Der Schluessel steht ausschliesslich in der
 * Umgebung dieser Function:
 *
 *   supabase secrets set GEMINI_API_KEY=...
 *
 * Bewusst die Gemini-API und nicht Cloud Text-to-Speech, obwohl beide von
 * Google kommen und dieselben Stimmen haben: fuer Cloud TTS verlangt Google ein
 * Rechnungskonto mit Einzahlung, fuer einen Schluessel aus AI Studio nicht. Die
 * Stimme ist dieselbe, der Weg dahin ist kostenlos.
 *
 * Wieder ein blankes `fetch` statt eines SDK, dieselbe Entscheidung wie bei der
 * Modellverbindung: ein POST mit JSON hin und base64 zurueck braucht kein
 * npm-Paket in einer Deno-Function.
 *
 * Der Schluessel geht als Kopfzeile und nicht als `?key=` in die Adresse. Eine
 * URL landet in Protokollen, in Fehlermeldungen und in Weiterleitungen; eine
 * Kopfzeile tut das nicht. Beides funktioniert bei Google, nur eins davon ist
 * richtig.
 */

/**
 * Die Adresse steht ganz da, mit Modellnamen und allem, statt aus Teilen
 * zusammengesetzt zu werden. `edgeImports.test` zaehlt jede Adresse auf, die
 * eine Function nach draussen anspricht; das ergibt nur eine Pruefung, solange
 * sie im Quelltext auch als eine Adresse zu lesen ist. Ein Modellwechsel faellt
 * dort dann auf, statt still zu passieren.
 */
const ENDPUNKT =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-tts-preview:generateContent'

/** eine haengende gegenstelle darf die function nicht festhalten */
const FRIST_MS = 60_000

type GeminiAntwort = {
  candidates?: Array<{
    content?: { parts?: Array<{ inlineData?: { data?: string } }> }
  }>
}

function ausBase64(roh: string): Uint8Array {
  const binaer = atob(roh)
  const bytes = new Uint8Array(binaer.length)
  for (let i = 0; i < binaer.length; i += 1) bytes[i] = binaer.charCodeAt(i)
  return bytes
}

/**
 * Ein Stueck sprechen lassen. Zurueck kommt rohes PCM mit 24 kHz, einem Kanal
 * und 16 Bit; den WAV-Kopf schreibt der gemeinsame Handler, wenn alle Stuecke
 * beisammen sind.
 */
async function rufeStimme(anfrage: StimmAnfrage, schluessel: string): Promise<Uint8Array> {
  const antwort = await fetch(ENDPUNKT, {
    method: 'POST',
    headers: {
      'x-goog-api-key': schluessel,
      'content-type': 'application/json',
    },
    signal: AbortSignal.timeout(FRIST_MS),
    body: JSON.stringify({
      /**
       * Der Text geht ohne Regieanweisung hinein. Diese Modelle nehmen zwar
       * eine entgegen („sag das kalt und knapp"), aber ENIs Haltung steht schon
       * in seinen Worten. Sie ein zweites Mal in eine Anweisung zu schreiben
       * hiesse, sie an zwei Stellen zu pflegen, und die zweite waere die, die
       * man vergisst.
       */
      contents: [{ parts: [{ text: anfrage.text }] }],
      generationConfig: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          voiceConfig: { prebuiltVoiceConfig: { voiceName: anfrage.stimme } },
        },
      },
    }),
  })

  if (!antwort.ok) {
    // Nur der Status geht weiter, nie die Antwort der Gegenstelle: die koennte
    // die Anfrage samt Schluessel spiegeln.
    throw new Error(`gemini antwortet ${antwort.status}`)
  }

  const inhalt = (await antwort.json()) as GeminiAntwort
  const roh = inhalt.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data
  return roh ? ausBase64(roh) : new Uint8Array()
}

Deno.serve((request) =>
  behandleEniStimme(request, {
    umgebung: (name) => Deno.env.get(name),
    datenbank: (url, key, autorisierung) =>
      createClient(url, key, {
        global: { headers: { authorization: autorisierung } },
        auth: { autoRefreshToken: false, persistSession: false },
      }) as unknown as StimmDatenbank,
    modell: rufeStimme,
    protokoll: console,
  } satisfies EniStimmeAbhaengigkeiten)
)
