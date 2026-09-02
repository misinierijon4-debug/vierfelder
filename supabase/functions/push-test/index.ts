import { createClient } from 'npm:@supabase/supabase-js@2'
import { sende } from '../_shared/webpush.ts'
import type { Abo, VapidSchluessel } from '../_shared/webpush.ts'

/**
 * Die Probenachricht: schickt an alle Geraete des Anmeldenden dasselbe, was
 * spaeter die Erinnerungen schicken werden.
 *
 * Sie ist der Grund, warum es diese Function ueberhaupt schon gibt. Push hat
 * fuenf Stellen, an denen es klemmen kann — Erlaubnis, Abo, VAPID-Schluessel,
 * Verschluesselung, Service Worker —, und ein Fehler in einer davon sieht von
 * aussen genau so aus wie ein Fehler in jeder anderen: es kommt nichts an. Ein
 * Knopf, der einmal durch die ganze Kette geht, trennt das auf, bevor die
 * erste echte Erinnerung gebaut wird.
 *
 * Gesendet wird nur an die eigenen Abos. Die Function laeuft mit dem Token des
 * Anmeldenden, nicht mit dem Service-Key — damit entscheidet die
 * Zeilenpolitik von `push_abos`, wen sie erreicht, und nicht dieser Code.
 */

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, content-type, apikey, x-client-info',
  'access-control-allow-methods': 'POST, OPTIONS',
}

const JSON_HEADERS = {
  ...CORS,
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
}

function antwort(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS })
}

type AboZeile = Abo & { geraet: string | null }

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
  if (request.method !== 'POST') return antwort(405, { error: 'nur POST' })

  const url = Deno.env.get('SUPABASE_URL')
  const anon = Deno.env.get('SUPABASE_ANON_KEY')
  const schluessel: VapidSchluessel = {
    oeffentlich: Deno.env.get('VAPID_PUBLIC_KEY') ?? '',
    privat: Deno.env.get('VAPID_PRIVATE_KEY') ?? '',
    kontakt: Deno.env.get('VAPID_KONTAKT') ?? '',
  }

  if (!url || !anon) return antwort(500, { error: 'server ist nicht vollständig konfiguriert' })
  if (!schluessel.oeffentlich || !schluessel.privat || !schluessel.kontakt) {
    return antwort(500, { error: 'vapid-schlüssel fehlen. siehe BENACHRICHTIGUNGEN.md' })
  }

  const autorisierung = request.headers.get('authorization') ?? ''
  if (!autorisierung.toLowerCase().startsWith('bearer ')) {
    return antwort(401, { error: 'nicht angemeldet' })
  }

  // der client traegt das token des anmeldenden. jede abfrage darunter sieht
  // genau das, was die policies diesem konto erlauben.
  const db = createClient(url, anon, {
    global: { headers: { authorization: autorisierung } },
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data: konto, error: kontoFehler } = await db.auth.getUser()
  if (kontoFehler || !konto?.user) return antwort(401, { error: 'nicht angemeldet' })

  const { data, error } = await db.from('push_abos').select('endpoint, p256dh, auth, geraet')
  if (error) return antwort(500, { error: error.message })

  const abos = (data ?? []) as AboZeile[]
  if (abos.length === 0) {
    return antwort(404, { error: 'für dieses konto ist kein gerät angemeldet' })
  }

  const nachricht = JSON.stringify({
    titel: 'zweikampf',
    text: 'probe angekommen. der weg steht.',
    tag: 'probe',
  })

  const ergebnisse = await Promise.all(
    abos.map(async (abo) => {
      try {
        const ergebnis = await sende(abo, nachricht, schluessel)
        return { endpoint: abo.endpoint, geraet: abo.geraet, ...ergebnis }
      } catch (fehler) {
        const text = fehler instanceof Error ? fehler.message : String(fehler)
        return { endpoint: abo.endpoint, geraet: abo.geraet, status: 0, weg: false, fehler: text }
      }
    })
  )

  // karteileichen raeumen: ein abo, das der push-dienst nicht mehr kennt,
  // bleibt sonst ewig stehen und faerbt jeden spaeteren lauf rot.
  const weg = ergebnisse.filter((e) => e.weg).map((e) => e.endpoint)
  if (weg.length > 0) await db.from('push_abos').delete().in('endpoint', weg)

  const gesendet = ergebnisse.filter((e) => !e.weg && e.fehler === null).length
  return antwort(gesendet > 0 ? 200 : 502, {
    gesendet,
    entfernt: weg.length,
    geraete: ergebnisse.map((e) => ({
      geraet: e.geraet,
      status: e.status,
      weg: e.weg,
      fehler: e.fehler,
    })),
  })
})
