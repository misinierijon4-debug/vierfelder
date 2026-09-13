import { supabase } from './supabase'
import { istEniWochenbeginn } from './eniRoute'

/** Eine noch nicht bestaetigte Einladung fuer den ENI-Wochenrueckblick. */
export type WochenEinladung = {
  wochenbeginn: string
  faellig_am: string
  geschlossen_am: null | string
  erstellt: string
}

const FEHLER_FEHLENDES_SCHEMA =
  'der wochenrückblick ist noch nicht eingerichtet.'
const FEHLER_NICHT_BESTAETIGT =
  'die woche konnte nicht bestätigt geschlossen werden. bitte versuche es erneut.'
const FEHLENDE_SCHEMA_CODES = new Set([
  '42P01',
  '42703',
  '42883',
  'PGRST202',
  'PGRST204',
  'PGRST205',
])

function fehlercode(error: unknown): string | undefined {
  if (!error || typeof error !== 'object') return undefined
  const code = (error as { code?: unknown }).code
  return typeof code === 'string' ? code : undefined
}

export function istFehlendesWochenEinladungSchema(error: unknown): boolean {
  return FEHLENDE_SCHEMA_CODES.has(fehlercode(error) ?? '')
}

function istIsoZeitpunkt(wert: unknown): wert is string {
  return typeof wert === 'string' && Number.isFinite(Date.parse(wert))
}

function zeileZuEinladung(roh: unknown): WochenEinladung | null {
  if (!roh || typeof roh !== 'object' || Array.isArray(roh)) return null
  const zeile = roh as Record<string, unknown>
  const wochenbeginn = zeile.wochenbeginn
  const faelligAm = zeile.faellig_am
  const geschlossenAm = zeile.geschlossen_am
  const erstellt = zeile.erstellt
  if (
    !istEniWochenbeginn(wochenbeginn)
    || !istIsoZeitpunkt(faelligAm)
    || (geschlossenAm !== null && !istIsoZeitpunkt(geschlossenAm))
    || !istIsoZeitpunkt(erstellt)
  ) return null
  return {
    wochenbeginn,
    faellig_am: faelligAm,
    geschlossen_am: geschlossenAm,
    erstellt,
  }
}

export function sortiereWochenEinladungen(
  einladungen: readonly WochenEinladung[],
): WochenEinladung[] {
  return [...einladungen].sort((a, b) => (
    a.wochenbeginn.localeCompare(b.wochenbeginn)
    || a.erstellt.localeCompare(b.erstellt)
  ))
}

/** Serverautoritative RPC: liefert nur eigene, offene Einladungen. */
export async function ladeEniWochenEinladungen(): Promise<WochenEinladung[]> {
  const db = supabase
  if (!db) return []
  const { data, error } = await db.rpc('hole_eni_wochen_einladungen')
  if (error) {
    // Der Client darf waehrend des additiven Migrationsfensters nicht ausfallen.
    if (istFehlendesWochenEinladungSchema(error)) return []
    throw new Error('wochenrückblick konnte nicht geladen werden.')
  }
  if (data === null || data === undefined) return []
  if (!Array.isArray(data)) throw new Error('wochenrückblick lieferte ungültige daten.')
  return sortiereWochenEinladungen(
    data
      .map(zeileZuEinladung)
      .filter((einladung): einladung is WochenEinladung => einladung !== null)
      .filter((einladung) => einladung.geschlossen_am === null),
  )
}

/**
 * Schliessen gilt erst, wenn die RPC dieselbe Woche mit einem echten
 * `geschlossen_am` zurueckgibt. Ein leerer oder fremder Treffer bleibt ein
 * sichtbarer Fehler und darf die Einladung nicht verschwinden lassen.
 */
export async function schliesseEniWochenEinladung(
  wochenbeginn: string,
): Promise<WochenEinladung | null> {
  if (!istEniWochenbeginn(wochenbeginn)) throw new Error('ungueltiger wochenbeginn')
  const db = supabase
  if (!db) throw new Error('kein konto')
  const { data, error } = await db.rpc('schliesse_eni_wochen_einladung', {
    p_wochenbeginn: wochenbeginn,
  })
  if (error) {
    if (istFehlendesWochenEinladungSchema(error)) throw new Error(FEHLER_FEHLENDES_SCHEMA)
    throw new Error('wochenrückblick konnte nicht geschlossen werden.')
  }
  if (data === null || data === undefined) return null
  const kandidaten = Array.isArray(data) ? data : [data]
  if (kandidaten.length === 0) return null
  const bestaetigt = zeileZuEinladung(kandidaten[0])
  if (
    !bestaetigt
    || bestaetigt.wochenbeginn !== wochenbeginn
    || bestaetigt.geschlossen_am === null
  ) throw new Error(FEHLER_NICHT_BESTAETIGT)
  return bestaetigt
}

// Kuerzere Aliase erleichtern die Verwendung in kleinen Boundary-Komponenten
// und bleiben als oeffentlicher Vertrag neben den ausformulierten Namen stabil.
export const ladeWochenEinladungen = ladeEniWochenEinladungen
export const schliesseWochenEinladung = schliesseEniWochenEinladung

export type EniWochenChat = {
  id: string
  titel: string
  zuletzt: string
  wochenbeginn: string
}

export async function oeffneEniWochenchat(
  wochenbeginn: string,
): Promise<EniWochenChat | null> {
  if (!istEniWochenbeginn(wochenbeginn)) throw new Error('ungueltiger wochenbeginn')
  const db = supabase
  if (!db) throw new Error('kein konto')
  const { data, error } = await db.rpc('oeffne_eni_wochenchat', {
    p_wochenbeginn: wochenbeginn,
  })
  if (error) {
    if (istFehlendesWochenEinladungSchema(error)) return null
    throw new Error('wochenchat konnte nicht geöffnet werden.')
  }
  if (data === null || data === undefined) return null
  const zeilen = Array.isArray(data) ? data : [data]
  if (zeilen.length === 0) return null
  const zeile = zeilen[0] as Record<string, unknown>
  return {
    id: String(zeile.id),
    titel: String(zeile.titel),
    zuletzt: String(zeile.zuletzt),
    wochenbeginn: String(zeile.wochenbeginn),
  }
}

export const oeffneWochenchat = oeffneEniWochenchat

export const WOCHEN_EINLADUNG_FEHLER = {
  FEHLENDES_SCHEMA: FEHLER_FEHLENDES_SCHEMA,
  NICHT_BESTAETIGT: FEHLER_NICHT_BESTAETIGT,
} as const
