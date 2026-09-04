import { createClient } from 'npm:@supabase/supabase-js@2.112.4'
import { istFaellig, lokaleMinute } from '../_shared/erinnerung.ts'
import { versende } from '../_shared/versand.ts'
import type { VapidSchluessel } from '../_shared/webpush.ts'

/**
 * Schickt „schlaf von heute nacht fehlt.“ genau dann, wenn die persoenliche
 * Uhrzeit erreicht ist und fuer die vergangene Nacht keine Zeile in
 * `schlafnaechte` steht.
 *
 * Der Grund fuer diese Erinnerung ist ein beobachteter stiller Ausfall: Der
 * automatische Kurzbefehl erreichte Supabase an zwei Tagen gar nicht. Ob die
 * Automation nicht startete, Health keine Segmente lieferte oder der
 * Netzaufruf scheiterte, kann diese Function nicht feststellen. Sie behauptet
 * deshalb keine Ursache, sondern macht nur den fehlenden Import sichtbar.
 *
 * Eine Nacht traegt das Datum des Morgens, an dem sie endet. Geprueft wird
 * deshalb `nacht = heute` nach deutscher Ortszeit.
 *
 * Wie bei der Gewichtserinnerung kommt der Aufruf alle fuenf Minuten von
 * pg_cron und enthaelt weder Datum noch Nutzer noch Text.
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
  schlaf_zeit: string
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
    .select('user_id, schlaf_zeit')
    .eq('schlaf_aktiv', true)

  if (error) return antwort(500, { error: 'erinnerungen konnten nicht gelesen werden' })

  const faellige = ((data ?? []) as Einstellung[]).filter((e) =>
    istFaellig(ort.minute, e.schlaf_zeit)
  )
  if (faellige.length === 0) {
    return antwort(200, { tag: ort.tag, geprueft: 0, gesendet: 0, uebersprungen: 0 })
  }

  const ids = faellige.map((e) => e.user_id)
  const { data: naechte, error: schlafFehler } = await db
    .from('schlafnaechte')
    .select('user_id')
    .eq('nacht', ort.tag)
    .in('user_id', ids)
  if (schlafFehler) return antwort(500, { error: 'schlafstatus konnte nicht gelesen werden' })

  const erledigt = new Set((naechte ?? []).map((zeile) => zeile.user_id as string))
  const offen = faellige.filter((e) => !erledigt.has(e.user_id)).map((e) => e.user_id)

  const zahlen = await versende(
    db,
    'schlaf',
    ort.tag,
    offen,
    {
      titel: 'zweikampf',
      text: 'schlaf von heute nacht fehlt.',
      tag: 'schlaf',
      url: './',
    },
    schluessel
  )
  zahlen.uebersprungen += faellige.length - offen.length

  console.log(
    `schlaf-erinnerung ${ort.tag} ${ort.minute}: ${zahlen.gesendet} gesendet, ` +
      `${zahlen.uebersprungen} uebersprungen, ${zahlen.entfernt} abos entfernt, ${zahlen.fehler} fehler`
  )
  return antwort(zahlen.fehler > 0 && zahlen.gesendet === 0 ? 502 : 200, {
    tag: ort.tag,
    geprueft: faellige.length,
    ...zahlen,
  })
})
