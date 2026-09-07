import { createClient } from 'npm:@supabase/supabase-js@2.112.4'
import { versendeAktivitaeten } from '../_shared/aktivitaetsVersand.ts'

function antwort(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: {
    'content-type': 'application/json', 'cache-control': 'no-store',
  } })
}

Deno.serve(async request => {
  if (request.method !== 'POST') return antwort(405, { error: 'nur POST' })
  const token = request.headers.get('x-erinnerungs-secret') ?? ''
  if (!/^[a-f0-9]{64}$/.test(token)) return antwort(401, { error: 'nicht autorisiert' })
  const url = Deno.env.get('SUPABASE_URL')
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !key) return antwort(503, { error: 'server nicht bereit' })
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  try {
    const { data: erlaubt, error } = await db.rpc('pruefe_aktivitaets_scheduler', { p_token: token })
    if (error) return antwort(503, { error: 'autorisierung nicht pruefbar' })
    if (erlaubt !== true) return antwort(401, { error: 'nicht autorisiert' })
    const schluessel = {
      oeffentlich: Deno.env.get('VAPID_PUBLIC_KEY') ?? '',
      privat: Deno.env.get('VAPID_PRIVATE_KEY') ?? '',
      kontakt: Deno.env.get('VAPID_KONTAKT') ?? '',
    }
    if (Object.values(schluessel).some(w => !w)) return antwort(503, { error: 'push nicht bereit' })
    const zahlen = await versendeAktivitaeten(db, schluessel)
    return antwort(zahlen.fehler ? 502 : 200, zahlen)
  } catch {
    return antwort(503, { error: 'erinnerung konnte nicht verarbeitet werden' })
  }
})
