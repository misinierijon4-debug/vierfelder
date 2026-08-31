import { createClient } from 'npm:@supabase/supabase-js@2'

/**
 * Ein Fokus-Umschalter als aufrufbare URL:
 *
 *   https://<ref>.functions.supabase.co/fokus?t=TOKEN&b=lernen&e=an
 *
 * Der Grund ist nicht Bequemlichkeit, sondern Uebertragbarkeit. Ein fertiger
 * Kurzbefehl laesst sich nicht weitergeben — iOS nimmt nur von Apple signierte
 * Dateien an. Also muss das, was man von Hand nachbaut, so klein sein, dass
 * beim Nachbauen nichts schiefgehen kann: eine Aktion, eine URL. Kein POST,
 * keine Header, keine vier JSON-Felder, die iOS beim Anlegen zu Booleans macht.
 *
 * Geschrieben wird nichts selbst. Die Funktion ruft `record_aufenthalt` auf,
 * dieselbe Datenbankfunktion wie die Standort-Kurzbefehle — sonst gaebe es zwei
 * Stellen, an denen die Regeln fuer eine Sitzung stehen, und irgendwann zwei
 * verschiedene.
 */

const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  // das token steht in der URL. keine zwischenspeicherung, nirgends.
  'cache-control': 'no-store',
}

const BEREICHE = ['lernen', 'gym', 'boxen', 'lesen']

function antwort(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS })
}

/** kurze und lange schreibweise, damit die url lesbar bleibt oder kurz */
function hole(params: URLSearchParams, ...namen: string[]): string {
  for (const name of namen) {
    const wert = params.get(name)
    if (wert !== null && wert.trim() !== '') return wert.trim()
  }
  return ''
}

Deno.serve(async (request) => {
  if (request.method !== 'GET' && request.method !== 'POST') {
    return antwort(405, { error: 'nur GET oder POST' })
  }

  const params = new URL(request.url).searchParams
  const token = hole(params, 't', 'token')
  const bereich = hole(params, 'b', 'bereich').toLowerCase()
  const ereignis = hole(params, 'e', 'ereignis').toLowerCase()
  const ort = hole(params, 'o', 'ort') || `fokus ${bereich}`

  if (token.length < 32) return antwort(401, { error: 'import-token fehlt oder ist zu kurz' })
  if (!BEREICHE.includes(bereich)) {
    return antwort(400, { error: `b muss ${BEREICHE.join(', ')} sein`, war: bereich })
  }
  if (ereignis === '') return antwort(400, { error: 'e fehlt: an oder aus' })

  const url = Deno.env.get('SUPABASE_URL')
  // anon reicht: `record_aufenthalt` ist security definer und genau dafuer
  // freigegeben. der service-key hat hier nichts zu suchen.
  const key = Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !key) return antwort(500, { error: 'server ist nicht vollständig konfiguriert' })

  const db = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data, error } = await db.rpc('record_aufenthalt', {
    p_token: token,
    p_bereich: bereich,
    p_ort: ort,
    p_ereignis: ereignis,
  })

  if (error) {
    // die datenbank kennt genau zwei fehlerarten: falsches token und
    // falsche eingabe. beides ist hier ein tippfehler in der url.
    const text = error.message ?? 'unbekannter fehler'
    const status = text.includes('import-token') ? 401 : 400
    return antwort(status, { error: text })
  }

  return antwort(200, data as Record<string, unknown>)
})
