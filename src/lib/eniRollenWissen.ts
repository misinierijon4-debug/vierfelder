import { supabase } from './supabase'
import { fortschritt, type Schritt } from '../../supabase/functions/_shared/eniRecherche'
import type { EniRolle } from './eniEinstellungen'

/**
 * Die Recherche zu einer Rolle, von der App aus gesehen: starten, zusehen,
 * die fertige Akte lesen, bearbeiten und löschen.
 *
 * Die Arbeit selbst macht der Server (`eni-recherche`, jede Minute per Cron).
 * Solange „ENI anpassen“ offen ist, stößt die App ihn zusätzlich an, sobald
 * die Recherche frei ist — dann geht es schneller, und wer die App schließt,
 * verliert trotzdem nichts.
 *
 * Ohne Supabase gibt es keine Recherche: sie braucht die Schlüssel des
 * Servers. Der Prototyp zeigt das, statt eine Akte vorzutäuschen.
 */

export type RechercheStatus = 'laeuft' | 'fertig' | 'fehler' | 'abgebrochen'

export type RollenAkteStand = {
  rolleId: string
  name: string
  status: RechercheStatus
  schritte: Schritt[]
  akte: string
  akteName: string
  quellen: number
  fehler: string | null
  gesperrtBis: string | null
  fertigAm: string | null
}

export type RechercheApi = {
  verfuegbar: boolean
  laden(): Promise<RollenAkteStand[]>
  starten(rolle: EniRolle): Promise<void>
  abbrechen(rolleId: string): Promise<void>
  anstossen(): Promise<void>
  speichern(rolleId: string, akte: string): Promise<void>
  loeschen(rolleId: string): Promise<void>
}

const SPALTEN = 'rolle_id,name,status,schritte,akte,akte_name,quellen,fehler,gesperrt_bis,fertig_am'

function fehlertext(code: string | undefined, meldung: string): string {
  // PGRST205: PostgREST kennt die tabelle nicht. 42P01: PostgreSQL auch nicht.
  if (code === 'PGRST205' || code === '42P01' || code === 'PGRST202')
    return 'Die Recherche ist in dieser Umgebung noch nicht angelegt. Die Migration eni_rollen_wissen fehlt in der Datenbank.'
  if (code === '42501' || code === 'PGRST301') return 'Kein Zugriff auf die Recherche. Melde dich neu an.'
  if (code === '54000') return 'Es laufen schon drei Recherchen. Warte, bis eine fertig ist.'
  return `Die Recherche ist gerade nicht erreichbar: ${meldung}`
}

function db() {
  if (!supabase) throw new Error('Die Recherche braucht eine Anmeldung.')
  return supabase
}

const STATUS: RechercheStatus[] = ['laeuft', 'fertig', 'fehler', 'abgebrochen']

export function ausZeile(zeile: Record<string, unknown>): RollenAkteStand {
  const text = (wert: unknown) => (typeof wert === 'string' ? wert : '')
  return {
    rolleId: text(zeile.rolle_id),
    name: text(zeile.name),
    status: STATUS.includes(zeile.status as RechercheStatus) ? (zeile.status as RechercheStatus) : 'fehler',
    schritte: Array.isArray(zeile.schritte) ? (zeile.schritte as Schritt[]) : [],
    akte: text(zeile.akte),
    akteName: text(zeile.akte_name),
    quellen: Array.isArray(zeile.quellen) ? zeile.quellen.length : 0,
    fehler: typeof zeile.fehler === 'string' ? zeile.fehler : null,
    gesperrtBis: typeof zeile.gesperrt_bis === 'string' ? zeile.gesperrt_bis : null,
    fertigAm: typeof zeile.fertig_am === 'string' ? zeile.fertig_am : null,
  }
}

/** worauf die recherche achten soll: thema und anweisung der rolle */
export function auftragVon(rolle: EniRolle): string {
  return [rolle.thema.trim() && `Thema: ${rolle.thema.trim()}`, rolle.anweisung.trim()]
    .filter(Boolean)
    .join('\n')
    .slice(0, 1400)
}

export const RECHERCHE: RechercheApi = {
  verfuegbar: supabase !== null,
  async laden() {
    if (!supabase) return []
    const { data, error } = await supabase.from('eni_rollen_wissen').select(SPALTEN)
    if (error) throw new Error(fehlertext(error.code, error.message))
    return (data ?? []).map((z) => ausZeile(z as Record<string, unknown>))
  },
  async starten(rolle) {
    const { error } = await db().rpc('eni_recherche_starten', {
      p_rolle_id: rolle.id,
      p_name: rolle.name.trim(),
      p_auftrag: auftragVon(rolle),
    })
    if (error) throw new Error(fehlertext(error.code, error.message))
  },
  async abbrechen(rolleId) {
    const { error } = await db().rpc('eni_recherche_abbrechen', { p_rolle_id: rolleId })
    if (error) throw new Error(fehlertext(error.code, error.message))
  },
  async anstossen() {
    // antwortet sofort; die arbeit läuft auf dem server weiter. ein fehler
    // hier ist harmlos, der cron-job macht es dann eben eine minute später.
    await db().functions.invoke('eni-recherche', { body: {} })
  },
  async speichern(rolleId, akte) {
    const { data, error } = await db()
      .from('eni_rollen_wissen')
      .update({ akte: akte.slice(0, 100_000) })
      .eq('rolle_id', rolleId)
      .select('rolle_id')
    if (error) throw new Error(fehlertext(error.code, error.message))
    if (!data?.length) throw new Error('Nicht gespeichert: die Akte wird gerade neu recherchiert.')
  },
  async loeschen(rolleId) {
    const { error } = await db().from('eni_rollen_wissen').delete().eq('rolle_id', rolleId)
    if (error) throw new Error(fehlertext(error.code, error.message))
  },
}

/** fortschritt für die anzeige, mit prozent */
export function rechercheStand(stand: RollenAkteStand): { prozent: number; jetzt: string; erledigt: number; gesamt: number } {
  const f = fortschritt(stand.schritte)
  return { ...f, prozent: f.gesamt ? Math.min(99, Math.round((f.erledigt / f.gesamt) * 100)) : 0 }
}

/** ob die app den server jetzt anstoßen darf: niemand arbeitet gerade daran */
export function istFrei(stand: RollenAkteStand, jetzt = Date.now()): boolean {
  return stand.status === 'laeuft' && (!stand.gesperrtBis || Date.parse(stand.gesperrtBis) < jetzt)
}

/** „1. Okt.“ für die zeile unter der akte */
export function kurzesDatum(iso: string | null): string {
  if (!iso) return ''
  const datum = new Date(iso)
  if (Number.isNaN(datum.getTime())) return ''
  return datum.toLocaleDateString('de-DE', { day: 'numeric', month: 'short' })
}
