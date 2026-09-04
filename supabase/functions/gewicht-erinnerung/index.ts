import { createClient } from 'npm:@supabase/supabase-js@2.112.4'
import { istFaellig, lokaleMinute } from '../_shared/erinnerung.ts'
import { versende } from '../_shared/versand.ts'
import type { VapidSchluessel } from '../_shared/webpush.ts'

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

  if (error) return antwort(500, { error: 'erinnerungen konnten nicht gelesen werden' })

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
  if (gewichtFehler) return antwort(500, { error: 'gewichtstatus konnte nicht gelesen werden' })

  const erledigt = new Set((gewogen ?? []).map((zeile) => zeile.user_id as string))
  const offen = faellige.filter((e) => !erledigt.has(e.user_id)).map((e) => e.user_id)

  const zahlen = await versende(
    db,
    'gewicht',
    ort.tag,
    offen,
    {
      titel: 'zweikampf',
      text: 'heute noch nicht gewogen.',
      tag: 'gewicht',
      url: './',
    },
    schluessel
  )
  zahlen.uebersprungen += faellige.length - offen.length

  console.log(
    `gewicht-erinnerung ${ort.tag} ${ort.minute}: ${zahlen.gesendet} gesendet, ` +
      `${zahlen.uebersprungen} uebersprungen, ${zahlen.entfernt} abos entfernt, ${zahlen.fehler} fehler`
  )
  return antwort(zahlen.fehler > 0 && zahlen.gesendet === 0 ? 502 : 200, {
    tag: ort.tag,
    geprueft: faellige.length,
    ...zahlen,
  })
})
