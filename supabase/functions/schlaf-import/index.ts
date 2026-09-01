import { createClient } from 'npm:@supabase/supabase-js@2.112.4'

type ImportBody = {
  person?: unknown
  sleepGoalMinutes?: unknown
  segments?: unknown
}

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8' }
const MAX_PAYLOAD_BYTES = 512 * 1024

function antwort(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS })
}

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value)
  const hash = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') return antwort(405, { error: 'nur POST ist erlaubt' })

  const token = request.headers.get('x-schlaf-token')?.trim() ?? ''
  if (token.length < 32) return antwort(401, { error: 'import-token fehlt oder ist zu kurz' })

  const angekuendigt = Number(request.headers.get('content-length') ?? 0)
  if (angekuendigt > MAX_PAYLOAD_BYTES) {
    return antwort(413, { error: 'payload ist größer als 512 kibibyte' })
  }

  let body: ImportBody
  try {
    const raw = await request.text()
    if (new TextEncoder().encode(raw).byteLength > MAX_PAYLOAD_BYTES) {
      return antwort(413, { error: 'payload ist größer als 512 kibibyte' })
    }
    body = JSON.parse(raw) as ImportBody
  } catch {
    return antwort(400, { error: 'body ist kein gültiges JSON' })
  }

  if (body.person !== 'erijon' && body.person !== 'koray') {
    return antwort(400, { error: 'person muss erijon oder koray sein' })
  }
  if (!Array.isArray(body.segments)) return antwort(400, { error: 'segments muss eine liste sein' })
  if (body.segments.length === 0 || body.segments.length > 300) {
    return antwort(422, { error: 'zwischen 1 und 300 segmente sind erlaubt' })
  }

  const url = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !serviceKey) return antwort(500, { error: 'server ist nicht vollständig konfiguriert' })

  const db = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const tokenHash = await sha256(token)
  const { data: tokenRow, error: tokenError } = await db
    .from('schlaf_import_tokens')
    .select('user_id')
    .eq('token_hash', tokenHash)
    .eq('aktiv', true)
    .maybeSingle()

  if (tokenError) return antwort(500, { error: 'token konnte nicht geprüft werden' })
  if (!tokenRow) return antwort(401, { error: 'import-token ist ungültig' })

  const { data: profil, error: profilError } = await db
    .from('profile')
    .select('person')
    .eq('id', tokenRow.user_id)
    .single()

  if (profilError || !profil) return antwort(401, { error: 'profil zum import-token fehlt' })
  if (profil.person !== body.person) {
    return antwort(403, { error: 'person passt nicht zum import-token' })
  }

  const ziel = body.sleepGoalMinutes
  if (!Number.isInteger(ziel) || (ziel as number) < 240 || (ziel as number) > 720) {
    return antwort(400, {
      error: 'sleepGoalMinutes muss eine ganze zahl zwischen 240 und 720 sein',
    })
  }

  // Ein kanonischer Datenbankweg fuer Edge Function und bestehende direkte
  // Kurzbefehle: Nachtauswahl, Ueberlappungen, Wachabzug, lokale Datumszuordnung
  // und Rundung laufen ausschliesslich in record_sleep_night. Der v2-Trigger
  // setzt danach unabhaengig vom Aufrufer denselben nachvollziehbaren Score.
  const { data: importiert, error: importError } = await db.rpc('record_sleep_night', {
    p_night_date: null,
    p_raw_segments: body.segments,
    p_source_name: 'schlaf-import',
    p_target_hours: (ziel as number) / 60,
    p_user_id: null,
    p_token: token,
  })

  if (importError || !importiert || typeof importiert !== 'object') {
    const status =
      importError?.code === '53300'
        ? 429
        : importError?.code === '54000'
          ? 413
          : importError?.code === '22023' || importError?.code === '28000'
            ? 422
            : 500
    return antwort(status, {
      error: status < 500 ? importError?.message : 'schlafnacht konnte nicht gespeichert werden',
    })
  }

  const rpc = importiert as Record<string, unknown>
  const nacht = typeof rpc.nacht === 'string' ? rpc.nacht : ''
  const { data: gespeichert, error: leseFehler } = await db
    .from('schlaf_updates')
    .select(
      'schlaf_minuten, nachtwert, score_version, score_konfidenz, score_komponenten, wach_minuten'
    )
    .eq('user_id', tokenRow.user_id)
    .eq('nacht', nacht)
    .single()

  if (leseFehler || !gespeichert) {
    return antwort(500, { error: 'gespeicherte schlafnacht konnte nicht bestätigt werden' })
  }

  return antwort(200, {
    ok: true,
    person: profil.person,
    night: nacht,
    sleepMinutes: gespeichert.schlaf_minuten,
    awakePhases: rpc.wachphasen ?? null,
    awakeMinutes: gespeichert.wach_minuten,
    nightValue: gespeichert.nachtwert,
    scoreVersion: gespeichert.score_version,
    scoreConfidence: gespeichert.score_konfidenz,
    scoreComponents: gespeichert.score_komponenten,
  })
})
