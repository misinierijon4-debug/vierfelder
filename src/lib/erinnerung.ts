import { supabase } from './supabase'

export const STANDARD_ERINNERUNGSZEIT = '20:00'

type Einstellungszeile = { gewicht_zeit: string }
type Einstellungsbestaetigung = Einstellungszeile & {
  user_id: string
  gewicht_aktiv: boolean
  aktualisiert: string
}

const ANMELDUNG_NICHT_PRUEFBAR =
  'die anmeldung konnte nicht geprüft werden. bitte versuche es erneut.'
const ERINNERUNGSZEIT_UNBESTAETIGT =
  'die erinnerungszeit konnte nicht bestätigt werden. bitte versuche es erneut.'

function tabelleFehlt(code?: string): boolean {
  return code === '42P01' || code === 'PGRST205'
}

/** Die eigene Uhrzeit; null solange das neue Schema noch nicht veroeffentlicht ist. */
export async function ladeGewichtErinnerungszeit(): Promise<string | null> {
  if (!supabase) return null
  const { data, error } = await supabase
    .from('erinnerungs_einstellungen')
    .select('gewicht_zeit')
    .maybeSingle()
  if (error && tabelleFehlt(error.code)) return null
  if (error) throw new Error(error.message)
  return ((data as Einstellungszeile | null)?.gewicht_zeit ?? STANDARD_ERINNERUNGSZEIT).slice(0, 5)
}

export function istErlaubteErinnerungszeit(zeit: string): boolean {
  return /^\d{2}:\d{2}$/.test(zeit) && zeit >= '06:00' && zeit < '22:00'
}

function minuteAusDatenbank(zeit: string): string | null {
  // `time without time zone` kommt gewoehnlich als HH:MM:SS. Nur exakt null
  // Sekunden sind derselbe gespeicherte Wert wie die minutengenaue Eingabe.
  return /^(\d{2}:\d{2})(?::00(?:\.0+)?)?$/.exec(zeit)?.[1] ?? null
}

/** RLS laesst den Upsert ausschliesslich fuer das angemeldete Konto zu. */
export async function setzeGewichtErinnerungszeit(zeit: string): Promise<void> {
  const db = supabase
  if (!db) throw new Error('kein konto')
  if (!istErlaubteErinnerungszeit(zeit)) {
    throw new Error('die uhrzeit muss zwischen 06:00 und 21:59 liegen.')
  }
  const { data, error: sitzungsfehler } = await db.auth.getSession()
  if (sitzungsfehler) throw new Error(ANMELDUNG_NICHT_PRUEFBAR)
  const userId = data.session?.user.id
  if (!userId) throw new Error('die anmeldung ist abgelaufen. melde dich neu an.')

  const aktualisiert = new Date().toISOString()
  const erwartet = {
    user_id: userId,
    gewicht_aktiv: true,
    gewicht_zeit: zeit,
    aktualisiert,
  }
  const { data: bestaetigt, error } = await db
    .from('erinnerungs_einstellungen')
    .upsert(erwartet, { onConflict: 'user_id' })
    .select('user_id,gewicht_aktiv,gewicht_zeit,aktualisiert')
    .maybeSingle()
  if (error) throw new Error(ERINNERUNGSZEIT_UNBESTAETIGT)

  const zeile = bestaetigt as Einstellungsbestaetigung | null
  const bestaetigteZeit = typeof zeile?.gewicht_zeit === 'string'
    ? minuteAusDatenbank(zeile.gewicht_zeit)
    : null
  const bestaetigterZeitpunkt = typeof zeile?.aktualisiert === 'string'
    ? Date.parse(zeile.aktualisiert)
    : Number.NaN
  if (
    !zeile ||
    zeile.user_id !== userId ||
    zeile.gewicht_aktiv !== true ||
    bestaetigteZeit !== zeit ||
    !Number.isFinite(bestaetigterZeitpunkt) ||
    bestaetigterZeitpunkt !== Date.parse(aktualisiert)
  ) {
    // Ein fehlerloser Nulltreffer ist bei RLS moeglich. Erst die exakt
    // zurueckgegebene Zeile beweist, dass der neue Zustand wirklich gilt.
    throw new Error(ERINNERUNGSZEIT_UNBESTAETIGT)
  }
}
