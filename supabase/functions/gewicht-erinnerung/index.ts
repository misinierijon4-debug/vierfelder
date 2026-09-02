import { createClient } from 'npm:@supabase/supabase-js@2'
import { istFaellig, lokaleMinute } from '../_shared/erinnerung.ts'
import { sende } from '../_shared/webpush.ts'
import type { Abo, VapidSchluessel } from '../_shared/webpush.ts'

/**
 * Schickt „heute noch nicht gewogen.“ genau dann, wenn die persoenliche
 * Uhrzeit erreicht ist und fuer den lokalen Tag noch keine Messung existiert.
 *
 * Der Aufruf kommt alle fuenf Minuten von pg_cron. Er enthaelt absichtlich
 * weder Datum noch Nutzer noch Text: niemand kann die Function mit einem
 * anderen Tag oder einer anderen Nachricht fuettern. Das Versandbuch macht
 * auch wiederholte oder parallele Aufrufe zu hoechstens einer Nachricht.
 */

const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
}

function antwort(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS })
}

type Einstellung = {
  user_id: string
  gewicht_zeit: string
}

type AboZeile = Abo & { endpoint: string; geraet: string | null }

Deno.serve(async (request) => {
  if (request.method !== 'POST') return antwort(405, { error: 'nur POST' })

  const url = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const schluessel: VapidSchluessel = {
    oeffentlich: Deno.env.get('VAPID_PUBLIC_KEY') ?? '',
    privat: Deno.env.get('VAPID_PRIVATE_KEY') ?? '',
    kontakt: Deno.env.get('VAPID_KONTAKT') ?? '',
  }
  if (!url || !serviceKey) {
    return antwort(500, { error: 'server ist nicht vollständig konfiguriert' })
  }
  if (!schluessel.oeffentlich || !schluessel.privat || !schluessel.kontakt) {
    return antwort(500, { error: 'vapid-schlüssel fehlen' })
  }

  const db = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const ort = lokaleMinute(new Date())
  const { data, error } = await db
    .from('erinnerungs_einstellungen')
    .select('user_id, gewicht_zeit')
    .eq('gewicht_aktiv', true)

  if (error) return antwort(500, { error: error.message })

  const faellige = ((data ?? []) as Einstellung[]).filter((e) =>
    istFaellig(ort.minute, e.gewicht_zeit)
  )
  if (faellige.length === 0) {
    return antwort(200, { tag: ort.tag, geprueft: 0, gesendet: 0, uebersprungen: 0 })
  }

  const ids = faellige.map((e) => e.user_id)
  const { data: gewogen, error: gewichtFehler } = await db
    .from('gewicht')
    .select('user_id')
    .eq('tag', ort.tag)
    .in('user_id', ids)
  if (gewichtFehler) return antwort(500, { error: gewichtFehler.message })

  const erledigt = new Set((gewogen ?? []).map((zeile) => zeile.user_id as string))
  const offen = faellige.filter((e) => !erledigt.has(e.user_id))
  let gesendet = 0
  let uebersprungen = faellige.length - offen.length
  let entfernt = 0
  let fehler = 0

  const nachricht = JSON.stringify({
    titel: 'zweikampf',
    text: 'heute noch nicht gewogen.',
    tag: 'gewicht',
    url: './',
  })

  for (const einstellung of offen) {
    const { data: aboDaten, error: aboFehler } = await db
      .from('push_abos')
      .select('endpoint, p256dh, auth, geraet')
      .eq('user_id', einstellung.user_id)
    if (aboFehler) {
      console.error(`gewicht-erinnerung: abos konnten nicht gelesen werden: ${aboFehler.message}`)
      fehler += 1
      continue
    }

    const abos = (aboDaten ?? []) as AboZeile[]
    if (abos.length === 0) {
      uebersprungen += 1
      continue
    }

    // Erst reservieren, dann senden. Ein zweiter Lauf trifft den Primaerschluessel
    // und ueberspringt die Person, bevor eine zweite Nachricht entstehen kann.
    const reservierung = await db.from('erinnerungs_versand').insert({
      user_id: einstellung.user_id,
      art: 'gewicht',
      tag: ort.tag,
    })
    if (reservierung.error?.code === '23505') {
      uebersprungen += 1
      continue
    }
    if (reservierung.error) {
      console.error(`gewicht-erinnerung: reservierung fehlgeschlagen: ${reservierung.error.message}`)
      fehler += 1
      continue
    }

    const ergebnisse = await Promise.all(
      abos.map(async (abo) => {
        try {
          return { endpoint: abo.endpoint, ...(await sende(abo, nachricht, schluessel)) }
        } catch (ursache) {
          const text = ursache instanceof Error ? ursache.message : String(ursache)
          return { endpoint: abo.endpoint, status: 0, weg: false, fehler: text }
        }
      })
    )

    const weg = ergebnisse.filter((e) => e.weg).map((e) => e.endpoint)
    if (weg.length > 0) {
      const loeschen = await db.from('push_abos').delete().in('endpoint', weg)
      if (loeschen.error) console.error(`gewicht-erinnerung: alte abos: ${loeschen.error.message}`)
      else entfernt += weg.length
    }

    const angenommen = ergebnisse.filter((e) => !e.weg && e.fehler === null).length
    if (angenommen > 0) {
      const markieren = await db
        .from('erinnerungs_versand')
        .update({ gesendet: new Date().toISOString() })
        .match({ user_id: einstellung.user_id, art: 'gewicht', tag: ort.tag })
      if (markieren.error) {
        console.error(`gewicht-erinnerung: versandbuch: ${markieren.error.message}`)
        fehler += 1
      }
      gesendet += angenommen
    } else {
      // Kein Push-Dienst nahm die Nachricht an. Die Reservierung wird frei,
      // damit der naechste Cron-Lauf einen voruebergehenden Fehler erneut probiert.
      await db
        .from('erinnerungs_versand')
        .delete()
        .match({ user_id: einstellung.user_id, art: 'gewicht', tag: ort.tag })
      fehler += 1
    }
  }

  console.log(
    `gewicht-erinnerung ${ort.tag} ${ort.minute}: ${gesendet} gesendet, ` +
      `${uebersprungen} uebersprungen, ${entfernt} abos entfernt, ${fehler} fehler`
  )
  return antwort(fehler > 0 && gesendet === 0 ? 502 : 200, {
    tag: ort.tag,
    geprueft: faellige.length,
    gesendet,
    uebersprungen,
    entfernt,
    fehler,
  })
})
