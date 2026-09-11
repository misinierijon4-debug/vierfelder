import { streamZeilen } from '../_shared/eniStream.ts'
import { createClient } from 'npm:@supabase/supabase-js@2.112.4'
import {
  behandleEniStimme,
  StimmFehler,
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

/**
 * Eine haengende Gegenstelle darf die Function nicht festhalten.
 *
 * Eine Minute stand hier, und eine Minute ist keine Frist, sondern ein Aufgeben:
 * wer so lange wartet, wartet auf etwas, das nicht mehr kommt. Ein Stueck dieser
 * Laenge ist in fuenf bis fuenfzehn Sekunden gesprochen; was nach dreissig noch
 * nicht da ist, ist ein Aussetzer, und den holt die Wiederholung schneller ein
 * als das Warten.
 */
const STROM_ENDPUNKT = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-tts-preview:streamGenerateContent?alt=sse'
const FRIST_MS = 30_000

/**
 * Welche Antworten es noch einmal wert sind. 429 ist eine Drosselung, 5xx ein
 * Aussetzer, 408 eine Zeitueberschreitung drueben — alle drei sind gleich wieder
 * vorbei. Alles andere ist ein Nein, das beim zweiten Mal genauso ausfaellt.
 */
function nochEinmal(status: number): boolean {
  return status === 408 || status === 429 || status >= 500
}

/** was die gegenstelle selbst als wartezeit nennt, in millisekunden */
function wartezeit(kopf: string | null): number | null {
  if (!kopf) return null
  const sekunden = Number(kopf.trim())
  return Number.isFinite(sekunden) && sekunden >= 0 ? Math.min(sekunden, 5) * 1000 : null
}

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
  let antwort: Response
  try {
    antwort = await fetch(anfrage.onPcm ? STROM_ENDPUNKT : ENDPUNKT, {
      method: 'POST',
      headers: {
        'x-goog-api-key': schluessel,
        'content-type': 'application/json',
      },
      signal: anfrage.signal ? AbortSignal.any([anfrage.signal, AbortSignal.timeout(FRIST_MS)]) : AbortSignal.timeout(FRIST_MS),
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
  } catch (ursache) {
    // Netz weg oder Frist abgelaufen: beides ist ein Aussetzer, kein Nein.
    throw new StimmFehler(`gemini nicht erreichbar: ${(ursache as Error)?.name ?? 'fehler'}`, true)
  }

  if (!antwort.ok) {
    // Nur der Status geht weiter, nie die Antwort der Gegenstelle: die koennte
    // die Anfrage samt Schluessel spiegeln. Der Rumpf wird trotzdem geleert,
    // sonst haelt Deno die Verbindung offen.
    void antwort.body?.cancel()
    throw new StimmFehler(
      `gemini antwortet ${antwort.status}`,
      nochEinmal(antwort.status),
      wartezeit(antwort.headers.get('retry-after'))
    )
  }

  if (anfrage.onPcm && antwort.headers.get('content-type')?.includes('text/event-stream')) {
    if (!antwort.body) throw new StimmFehler('leerer strom', true)
    const teile: Uint8Array[] = []
    let fertig = false
    for await (const zeile of streamZeilen(antwort.body)) {
      if (!zeile.startsWith('data:')) continue
      const roh = zeile.slice(5).trim()
      if (!roh) continue
      const event = JSON.parse(roh)
      if (event.error) throw new StimmFehler('stimme unterbrochen', false)
      const kandidat = event.candidates?.[0]
      for (const part of kandidat?.content?.parts ?? []) {
        if (!part.inlineData?.data) continue
        const bytes = ausBase64(part.inlineData.data)
        teile.push(bytes)
        anfrage.onPcm(bytes)
      }
      if (kandidat?.finishReason) {
        if (kandidat.finishReason !== 'STOP') throw new StimmFehler('unvollstaendiger ton', false)
        fertig = true
      }
    }
    if (!fertig) throw new StimmFehler('unvollstaendiger ton', false)
    const pcm = new Uint8Array(teile.reduce((n, t) => n + t.length, 0))
    let offset = 0
    for (const teil of teile) { pcm.set(teil, offset); offset += teil.length }
    return pcm
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
