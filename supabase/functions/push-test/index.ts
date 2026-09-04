import { createClient } from 'npm:@supabase/supabase-js@2.112.4'
import { pushDienst } from '../_shared/pushEndpoint.ts'
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

type AboZeile = Abo

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
    return antwort(401, { error: 'ohne anmeldung aufgerufen' })
  }
  // der client traegt das token des anmeldenden. jede abfrage darunter sieht
  // genau das, was die policies diesem konto erlauben.
  const db = createClient(url, anon, {
    global: { headers: { authorization: autorisierung } },
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data, error } = await db.from('push_abos').select('endpoint, p256dh, auth')
  if (error) return antwort(500, { error: 'push-abos konnten nicht gelesen werden' })

  const abos = (data ?? []) as AboZeile[]
  if (abos.length === 0) {
    return antwort(404, { error: 'für dieses konto ist kein gerät angemeldet' })
  }

  const nachricht = JSON.stringify({
    titel: 'zweikampf',
    text: 'probe angekommen. der weg steht.',
    tag: 'probe',
  })

  // die function hat lange gar nichts geschrieben. eine probe, die im stillen
  // scheitert, ist genau das problem, gegen das sie gebaut ist: von aussen sieht
  // ein fehler beim senden aus wie ein fehler bei der erlaubnis. jede zeile hier
  // steht in den logs des projekts und beantwortet die frage "wie weit kam sie".
  console.log(`probe: ${abos.length} gerät(e) für das angemeldete konto`)

  const ergebnisse = await Promise.all(
    abos.map(async (abo, index) => {
      const nummer = index + 1
      let dienst = 'unbekannt'
      try {
        dienst = pushDienst(abo.endpoint)
      } catch {
        // `sende` lehnt denselben Endpunkt sicher ab. Der neutrale Wert ist
        // nur fuer die Diagnose ohne Preisgabe der Adresse gedacht.
      }
      try {
        const ergebnis = await sende(abo, nachricht, schluessel)
        console.log(
          `push-abo ${nummer} über ${dienst}: status ${ergebnis.status}` +
            `${ergebnis.weg ? ' (abo weg)' : ''}${ergebnis.fehler ? ` — ${ergebnis.fehler}` : ''}`
        )
        return { endpoint: abo.endpoint, nummer, dienst, ...ergebnis }
      } catch {
        console.error(`push-abo ${nummer} über ${dienst}: versand abgelehnt`)
        return {
          endpoint: abo.endpoint,
          nummer,
          dienst,
          status: 0,
          weg: false,
          fehler: 'push konnte nicht gesendet werden',
        }
      }
    })
  )

  // karteileichen raeumen: ein abo, das der push-dienst nicht mehr kennt,
  // bleibt sonst ewig stehen und faerbt jeden spaeteren lauf rot.
  const weg = ergebnisse.filter((e) => e.weg).map((e) => e.endpoint)
  let entfernt = 0
  if (weg.length > 0) {
    const loeschen = await db
      .from('push_abos')
      .delete()
      .in('endpoint', weg)
      .select('endpoint')
    entfernt = loeschen.data?.length ?? 0
    if (loeschen.error || entfernt !== weg.length) {
      console.error('probe: alte push-abos konnten nicht vollständig entfernt werden')
    }
  }

  const gesendet = ergebnisse.filter((e) => !e.weg && e.fehler === null).length
  console.log(`probe fertig: ${gesendet} gesendet, ${entfernt} entfernt`)
  return antwort(gesendet > 0 ? 200 : 502, {
    gesendet,
    entfernt,
    geraete: ergebnisse.map((e) => ({
      nummer: e.nummer,
      dienst: e.dienst,
      status: e.status,
      weg: e.weg,
      fehler: e.fehler,
    })),
  })
})
