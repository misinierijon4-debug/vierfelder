import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.112.4'
import { sende } from './webpush.ts'
import type { Abo, VapidSchluessel } from './webpush.ts'
import { lokaleMinute } from './erinnerung.ts'

/** Neue, isolierte Outbox: maximal ein Versandversuch je Art/Person/Tag.
 * Ein Abbruch kann eine Nachricht kosten, aber niemals eine zweite erzeugen.
 * Auch nach einer verlorenen Providerantwort bleibt die Reservierung bestehen.
 */
export type AktivitaetsArt = 'lernen' | 'lesen' | 'wochenblick' | 'partner' | 'wochenrueckblick' | 'wochenbericht' | 'ansage'
export type Kandidat = {
  user_id: string
  art: AktivitaetsArt
  /** Idempotenz: der Berliner Versandtag, ausser bei den Wochenarten der Montag. */
  tag: string
  /** Berliner Tag des aktuellen Worker-Laufs. */
  sendetag: string
  nachricht: string
  url: './' | `./#/eni?woche=${string}` | `./#/bericht?woche=${string}`
}
type Optionen = { senden?: typeof sende; jetzt?: () => Date }

function wochentag(jetzt: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Berlin',
    weekday: 'short',
  }).format(jetzt)
}

function istSonntag(jetzt: Date): boolean {
  return wochentag(jetzt) === 'Sun'
}

/** Die letzte Schranke bleibt im Worker: ein langsamer Lauf darf keine alte
 * Wochen- oder Abendnachricht ausserhalb ihres Berliner Fensters senden. */
function istNochImFenster(kandidat: Kandidat, jetzt: Date): boolean {
  const { minute, tag } = lokaleMinute(jetzt)
  if (kandidat.sendetag !== tag) return false
  if (kandidat.art === 'partner') return minute >= '09:00' && minute < '21:00'
  // Eine Ansage meldet sich am Tag, an dem sie kam, aber niemanden nachts.
  if (kandidat.art === 'ansage') return minute >= '08:00' && minute < '22:00'
  if (kandidat.art === 'wochenrueckblick') {
    return istSonntag(jetzt) && minute >= '20:00' && minute < '22:00'
  }
  // Die Bericht-Meldung faellt am Montag an, sobald keine Nacht mehr nachlaeuft.
  // Nachts weckt sie niemanden: erst ab 07:00 Uhr, und nach 21:00 gar nicht mehr.
  if (kandidat.art === 'wochenbericht') {
    return wochentag(jetzt) === 'Mon' && minute >= '07:00' && minute < '21:00'
  }
  if (kandidat.art === 'wochenblick') {
    return istSonntag(jetzt) && minute >= '18:00' && minute < '19:00'
  }
  if (kandidat.art === 'lernen') {
    return ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].includes(wochentag(jetzt)) &&
      minute >= '18:30' && minute < '20:00'
  }
  return minute >= '20:45' && minute < '22:00'
}

export async function versendeAktivitaeten(db: SupabaseClient, schluessel: VapidSchluessel, optionen: Optionen = {}) {
  const zahlen = { gesendet: 0, uebersprungen: 0, fehler: 0 }
  const jetzt = optionen.jetzt ?? (() => new Date())
  // Kandidaten und Reservierung muessen denselben Zeitpunkt sehen. Danach
  // liest jeder Kandidat noch einmal mit der aktuellen Uhr, bevor ein
  // externer Request beginnt.
  const laufzeitpunkt = jetzt()
  const { data, error } = await db.rpc('aktivitaets_kandidaten', {
    p_jetzt: laufzeitpunkt.toISOString(),
  })
  if (error || !Array.isArray(data)) throw new Error('erinnerungen nicht lesbar')
  for (const k of data as Kandidat[]) {
    const token = crypto.randomUUID()
    const { data: reserviert, error: reservierungsFehler } = await db.rpc('reserviere_aktivitaetsversand', {
      p_user_id: k.user_id, p_art: k.art, p_tag: k.tag, p_token: token,
      p_jetzt: laufzeitpunkt.toISOString(),
    })
    if (reservierungsFehler) { zahlen.fehler++; continue }
    if (reserviert !== true) { zahlen.uebersprungen++; continue }

    async function abschliessen(zustand: string) {
      const { data: bestaetigt, error } = await db.from('aktivitaets_versand')
        .update({ zustand, aktualisiert: new Date().toISOString() })
        .match({ user_id: k.user_id, art: k.art, tag: k.tag, token, zustand: 'reserviert' })
        .select('art').maybeSingle()
      if (error || !bestaetigt) zahlen.fehler++
    }
    // Frisch lesen: Eintrag, Ausschalten, laufende Sitzung und Uhrzeit koennen
    // sich seit der Reservierung geaendert haben. Wochenstand ebenfalls.
    const frischJetzt = jetzt()
    const { data: aktuell, error: pruefFehler } = await db.rpc('aktivitaets_kandidaten', {
      p_jetzt: frischJetzt.toISOString(),
    })
    if (pruefFehler || !Array.isArray(aktuell)) {
      zahlen.fehler++
      await abschliessen('uebersprungen')
      continue
    }
    const frisch = (aktuell as Kandidat[]).find(x =>
      x.user_id === k.user_id && x.art === k.art && x.tag === k.tag &&
      x.sendetag === lokaleMinute(frischJetzt).tag
    )
    if (!frisch || !istNochImFenster(frisch, frischJetzt)) {
      zahlen.uebersprungen++
      await abschliessen('uebersprungen')
      continue
    }
    const { data: abos, error: aboFehler } = await db.from('push_abos')
      .select('endpoint,p256dh,auth').eq('user_id', k.user_id)
    if (aboFehler) {
      zahlen.fehler++
      await abschliessen('uebersprungen')
      continue
    }
    if (!abos?.length) {
      zahlen.uebersprungen++
      await abschliessen('uebersprungen')
      continue
    }
    const nachricht = JSON.stringify({ titel: 'zweikampf', text: frisch.nachricht, tag: k.art, url: frisch.url })
    const ergebnisse = await Promise.all((abos as Abo[]).map(async abo => {
      try {
        // TTL 0: Ein offline befindliches Handy bekommt morgen keinen alten
        // Endspurt und nach 22 Uhr keine nachgelieferte Abend-Erinnerung.
        return await (optionen.senden ?? sende)(abo, nachricht, schluessel, 0)
      } catch { return { status: 0, weg: false, fehler: 'versand unbestaetigt' } }
    }))
    const angekommen = ergebnisse.some(e => !e.weg && e.fehler === null)
    await abschliessen(angekommen ? 'gesendet' : 'unbestaetigt')
    if (angekommen) zahlen.gesendet++
    else zahlen.fehler++
  }
  return zahlen
}
