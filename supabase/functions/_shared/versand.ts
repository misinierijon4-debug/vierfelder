import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { sende } from './webpush.ts'
import type { Abo, VapidSchluessel } from './webpush.ts'

/**
 * Der gemeinsame Versandweg aller Erinnerungen.
 *
 * Jede Erinnerung entscheidet selbst, wer heute offen ist. Was danach kommt —
 * Abos holen, im Versandbuch reservieren, verschluesselt zustellen, tote Abos
 * wegraeumen — ist fuer Gewicht und Schlaf dasselbe und steht deshalb nur
 * einmal hier. Die Reihenfolge ist wichtig: erst reservieren, dann senden.
 * Ein zweiter Lauf trifft den Primaerschluessel des Versandbuchs und
 * ueberspringt die Person, bevor eine zweite Nachricht entstehen kann.
 */

export type AboZeile = Abo & { endpoint: string; geraet: string | null }

export type Nachricht = {
  titel: string
  text: string
  tag: string
  url: string
}

export type VersandZahlen = {
  gesendet: number
  uebersprungen: number
  entfernt: number
  fehler: number
}

export async function versende(
  db: SupabaseClient,
  art: string,
  tag: string,
  offen: string[],
  nachricht: Nachricht,
  schluessel: VapidSchluessel
): Promise<VersandZahlen> {
  const zahlen: VersandZahlen = { gesendet: 0, uebersprungen: 0, entfernt: 0, fehler: 0 }
  const nutzlast = JSON.stringify(nachricht)

  for (const userId of offen) {
    const { data: aboDaten, error: aboFehler } = await db
      .from('push_abos')
      .select('endpoint, p256dh, auth, geraet')
      .eq('user_id', userId)
    if (aboFehler) {
      console.error(`${art}-erinnerung: abos konnten nicht gelesen werden: ${aboFehler.message}`)
      zahlen.fehler += 1
      continue
    }

    const abos = (aboDaten ?? []) as AboZeile[]
    if (abos.length === 0) {
      zahlen.uebersprungen += 1
      continue
    }

    const reservierung = await db.from('erinnerungs_versand').insert({ user_id: userId, art, tag })
    if (reservierung.error?.code === '23505') {
      zahlen.uebersprungen += 1
      continue
    }
    if (reservierung.error) {
      console.error(`${art}-erinnerung: reservierung fehlgeschlagen: ${reservierung.error.message}`)
      zahlen.fehler += 1
      continue
    }

    const ergebnisse = await Promise.all(
      abos.map(async (abo) => {
        try {
          return { endpoint: abo.endpoint, ...(await sende(abo, nutzlast, schluessel)) }
        } catch (ursache) {
          const text = ursache instanceof Error ? ursache.message : String(ursache)
          return { endpoint: abo.endpoint, status: 0, weg: false, fehler: text }
        }
      })
    )

    const weg = ergebnisse.filter((e) => e.weg).map((e) => e.endpoint)
    if (weg.length > 0) {
      const loeschen = await db.from('push_abos').delete().in('endpoint', weg)
      if (loeschen.error) console.error(`${art}-erinnerung: alte abos: ${loeschen.error.message}`)
      else zahlen.entfernt += weg.length
    }

    const angenommen = ergebnisse.filter((e) => !e.weg && e.fehler === null).length
    if (angenommen > 0) {
      const markieren = await db
        .from('erinnerungs_versand')
        .update({ gesendet: new Date().toISOString() })
        .match({ user_id: userId, art, tag })
      if (markieren.error) {
        console.error(`${art}-erinnerung: versandbuch: ${markieren.error.message}`)
        zahlen.fehler += 1
      }
      zahlen.gesendet += angenommen
    } else {
      // Kein Push-Dienst nahm die Nachricht an. Die Reservierung wird frei,
      // damit der naechste Cron-Lauf einen voruebergehenden Fehler erneut probiert.
      await db.from('erinnerungs_versand').delete().match({ user_id: userId, art, tag })
      zahlen.fehler += 1
    }
  }

  return zahlen
}
