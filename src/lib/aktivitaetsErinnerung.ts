import { supabase } from './supabase'

export const AKTIVITAETS_ERINNERUNGEN = [
  { art: 'lernen', label: 'lernen', beschreibung: 'mo–fr · 18:30 · wenn noch kein lerneintrag vorliegt' },
  { art: 'lesen', label: 'lesen', beschreibung: 'täglich · 20:45 · wenn noch kein leseeintrag vorliegt' },
  { art: 'wochenblick', label: 'wochenendspurt', beschreibung: 'sonntag · 18:00 · euer aktueller wochenstand' },
  { art: 'partner', label: 'partnerfortschritt', beschreibung: 'täglich · 09:00–21:00 · wenn dein Partner Punkte sammelt oder vorzieht' },
  { art: 'wochenrueckblick', label: 'wochenrückblick', beschreibung: 'sonntag · 20:00 · ENI fasst deine Woche zusammen' },
  { art: 'wochenbericht', label: 'wochenbericht', beschreibung: 'montag · sobald die letzte nacht drin ist · dein bericht ist fertig' },
  { art: 'ansage', label: 'ansagen', beschreibung: 'sofort · 08:00–22:00 · wenn dir jemand eine ansage macht' },
] as const
export type AktivitaetsArt = typeof AKTIVITAETS_ERINNERUNGEN[number]['art']
export type AktivitaetsEinstellungen = Record<`${AktivitaetsArt}_aktiv`, boolean>
const SPALTEN = 'lernen_aktiv,lesen_aktiv,wochenblick_aktiv,partner_aktiv,wochenrueckblick_aktiv,wochenbericht_aktiv,ansage_aktiv'
/** stand vor den ansagen: ohne `ansage_aktiv` */
const SPALTEN_OHNE_ANSAGE = 'lernen_aktiv,lesen_aktiv,wochenblick_aktiv,partner_aktiv,wochenrueckblick_aktiv,wochenbericht_aktiv'
const ALTE_SPALTEN = 'lernen_aktiv,lesen_aktiv,wochenblick_aktiv'
const STANDARD: AktivitaetsEinstellungen = {
  lernen_aktiv: true,
  lesen_aktiv: true,
  wochenblick_aktiv: true,
  partner_aktiv: true,
  wochenrueckblick_aktiv: true,
  wochenbericht_aktiv: true,
  ansage_aktiv: true,
}

const FEHLENDE_SCHEMA_CODES = new Set(['42P01', '42703', '42883', 'PGRST202', 'PGRST204', 'PGRST205'])

function istFehlendesSchema(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const code = (error as { code?: unknown }).code
  return typeof code === 'string' && FEHLENDE_SCHEMA_CODES.has(code)
}

function vervollstaendigeEinstellungen(roh: unknown): AktivitaetsEinstellungen {
  const daten = roh && typeof roh === 'object' ? roh as Record<string, unknown> : {}
  return {
    lernen_aktiv: typeof daten.lernen_aktiv === 'boolean' ? daten.lernen_aktiv : STANDARD.lernen_aktiv,
    lesen_aktiv: typeof daten.lesen_aktiv === 'boolean' ? daten.lesen_aktiv : STANDARD.lesen_aktiv,
    wochenblick_aktiv: typeof daten.wochenblick_aktiv === 'boolean' ? daten.wochenblick_aktiv : STANDARD.wochenblick_aktiv,
    partner_aktiv: typeof daten.partner_aktiv === 'boolean' ? daten.partner_aktiv : STANDARD.partner_aktiv,
    wochenrueckblick_aktiv: typeof daten.wochenrueckblick_aktiv === 'boolean' ? daten.wochenrueckblick_aktiv : STANDARD.wochenrueckblick_aktiv,
    wochenbericht_aktiv: typeof daten.wochenbericht_aktiv === 'boolean' ? daten.wochenbericht_aktiv : STANDARD.wochenbericht_aktiv,
    ansage_aktiv: typeof daten.ansage_aktiv === 'boolean' ? daten.ansage_aktiv : STANDARD.ansage_aktiv,
  }
}

export async function ladeAktivitaetsErinnerungen(): Promise<AktivitaetsEinstellungen | null> {
  if (!supabase) return null
  const aktuelle = await supabase.from('erinnerungs_einstellungen').select(SPALTEN).maybeSingle()
  if (!aktuelle.error) return vervollstaendigeEinstellungen(aktuelle.data)

  // Die UI bleibt auch zwischen App- und Migrations-Release brauchbar: fehlen
  // nur die neuen Spalten, lesen wir den alten Vertrag und setzen die beiden
  // neuen Schalter auf ihren sicheren Standard. Fehlt die Tabelle selbst,
  // bleibt der bisherige Null-Fallback unverändert.
  if (!istFehlendesSchema(aktuelle.error)) {
    throw new Error('erinnerungen konnten nicht geladen werden.')
  }
  // Frontend vor der Ansagen-Migration: die uebrigen Schalter behalten ihren
  // gespeicherten Stand, nur der neue steht auf seinem Standard.
  const ohneAnsage = await supabase.from('erinnerungs_einstellungen').select(SPALTEN_OHNE_ANSAGE).maybeSingle()
  if (!ohneAnsage.error) return vervollstaendigeEinstellungen(ohneAnsage.data)
  if (!istFehlendesSchema(ohneAnsage.error)) throw new Error('erinnerungen konnten nicht geladen werden.')
  const alte = await supabase.from('erinnerungs_einstellungen').select(ALTE_SPALTEN).maybeSingle()
  if (alte.error && istFehlendesSchema(alte.error)) return null
  if (alte.error) throw new Error('erinnerungen konnten nicht geladen werden.')
  return vervollstaendigeEinstellungen(alte.data)
}

export async function setzeAktivitaetsErinnerung(art: AktivitaetsArt, aktiv: boolean): Promise<void> {
  const db = supabase
  if (!db) throw new Error('kein konto')
  if (!AKTIVITAETS_ERINNERUNGEN.some(e => e.art === art)) throw new Error('unbekannte erinnerung')
  const { data, error } = await db.auth.getSession()
  const userId = data.session?.user.id
  if (error || !userId) throw new Error('bitte melde dich erneut an.')
  const spalte = `${art}_aktiv` as const
  const aktualisiert = new Date().toISOString()
  const { data: zeile, error: fehler } = await db.from('erinnerungs_einstellungen')
    .upsert({ user_id: userId, [spalte]: aktiv, aktualisiert }, { onConflict: 'user_id' })
    .select(`user_id,${spalte},aktualisiert`).maybeSingle()
  const bestaetigt = zeile as Record<string, unknown> | null
  if (fehler || !bestaetigt || bestaetigt.user_id !== userId || bestaetigt[spalte] !== aktiv ||
      Date.parse(String(bestaetigt.aktualisiert)) !== Date.parse(aktualisiert)) {
    throw new Error('änderung konnte nicht bestätigt werden. bitte erneut versuchen.')
  }
}
