import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.112.4'
import { sende } from './webpush.ts'
import type { Abo, VapidSchluessel } from './webpush.ts'
import { lokaleMinute } from './erinnerung.ts'

export type Kandidat = { user_id: string; art: 'lernen' | 'lesen' | 'wochenblick'; tag: string; nachricht: string }
type Optionen = { senden?: typeof sende; jetzt?: () => Date }

/** Neue, isolierte Outbox: maximal ein Versandversuch je Art/Person/Tag.
 * Ein Abbruch kann eine Nachricht kosten, aber niemals eine zweite erzeugen.
 * Auch nach einer verlorenen Providerantwort bleibt die Reservierung bestehen.
 */
export async function versendeAktivitaeten(db: SupabaseClient, schluessel: VapidSchluessel, optionen: Optionen = {}) {
  const zahlen = { gesendet: 0, uebersprungen: 0, fehler: 0 }
  const { data, error } = await db.rpc('aktivitaets_kandidaten')
  if (error || !Array.isArray(data)) throw new Error('erinnerungen nicht lesbar')
  for (const k of data as Kandidat[]) {
    const { data: abos, error: aboFehler } = await db.from('push_abos')
      .select('endpoint,p256dh,auth').eq('user_id', k.user_id)
    if (aboFehler) { zahlen.fehler++; continue }
    if (!abos?.length) { zahlen.uebersprungen++; continue }
    const token = crypto.randomUUID()
    const { data: reserviert, error: reservierungsFehler } = await db.rpc('reserviere_aktivitaetsversand', {
      p_user_id: k.user_id, p_art: k.art, p_tag: k.tag, p_token: token,
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
    const { data: aktuell, error: pruefFehler } = await db.rpc('aktivitaets_kandidaten')
    if (pruefFehler || !Array.isArray(aktuell)) {
      zahlen.fehler++
      await abschliessen('uebersprungen')
      continue
    }
    const frisch = (aktuell as Kandidat[]).find(x => x.user_id === k.user_id && x.art === k.art && x.tag === k.tag)
    const ort = lokaleMinute((optionen.jetzt ?? (() => new Date()))())
    if (!frisch || ort.tag !== k.tag || ort.minute >= '22:00') {
      zahlen.uebersprungen++
      await abschliessen('uebersprungen')
      continue
    }
    const nachricht = JSON.stringify({ titel: 'zweikampf', text: frisch.nachricht, tag: k.art, url: './' })
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
