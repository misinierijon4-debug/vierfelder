import { supabase } from './supabase'

export const AKTIVITAETS_ERINNERUNGEN = [
  { art: 'lernen', label: 'lernen', beschreibung: 'mo–fr · 18:30 · wenn noch kein lerneintrag vorliegt' },
  { art: 'lesen', label: 'lesen', beschreibung: 'täglich · 20:45 · wenn noch kein leseeintrag vorliegt' },
  { art: 'wochenblick', label: 'wochenendspurt', beschreibung: 'sonntag · 18:00 · euer aktueller wochenstand' },
] as const
export type AktivitaetsArt = typeof AKTIVITAETS_ERINNERUNGEN[number]['art']
export type AktivitaetsEinstellungen = Record<`${AktivitaetsArt}_aktiv`, boolean>
const SPALTEN = 'lernen_aktiv,lesen_aktiv,wochenblick_aktiv'
const STANDARD: AktivitaetsEinstellungen = { lernen_aktiv: true, lesen_aktiv: true, wochenblick_aktiv: true }

export async function ladeAktivitaetsErinnerungen(): Promise<AktivitaetsEinstellungen | null> {
  if (!supabase) return null
  const { data, error } = await supabase.from('erinnerungs_einstellungen').select(SPALTEN).maybeSingle()
  if (error && ['42P01', '42703', 'PGRST204', 'PGRST205'].includes(error.code)) return null
  if (error) throw new Error('erinnerungen konnten nicht geladen werden.')
  return data as AktivitaetsEinstellungen | null ?? STANDARD
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
