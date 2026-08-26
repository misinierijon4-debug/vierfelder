import { createClient } from 'npm:@supabase/supabase-js@2'
import { berechneSchlafnacht } from '../_shared/schlaf.ts'
import type { Rohsegment, SchlafHistorie } from '../_shared/schlaf.ts'

type ImportBody = {
  person?: unknown
  sleepGoalMinutes?: unknown
  segments?: unknown
}

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8' }

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

  let body: ImportBody
  try {
    body = (await request.json()) as ImportBody
  } catch {
    return antwort(400, { error: 'body ist kein gültiges JSON' })
  }

  if (body.person !== 'erijon' && body.person !== 'koray') {
    return antwort(400, { error: 'person muss erijon oder koray sein' })
  }
  if (!Array.isArray(body.segments)) return antwort(400, { error: 'segments muss eine liste sein' })

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

  const segmente = body.segments as Rohsegment[]
  const ziel = body.sleepGoalMinutes
  if (!Number.isInteger(ziel)) {
    return antwort(400, { error: 'sleepGoalMinutes muss eine ganze zahl sein' })
  }

  // Die Nacht wird aus dem Ende des letzten Schlafsegments abgeleitet. Für den
  // Median reichen die höchstens 13 unmittelbar davor liegenden Nächte.
  let vorlaeufig
  try {
    vorlaeufig = berechneSchlafnacht(segmente, ziel as number, [])
  } catch (error) {
    return antwort(422, { error: error instanceof Error ? error.message : 'segmente sind ungültig' })
  }

  const { data: historieRows, error: historieError } = await db
    .from('schlafnaechte')
    .select('nacht, einschlafzeit')
    .eq('user_id', tokenRow.user_id)
    .lt('nacht', vorlaeufig.nacht)
    .order('nacht', { ascending: false })
    .limit(13)

  if (historieError) return antwort(500, { error: 'schlafhistorie konnte nicht geladen werden' })

  let berechnung
  try {
    berechnung = berechneSchlafnacht(
      segmente,
      ziel as number,
      (historieRows ?? []) as SchlafHistorie[]
    )
  } catch (error) {
    return antwort(422, { error: error instanceof Error ? error.message : 'segmente sind ungültig' })
  }

  const { error: upsertError } = await db.from('schlafnaechte').upsert(
    {
      user_id: tokenRow.user_id,
      nacht: berechnung.nacht,
      schlaf_minuten: berechnung.schlafMinuten,
      einschlafzeit: berechnung.einschlafzeit,
      wachphasen: berechnung.wachphasen,
      wach_minuten: berechnung.wachMinuten,
      nachtwert: berechnung.nachtwert,
      bewertungsbasis: berechnung.bewertungsbasis,
      dauer_punkte: berechnung.dauerPunkte,
      konsistenz_punkte: berechnung.konsistenzPunkte,
      unterbrechung_punkte: berechnung.unterbrechungPunkte,
      median_abweichung_minuten: berechnung.medianAbweichungMinuten,
      historie_naechte: berechnung.historieNaechte,
      schlafziel_minuten: ziel,
      wachsegmente_vorhanden: berechnung.wachsegmenteVorhanden,
      quellen: berechnung.quellen,
      rohsegmente: segmente,
      aktualisiert: new Date().toISOString(),
    },
    { onConflict: 'user_id,nacht' }
  )

  if (upsertError) return antwort(500, { error: 'schlafnacht konnte nicht gespeichert werden' })

  return antwort(200, {
    ok: true,
    person: profil.person,
    night: berechnung.nacht,
    sleepMinutes: berechnung.schlafMinuten,
    awakePhases: berechnung.wachphasen,
    awakeMinutes: berechnung.wachMinuten,
    nightValue: berechnung.nachtwert,
    scoreBasis: berechnung.bewertungsbasis,
    historyNights: berechnung.historieNaechte,
  })
})
