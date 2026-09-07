import { createClient } from '@supabase/supabase-js'
import type { Session } from '@supabase/supabase-js'
import { useEffect, useState } from 'react'
import type {
  Anfangszustand,
  Backend,
  VerbindungEreignis,
  WetteEreignis,
  WetteStand,
  Wetten,
  WettenMeta,
} from './backend'
import {
  istWochenmontag,
  istWetteVersion,
  vergleicheWetteVersion,
} from './backend'
import { addDays, toKey } from './dates'
import { gewichtKey, tickKey } from './types'
import type {
  Abrechnung,
  Aufenthalt,
  AreaId,
  Einheit,
  Einheiten,
  Fach,
  Gewichte,
  GewichtQuellen,
  Kursart,
  MessbarerBereich,
  Phase,
  Note,
  Notenart,
  ScoreKomponente,
  Schlafnacht,
  UserId,
} from './types'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

export const hatSupabase = Boolean(url && key)

/**
 * wie weit zurueck die verlaeufe gleich mitkommen.
 *
 * Ein Verlauf ist rund drei Kilobyte je Nacht — bei zwei Personen also gut
 * zwei Megabyte im Jahr, die sonst bei jedem Start ueber das Mobilnetz gingen,
 * obwohl nur die geoeffnete Nacht sie braucht. Acht Wochen decken die Woche,
 * die man sieht, und das Blaettern der letzten Wochen ab; alles davor laedt
 * das Nachtdetail beim Oeffnen nach.
 */
const PHASEN_FENSTER_TAGE = 56
const ABRECHNUNG_SPALTEN =
  'woche,sieger,grund,differenz,beleg_erijon,beleg_koray,wette,abgeschlossen,berechnung_version,archiv_quelle,punkte_erijon,punkte_koray'
const ABRECHNUNG_SPALTEN_LEGACY =
  'woche,sieger,grund,differenz,beleg_erijon,beleg_koray,wette,abgeschlossen'

export const supabase = hatSupabase ? createClient(url!, key!) : null

let realtimeKanalFolge = 0
export const REALTIME_KANAL_OPTIONEN = {
  config: { broadcast: { replication_ready: true } },
} as const

/**
 * Supabase fuehrt Kanaele mit demselben Topic clientseitig zusammen. Ein
 * einmaliges Topic verhindert deshalb, dass ein spaet schliessender Kanal
 * eines alten Backend-Laufs den neuen Lauf mit abmeldet.
 */
export function neuerRealtimeKanalname(basis: string): string {
  realtimeKanalFolge += 1
  return `zweikampf:${basis}:${realtimeKanalFolge}`
}

/** Der Subscribe-Callback beschreibt den Transport, nicht die Replikationsbereitschaft. */
export function realtimeSubscribeEreignis(status: string): VerbindungEreignis | null {
  if (status === 'SUBSCRIBED') return { typ: 'verbindung', status: 'transportbereit' }
  if (status === 'CHANNEL_ERROR') {
    return { typ: 'verbindung', status: 'veraltet', grund: 'channel_error' }
  }
  if (status === 'TIMED_OUT') {
    return { typ: 'verbindung', status: 'veraltet', grund: 'timed_out' }
  }
  if (status === 'CLOSED') {
    return { typ: 'verbindung', status: 'veraltet', grund: 'closed' }
  }
  return null
}

export function realtimeSystemEreignis(payload: {
  extension?: string
  status?: string
}): VerbindungEreignis | null {
  if (payload.extension !== 'system') return null
  if (payload.status === 'ok') return { typ: 'verbindung', status: 'bereit' }
  if (payload.status === 'error') {
    return { typ: 'verbindung', status: 'veraltet', grund: 'replication_error' }
  }
  return null
}

export function entferneRealtimeKanal<T>(
  client: { removeChannel(kanal: T): PromiseLike<unknown> | unknown },
  kanal: T
): void {
  void client.removeChannel(kanal)
}

const STANDARD_SEITENGROESSE = 1000
const MAXIMALE_LADEZEILEN = 100_000

type SeitenAntwort<T> = {
  data: T[] | null
  error: unknown
  count?: number | null
}

type SeitenAnfrage<T> = {
  range(von: number, bis: number): PromiseLike<SeitenAntwort<T>>
}

export type LadeAlleSeitenOptionen<T> = {
  name: string
  schluessel: (zeile: T) => string
  seitengroesse?: number
  maximaleZeilen?: number
}

/**
 * Liest eine geordnete PostgREST-Abfrage vollstaendig statt still an der
 * projektweiten Zeilengrenze abzuschneiden. Die Factory muss fuer jede Seite
 * dieselbe deterministisch sortierte Abfrage bauen; `range` ist inklusiv.
 */
export async function ladeAlleSeiten<T>(
  baueAnfrage: () => SeitenAnfrage<T>,
  optionen: LadeAlleSeitenOptionen<T>
): Promise<T[]> {
  const seitengroesse = optionen.seitengroesse ?? STANDARD_SEITENGROESSE
  const maximaleZeilen = optionen.maximaleZeilen ?? MAXIMALE_LADEZEILEN
  if (!Number.isSafeInteger(seitengroesse) || seitengroesse < 1) {
    throw new Error(`${optionen.name}: ungueltige seitengroesse`)
  }
  if (!Number.isSafeInteger(maximaleZeilen) || maximaleZeilen < seitengroesse) {
    throw new Error(`${optionen.name}: ungueltige zeilengrenze`)
  }

  const alle: T[] = []
  const gesehen = new Set<string>()
  let erwarteteAnzahl: number | null | undefined

  while (true) {
    const von = alle.length
    if (von >= maximaleZeilen) {
      throw new Error(`${optionen.name}: mehr als ${maximaleZeilen} zeilen`)
    }
    const bis = Math.min(von + seitengroesse - 1, maximaleZeilen - 1)
    const antwort = await baueAnfrage().range(von, bis)
    if (antwort.error) throw antwort.error
    if (!Array.isArray(antwort.data)) {
      throw new Error(`${optionen.name}: datenbank lieferte keine zeilenliste`)
    }

    const anzahl = antwort.count
    if (anzahl !== null && anzahl !== undefined) {
      if (!Number.isSafeInteger(anzahl) || anzahl < 0 || anzahl > maximaleZeilen) {
        throw new Error(`${optionen.name}: ungueltige gesamtzahl`)
      }
      if (erwarteteAnzahl === null || erwarteteAnzahl === undefined) {
        erwarteteAnzahl = anzahl
      } else if (anzahl !== erwarteteAnzahl) {
        throw new Error(`${optionen.name}: gesamtzahl hat sich waehrend des ladens geaendert`)
      }
    } else if (erwarteteAnzahl === undefined) {
      erwarteteAnzahl = null
    } else if (erwarteteAnzahl !== null) {
      throw new Error(`${optionen.name}: gesamtzahl fehlt auf einer folgeseite`)
    }

    for (const zeile of antwort.data) {
      const schluessel = optionen.schluessel(zeile)
      if (!schluessel || gesehen.has(schluessel)) {
        throw new Error(`${optionen.name}: doppelte oder ungueltige zeile ${schluessel || '?'}`)
      }
      gesehen.add(schluessel)
      alle.push(zeile)
      if (alle.length > maximaleZeilen) {
        throw new Error(`${optionen.name}: mehr als ${maximaleZeilen} zeilen`)
      }
    }

    if (erwarteteAnzahl !== null && erwarteteAnzahl !== undefined) {
      if (alle.length > erwarteteAnzahl) {
        throw new Error(`${optionen.name}: mehr zeilen als angekuendigt`)
      }
      if (alle.length === erwarteteAnzahl) return alle
      if (antwort.data.length === 0) {
        throw new Error(`${optionen.name}: gesamtzahl wurde nicht erreicht`)
      }
      continue
    }

    // Ohne Count bestaetigt erst eine explizit leere Folgeseite das Ende.
    // Dadurch bleibt auch eine niedrigere serverseitige Zeilengrenze als die
    // angeforderte Seitengroesse ohne stilles Abschneiden beherrschbar.
    if (antwort.data.length === 0) return alle
  }
}

type LadeAntwort<T> = { data: T[] | null; error: unknown }

async function versucheAlleSeiten<T>(
  baueAnfrage: () => SeitenAnfrage<T>,
  optionen: LadeAlleSeitenOptionen<T>
): Promise<LadeAntwort<T>> {
  try {
    return { data: await ladeAlleSeiten(baueAnfrage, optionen), error: null }
  } catch (error) {
    return { data: null, error }
  }
}

function fehlercode(error: unknown): string | undefined {
  if (!error || typeof error !== 'object') return undefined
  const code = (error as { code?: unknown }).code
  return typeof code === 'string' ? code : undefined
}

type ProfilZeile = { id: string; person: UserId }
const UUID_MUSTER = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function validiereDuellprofile(
  rohdaten: unknown,
  eigeneId: string
): {
  profile: ProfilZeile[]
  me: UserId
  userIds: readonly [string, string]
} {
  if (!Array.isArray(rohdaten) || rohdaten.length !== 2) {
    throw new Error('mitgliedschaft ist unvollstaendig oder enthaelt fremde profile')
  }

  const nachPerson = new Map<UserId, ProfilZeile>()
  const ids = new Set<string>()
  for (const rohprofil of rohdaten) {
    if (!rohprofil || typeof rohprofil !== 'object' || Array.isArray(rohprofil)) {
      throw new Error('mitgliedschaft enthaelt ein ungueltiges profil')
    }
    const { id, person } = rohprofil as { id?: unknown; person?: unknown }
    if (typeof id !== 'string' || !UUID_MUSTER.test(id)) {
      throw new Error('mitgliedschaft enthaelt eine ungueltige profil-id')
    }
    if (person !== 'erijon' && person !== 'koray') {
      throw new Error('mitgliedschaft enthaelt eine unbekannte person')
    }
    if (ids.has(id) || nachPerson.has(person)) {
      throw new Error('mitgliedschaft enthaelt doppelte profile')
    }
    const profil: ProfilZeile = { id, person }
    ids.add(id)
    nachPerson.set(person, profil)
  }

  const erijon = nachPerson.get('erijon')
  const koray = nachPerson.get('koray')
  if (!erijon || !koray) {
    throw new Error('mitgliedschaft muss erijon und koray eindeutig enthalten')
  }
  const me = eigeneId === erijon.id ? 'erijon' : eigeneId === koray.id ? 'koray' : null
  if (!me) throw new Error('dieses konto gehoert nicht zum zweikampf')

  return {
    profile: [erijon, koray],
    me,
    userIds: [erijon.id, koray.id],
  }
}

type EintragZeile = { user_id: string; bereich: AreaId; tag: string }
type WertZeile = { bereich: AreaId; tag: string; wert: number }
type EinheitZeile = {
  id: string
  user_id: string
  bereich: AreaId
  tag: string
  wert: number | null
  erfasst: string | null
  von?: string | null
}
/** zeile aus `schlafnaechte_ansicht`. numeric kommt je nach spalte als text */
type SchlafZeile = {
  user_id: string
  nacht: string
  schlaf_minuten: number | string
  einschlafzeit: string
  aufwachzeit: string | null
  bett_start: string | null
  bett_ende: string | null
  bett_minuten: number | string | null
  tief_minuten: number | string | null
  rem_minuten: number | string | null
  kern_minuten: number | string | null
  unspez_minuten: number | string | null
  wach_minuten: number | string | null
  schlafziel_minuten: number
  score_komponenten?: Record<string, ScoreKomponente> | null
  /** fehlt, wenn die spalte nicht angefragt wurde */
  phasen?: Phase[] | null
  nachtwert: number | null
  score_konfidenz: number | null
}
type SchlafphasenZeile = Pick<SchlafZeile, 'user_id' | 'nacht' | 'phasen'>

function zahl(wert: number | string | null | undefined): number {
  return wert === null || wert === undefined ? 0 : Number(wert)
}

/** vor der migration meldet postgres oder postgrest die fehlende spalte */
export function istFehlendeVonSpalte(code?: string): boolean {
  return code === '42703' || code === 'PGRST204'
}

export function phasenAusAnsicht(
  data: { phasen?: unknown } | null,
  error: unknown
): Phase[] {
  if (error) throw error
  // Keine Zeile bedeutet geloescht, unsichtbar oder noch nicht projiziert. Das
  // ist ein Abruffehler und nicht die fachliche Aussage "Health ohne Phasen".
  if (data === null) throw new Error('schlafnacht wurde nicht gefunden')
  if (!Array.isArray(data.phasen)) throw new Error('schlafphasen sind ungueltig')
  return data.phasen as Phase[]
}

/** numeric kommt aus postgrest als string, genau wie schlaf_minuten */
type GewichtZeile = {
  user_id: string
  tag: string
  kg: number | string
  /** fehlt, solange die spalte noch nicht ausgerollt ist */
  quelle?: string | null
}
type AufenthaltZeile = {
  id: number | string
  user_id: string
  bereich: MessbarerBereich
  ort: string
  ankunft: string
  abgang: string | null
}
type WetteZeile = {
  woche: string
  text: string | null
  updated_by: string
  updated_at: string
  /** verlustfreie Projektion der bigint-Spalte `version` */
  version_text: string
}
type AbrechnungZeile = {
  woche: string
  sieger: Abrechnung['sieger']
  grund: Abrechnung['grund']
  differenz: number
  beleg_erijon: number
  beleg_koray: number
  wette: string | null
  abgeschlossen: string
  berechnung_version?: number
  archiv_quelle?: Abrechnung['archivQuelle']
  punkte_erijon?: number | null
  punkte_koray?: number | null
}

export class UnbestaetigteMutation extends Error {
  readonly code = 'UNBESTAETIGTE_MUTATION'
  readonly abgleichNoetig = true
  readonly ursache: unknown

  constructor(message: string, ursache?: unknown) {
    super(message)
    this.name = 'UnbestaetigteMutation'
    this.ursache = ursache
  }
}

export function istUnbestaetigteMutation(error: unknown): error is UnbestaetigteMutation {
  if (error instanceof UnbestaetigteMutation) return true
  if (!error || typeof error !== 'object') return false
  const wert = error as { code?: unknown; abgleichNoetig?: unknown }
  return wert.code === 'UNBESTAETIGTE_MUTATION' && wert.abgleichNoetig === true
}

function mutationNichtBestaetigt(message: string, ursache?: unknown): UnbestaetigteMutation {
  return new UnbestaetigteMutation(message, ursache)
}

function wetteStandAusZeile(data: unknown): WetteStand {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('wetteinsatz hat keine gueltige zeile')
  }
  const zeile = data as Record<string, unknown>
  const version = zeile.version_text
  if (!istWochenmontag(zeile.woche)) {
    throw new Error('wetteinsatz hat keinen gueltigen wochenmontag')
  }
  if (
    zeile.text !== null
    && (
      typeof zeile.text !== 'string'
      || zeile.text !== zeile.text.trim()
      || zeile.text.length < 1
      || zeile.text.length > 160
    )
  ) {
    throw new Error('wetteinsatz hat einen ungueltigen text')
  }
  if (typeof zeile.updated_by !== 'string' || !UUID_MUSTER.test(zeile.updated_by)) {
    throw new Error('wetteinsatz hat keinen gueltigen autor')
  }
  if (typeof zeile.updated_at !== 'string' || !Number.isFinite(Date.parse(zeile.updated_at))) {
    throw new Error('wetteinsatz hat keinen gueltigen zeitpunkt')
  }
  if (!istWetteVersion(version)) {
    throw new Error('wetteinsatz hat keine gueltige version')
  }
  return {
    woche: zeile.woche,
    text: zeile.text,
    version,
    updatedBy: zeile.updated_by,
    updatedAt: zeile.updated_at,
  }
}

function bestaetigteWette(
  data: unknown,
  erwartet: { woche: string; text: string | null; version: string; updatedBy: string }
): WetteStand {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw mutationNichtBestaetigt('wetteinsatz wurde nicht bestaetigt')
  }
  const zeile = data as Record<string, unknown>
  const schluessel = Object.keys(zeile).sort()
  const erwartetSchluessel = ['text', 'updated_at', 'updated_by', 'version', 'woche']
  if (
    schluessel.length !== erwartetSchluessel.length
    || schluessel.some((schluesselname, index) => schluesselname !== erwartetSchluessel[index])
  ) {
    throw mutationNichtBestaetigt('wetteinsatz-rpc lieferte keinen exakten vertrag')
  }

  let stand: WetteStand
  try {
    stand = wetteStandAusZeile({ ...zeile, version_text: zeile.version })
  } catch (error) {
    throw mutationNichtBestaetigt('wetteinsatz wurde nicht bestaetigt', error)
  }
  if (
    stand.woche !== erwartet.woche
    || stand.text !== erwartet.text
    || stand.updatedBy !== erwartet.updatedBy
    || vergleicheWetteVersion(stand.version, erwartet.version) <= 0
  ) {
    throw mutationNichtBestaetigt('wetteinsatz wurde nicht exakt bestaetigt')
  }
  return stand
}

/**
 * Ein physisches DELETE hat unter RLS keine verlaessliche Version und ist daher
 * nur ein Signal fuer einen starken Snapshot. INSERT/UPDATE duerfen ausschliesslich
 * als vollstaendig versionierter Stand in den Store gelangen.
 */
export function wetteRealtimeEreignis(payload: {
  eventType?: string
  new?: unknown
  old?: unknown
}): WetteEreignis | null {
  if (payload.eventType === 'DELETE') {
    const alt = payload.old as { woche?: unknown } | null
    return {
      typ: 'wette',
      art: 'invalidierung',
      ...(typeof alt?.woche === 'string' ? { woche: alt.woche } : {}),
    }
  }
  if (payload.eventType !== 'INSERT' && payload.eventType !== 'UPDATE') return null
  try {
    return { typ: 'wette', art: 'wert', stand: wetteStandAusZeile(payload.new) }
  } catch {
    return { typ: 'wette', art: 'invalidierung' }
  }
}

function gleicherZeitpunkt(ist: unknown, soll: unknown): boolean {
  if (ist === null || soll === null) return ist === soll
  if (typeof ist !== 'string' || typeof soll !== 'string') return false
  const istZeit = Date.parse(ist)
  const sollZeit = Date.parse(soll)
  return Number.isFinite(istZeit) && Number.isFinite(sollZeit) && istZeit === sollZeit
}

function hatExakteFelder(
  zeile: unknown,
  erwartet: Record<string, unknown>,
  optionen: { zahlen?: string[]; zeitpunkte?: string[] } = {}
): boolean {
  if (!zeile || typeof zeile !== 'object' || Array.isArray(zeile)) return false
  const ist = zeile as Record<string, unknown>
  const zahlen = new Set(optionen.zahlen ?? [])
  const zeitpunkte = new Set(optionen.zeitpunkte ?? [])
  return Object.entries(erwartet).every(([feld, soll]) => {
    if (zeitpunkte.has(feld)) return gleicherZeitpunkt(ist[feld], soll)
    if (zahlen.has(feld)) {
      if (soll === null) return ist[feld] === null
      return Number.isFinite(Number(ist[feld])) && Number(ist[feld]) === Number(soll)
    }
    return ist[feld] === soll
  })
}

/** RLS-DELETE liefert bei UUID-Tabellen nur `old.id`, nicht die Vollzeile. */
export function realtimeTextId(alt: unknown): string | null {
  if (!alt || typeof alt !== 'object' || Array.isArray(alt)) return null
  const id = (alt as { id?: unknown }).id
  return typeof id === 'string' && id.length > 0 ? id : null
}

/** PostgREST kann bigint-IDs als JSON-Zahl oder als Dezimaltext liefern. */
export function realtimeBigintId(alt: unknown): string | null {
  if (!alt || typeof alt !== 'object' || Array.isArray(alt)) return null
  const id = (alt as { id?: unknown }).id
  if (typeof id === 'number') {
    return Number.isSafeInteger(id) && id > 0 ? String(id) : null
  }
  return typeof id === 'string' && /^[1-9]\d*$/.test(id) ? id : null
}

export function realtimeLoeschId(
  payload: unknown,
  art: 'text' | 'bigint' = 'text'
): string | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null
  const p = payload as { eventType?: unknown; old?: unknown }
  if (p.eventType !== 'DELETE') return null
  return art === 'bigint' ? realtimeBigintId(p.old) : realtimeTextId(p.old)
}

const zeileZuAbrechnung = (a: AbrechnungZeile): Abrechnung => ({
  woche: a.woche,
  sieger: a.sieger,
  grund: a.grund,
  differenz: Number(a.differenz),
  belegErijon: Number(a.beleg_erijon),
  belegKoray: Number(a.beleg_koray),
  wette: a.wette,
  abgeschlossen: a.abgeschlossen,
  berechnungVersion: a.berechnung_version === undefined ? 0 : Number(a.berechnung_version),
  archivQuelle: a.archiv_quelle ?? 'legacy_client',
  punkteErijon: a.punkte_erijon === undefined || a.punkte_erijon === null
    ? null
    : Number(a.punkte_erijon),
  punkteKoray: a.punkte_koray === undefined || a.punkte_koray === null
    ? null
    : Number(a.punkte_koray),
})

function istGanzeZahl(
  wert: unknown,
  minimum: number,
  maximum: number
): wert is number | string {
  if (typeof wert !== 'number' && typeof wert !== 'string') return false
  if (typeof wert === 'string' && wert.trim() === '') return false
  const n = Number(wert)
  return Number.isSafeInteger(n) && n >= minimum && n <= maximum
}

/**
 * Eine erfolgreiche HTTP-Antwort ist noch keine bestaetigte Mutation. Die RPC
 * muss genau die angefragte, intern widerspruchsfreie Archivzeile liefern.
 * So kann weder eine alte Funktion noch eine verformte PostgREST-Antwort im
 * Client als erfolgreicher Wochenabschluss erscheinen.
 */
function bestaetigteAbrechnung(data: unknown, angefragteWoche: string): Abrechnung {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('wochenabrechnung wurde nicht bestaetigt')
  }
  const a = data as Record<string, unknown>
  const sieger = a.sieger
  const grund = a.grund
  const quelle = a.archiv_quelle
  const abgeschlossen = a.abgeschlossen
  const wette = a.wette
  if (a.woche !== angefragteWoche) {
    throw new Error('wochenabrechnung bestaetigte eine andere woche')
  }
  if (sieger !== 'erijon' && sieger !== 'koray' && sieger !== 'unentschieden') {
    throw new Error('wochenabrechnung hat einen ungueltigen sieger')
  }
  if (grund !== 'punkte' && grund !== 'beleg' && grund !== 'unentschieden') {
    throw new Error('wochenabrechnung hat einen ungueltigen grund')
  }
  if (quelle !== 'legacy_client' && quelle !== 'server_planmaessig' && quelle !== 'server_nachgeholt') {
    throw new Error('wochenabrechnung hat eine ungueltige herkunft')
  }
  if (typeof abgeschlossen !== 'string' || Number.isNaN(Date.parse(abgeschlossen))) {
    throw new Error('wochenabrechnung hat keinen gueltigen abschlusszeitpunkt')
  }
  if (wette !== null && (typeof wette !== 'string' || wette.length > 160)) {
    throw new Error('wochenabrechnung hat einen ungueltigen wetteinsatz')
  }
  if (
    !istGanzeZahl(a.differenz, -35, 35)
    || !istGanzeZahl(a.beleg_erijon, 0, 35)
    || !istGanzeZahl(a.beleg_koray, 0, 35)
    || !istGanzeZahl(a.berechnung_version, 0, 1)
  ) {
    throw new Error('wochenabrechnung hat ungueltige zaehlwerte')
  }

  const differenz = Number(a.differenz)
  const belegErijon = Number(a.beleg_erijon)
  const belegKoray = Number(a.beleg_koray)
  const version = Number(a.berechnung_version)
  const punkteErijon = a.punkte_erijon === null ? null : Number(a.punkte_erijon)
  const punkteKoray = a.punkte_koray === null ? null : Number(a.punkte_koray)

  if (version === 0) {
    if (quelle !== 'legacy_client' || a.punkte_erijon !== null || a.punkte_koray !== null) {
      throw new Error('legacy-wochenabrechnung widerspricht ihrer herkunft')
    }
  } else {
    if (
      (quelle !== 'server_planmaessig' && quelle !== 'server_nachgeholt')
      || !istGanzeZahl(a.punkte_erijon, 0, 35)
      || !istGanzeZahl(a.punkte_koray, 0, 35)
      || differenz !== punkteErijon! - punkteKoray!
    ) {
      throw new Error('server-wochenabrechnung widerspricht ihren auditwerten')
    }
    const erwarteteEntscheidung = punkteErijon! !== punkteKoray!
      ? {
          sieger: punkteErijon! > punkteKoray! ? 'erijon' : 'koray',
          grund: 'punkte',
        }
      : belegErijon !== belegKoray
        ? {
            sieger: belegErijon > belegKoray ? 'erijon' : 'koray',
            grund: 'beleg',
          }
        : { sieger: 'unentschieden', grund: 'unentschieden' }
    if (sieger !== erwarteteEntscheidung.sieger || grund !== erwarteteEntscheidung.grund) {
      throw new Error('server-wochenabrechnung hat eine widerspruechliche entscheidung')
    }
  }

  return zeileZuAbrechnung(a as unknown as AbrechnungZeile)
}

/**
 * Der Browser sendet nur den Wochenmontag. Sieger, Abstand, Beleg, Wette und
 * Abschlusszeit kommen ausschliesslich aus der serverautoritativen RPC.
 */
export async function finalisiereUndBestaetigeAbrechnung(
  db: NonNullable<typeof supabase>,
  woche: string
): Promise<Abrechnung> {
  const { data, error } = await db.rpc('finalisiere_wochenabrechnung', { p_woche: woche })
  if (error) throw error
  return bestaetigteAbrechnung(data, woche)
}
type FachZeile = {
  id: string
  user_id: string
  name: string
  kursart: Kursart
  pruefungsfach: number | null
  sortierung: number
}
type NoteZeile = {
  id: string
  user_id: string
  fach_id: string
  art: Notenart
  punkte: number
  gewicht: number
  datum: string
  titel: string
}

/** Ein UUID-Retry darf nur dieselbe bereits kanonische Einheit bestaetigen. */
export async function schreibeUndBestaetigeEinheit(
  db: NonNullable<typeof supabase>,
  zeile: EinheitZeile
): Promise<string> {
  const { error } = await db
    .from('einheiten')
    .upsert(zeile, { onConflict: 'id', ignoreDuplicates: true })
  if (error) throw error

  const spalten = 'von' in zeile
    ? 'id,user_id,bereich,tag,wert,erfasst,von'
    : 'id,user_id,bereich,tag,wert,erfasst'
  const bestaetigung = await db
    .from('einheiten')
    .select(spalten)
    .eq('id', zeile.id)
    .eq('user_id', zeile.user_id)
    .maybeSingle()
  if (bestaetigung.error) throw bestaetigung.error
  if (!hatExakteFelder(bestaetigung.data, zeile, {
    zahlen: ['wert'],
    zeitpunkte: ['erfasst', 'von'],
  })) {
    throw mutationNichtBestaetigt('einheit wurde nicht eindeutig bestaetigt')
  }
  return zeile.id
}

const MAX_EINHEITEN_WIEDERHERSTELLUNG = 64

function validiereEinheitenWiederherstellungsBatch(einheiten: readonly Einheit[]): void {
  if (einheiten.length > MAX_EINHEITEN_WIEDERHERSTELLUNG) {
    throw new Error('höchstens 64 einheiten können wiederhergestellt werden')
  }
  const erste = einheiten[0]
  if (!erste) return

  const ids = new Set<string>()
  for (const einheit of einheiten) {
    const kanonischeId = einheit.id.toLowerCase()
    if (
      !UUID_MUSTER.test(einheit.id)
      || einheit.id !== kanonischeId
      || einheit.user !== erste.user
      || einheit.area !== erste.area
      || einheit.tag !== erste.tag
      || ids.has(kanonischeId)
    ) {
      throw new Error(
        'einheiten-wiederherstellung braucht eindeutige UUIDs aus genau einem eigenen Tag'
      )
    }
    ids.add(kanonischeId)
  }
}

/**
 * Eine RPC ist zugleich Insert und exakter Postcheck. Nur die vollständig und
 * in Eingabereihenfolge bestätigte UUID-Liste gilt als Erfolg.
 */
export async function stelleUndBestaetigeEinheitenWiederHer(
  db: NonNullable<typeof supabase>,
  einheiten: readonly Einheit[]
): Promise<string[]> {
  validiereEinheitenWiederherstellungsBatch(einheiten)
  if (einheiten.length === 0) return []

  const ids = einheiten.map((einheit) => einheit.id)
  const p_einheiten = einheiten.map((einheit) => ({
    id: einheit.id,
    bereich: einheit.area,
    tag: einheit.tag,
    wert: einheit.wert,
    erfasst: einheit.erfasst,
    von: einheit.von ?? null,
  }))
  const { data, error } = await db.rpc('stelle_einheiten_wieder_her', { p_einheiten })
  if (error) throw error
  if (
    !Array.isArray(data)
    || data.length !== ids.length
    || data.some((id, index) => (
      typeof id !== 'string'
      || !UUID_MUSTER.test(id)
      || id !== ids[index]
    ))
  ) {
    throw mutationNichtBestaetigt('einheiten-wiederherstellung wurde nicht exakt bestätigt')
  }
  return data as string[]
}

export async function aktualisiereUndBestaetigeEinheit(
  db: NonNullable<typeof supabase>,
  id: string,
  eigeneId: string,
  aenderung: { wert: number | null } | { von: string | null },
  erwarteterAltwert: number | string | null
): Promise<string> {
  const feld = 'wert' in aenderung ? 'wert' : 'von'
  const soll = feld === 'wert'
    ? (aenderung as { wert: number | null }).wert
    : (aenderung as { von: string | null }).von
  let aktualisierung = db
    .from('einheiten')
    .update(aenderung)
    .match({ id, user_id: eigeneId })

  // Der vom Client geladene Feldwert ist Teil derselben UPDATE-Anweisung.
  // Dadurch kann nach einem konkurrierenden Write keine veraltete Aenderung
  // mehr dieselbe Zeile treffen und anschließend still bestaetigt werden.
  aktualisierung = erwarteterAltwert === null
    ? aktualisierung.is(feld, null)
    : aktualisierung.eq(feld, erwarteterAltwert)

  const bestaetigung = await aktualisierung
    .select(`id,user_id,${feld}`)
    .maybeSingle()
  if (bestaetigung.error) throw bestaetigung.error
  if (!hatExakteFelder(bestaetigung.data, { id, user_id: eigeneId, [feld]: soll }, {
    zahlen: feld === 'wert' ? ['wert'] : [],
    zeitpunkte: feld === 'von' ? ['von'] : [],
  })) {
    throw mutationNichtBestaetigt(`einheit-${feld} wurde nicht bestaetigt`)
  }
  return id
}

async function loescheUndBestaetigeNatuerlicheZeile(
  db: NonNullable<typeof supabase>,
  tabelle: string,
  treffer: Record<string, unknown>,
  spalten: string,
  name: string
): Promise<void> {
  const loeschung = await db
    .from(tabelle)
    .delete()
    .match(treffer)
    .select(spalten)
    .maybeSingle()
  if (loeschung.error) throw loeschung.error
  if (loeschung.data !== null && !hatExakteFelder(loeschung.data, treffer)) {
    throw mutationNichtBestaetigt(`${name}-loeschung lieferte eine fremde zeile`)
  }
  if (hatExakteFelder(loeschung.data, treffer)) return
  // Ein nachgeschalteter SELECT unter derselben RLS kann eine verbliebene
  // Zielzeile ebenfalls verbergen. Nur die vom DELETE selbst zurueckgegebene
  // exakte Zeile bestaetigt deshalb die Mutation.
  throw mutationNichtBestaetigt(`${name}-loeschung wurde nicht bestaetigt`)
}

export async function loescheUndBestaetigeEinheit(
  db: NonNullable<typeof supabase>,
  id: string,
  eigeneId: string
): Promise<string> {
  await loescheUndBestaetigeNatuerlicheZeile(
    db,
    'einheiten',
    { id, user_id: eigeneId },
    'id,user_id',
    'einheit'
  )
  return id
}

export async function loescheUndBestaetigeEinheiten(
  db: NonNullable<typeof supabase>,
  ids: string[],
  eigeneId: string
): Promise<string[]> {
  const eindeutig = [...new Set(ids)]
  if (eindeutig.length !== ids.length || eindeutig.some((id) => !id)) {
    throw mutationNichtBestaetigt('tagloeschung enthaelt ungueltige einheiten-ids')
  }
  if (eindeutig.length === 0) return []

  const loeschung = await db
    .from('einheiten')
    .delete()
    .eq('user_id', eigeneId)
    .in('id', eindeutig)
    .select('id')
  if (loeschung.error) throw loeschung.error
  if (!Array.isArray(loeschung.data)) {
    throw mutationNichtBestaetigt('tagloeschung lieferte keine bestaetigten ids')
  }
  const erwartet = new Set(eindeutig)
  const bestaetigt = new Set<string>()
  for (const zeile of loeschung.data) {
    const id = zeile && typeof zeile === 'object' && typeof zeile.id === 'string'
      ? zeile.id
      : null
    if (!id || !erwartet.has(id) || bestaetigt.has(id)) {
      throw mutationNichtBestaetigt('tagloeschung lieferte ungueltige ids')
    }
    bestaetigt.add(id)
  }
  if (bestaetigt.size === erwartet.size) return eindeutig
  // Auch ein leerer Kontroll-SELECT waere unter derselben RLS kein Beleg fuer
  // den Zielzustand. Fehlende DELETE-IDs bleiben daher abgleichpflichtig.
  throw mutationNichtBestaetigt(
    `tagloeschung nur teilweise bestaetigt; ${erwartet.size - bestaetigt.size} ids fehlen`
  )
}

type AltEintragPayload = { user_id: string; bereich: AreaId; tag: string }
type AltWertPayload = AltEintragPayload & { wert: number }

export async function schreibeUndBestaetigeAltEintrag(
  db: NonNullable<typeof supabase>,
  payload: AltEintragPayload
): Promise<void> {
  const bestaetigung = await db
    .from('eintraege')
    .upsert(payload, { onConflict: 'user_id,bereich,tag' })
    .select('user_id,bereich,tag')
    .maybeSingle()
  if (bestaetigung.error) throw bestaetigung.error
  if (!hatExakteFelder(bestaetigung.data, payload)) {
    throw mutationNichtBestaetigt('legacy-eintrag wurde nicht bestaetigt')
  }
}

export async function schreibeUndBestaetigeAltWert(
  db: NonNullable<typeof supabase>,
  payload: AltWertPayload
): Promise<void> {
  const bestaetigung = await db
    .from('werte')
    .upsert(payload, { onConflict: 'user_id,bereich,tag' })
    .select('user_id,bereich,tag,wert')
    .maybeSingle()
  if (bestaetigung.error) throw bestaetigung.error
  if (!hatExakteFelder(bestaetigung.data, payload, { zahlen: ['wert'] })) {
    throw mutationNichtBestaetigt('legacy-wert wurde nicht bestaetigt')
  }
}

export async function loescheUndBestaetigeAltEintrag(
  db: NonNullable<typeof supabase>,
  payload: AltEintragPayload
): Promise<void> {
  return loescheUndBestaetigeNatuerlicheZeile(
    db,
    'eintraege',
    payload,
    'user_id,bereich,tag',
    'legacy-eintrag'
  )
}

export async function loescheUndBestaetigeAltWert(
  db: NonNullable<typeof supabase>,
  payload: AltEintragPayload
): Promise<void> {
  return loescheUndBestaetigeNatuerlicheZeile(
    db,
    'werte',
    payload,
    'user_id,bereich,tag',
    'legacy-wert'
  )
}

export async function schreibeUndBestaetigeGewicht(
  db: NonNullable<typeof supabase>,
  payload: { user_id: string; tag: string; kg: number; quelle?: 'getippt' }
): Promise<void> {
  const spalten = 'quelle' in payload ? 'user_id,tag,kg,quelle' : 'user_id,tag,kg'
  const bestaetigung = await db
    .from('gewicht')
    .upsert(payload, { onConflict: 'user_id,tag' })
    .select(spalten)
    .maybeSingle()
  if (bestaetigung.error) throw bestaetigung.error
  if (!hatExakteFelder(bestaetigung.data, payload, { zahlen: ['kg'] })) {
    throw mutationNichtBestaetigt('gewicht wurde nicht bestaetigt')
  }
}

export async function loescheUndBestaetigeGewicht(
  db: NonNullable<typeof supabase>,
  eigeneId: string,
  tag: string
): Promise<void> {
  return loescheUndBestaetigeNatuerlicheZeile(
    db,
    'gewicht',
    { user_id: eigeneId, tag },
    'user_id,tag',
    'gewicht'
  )
}

export async function schreibeUndBestaetigeWette(
  db: NonNullable<typeof supabase>,
  payload: { woche: string; text: string; erwarteteVersion: string; updatedBy: string }
): Promise<WetteStand> {
  return aendereUndBestaetigeWette(db, payload)
}

export async function loescheUndBestaetigeWette(
  db: NonNullable<typeof supabase>,
  woche: string,
  erwarteteVersion: string,
  updatedBy: string
): Promise<WetteStand> {
  return aendereUndBestaetigeWette(db, {
    woche,
    text: null,
    erwarteteVersion,
    updatedBy,
  })
}

async function aendereUndBestaetigeWette(
  db: NonNullable<typeof supabase>,
  payload: {
    woche: string
    text: string | null
    erwarteteVersion: string
    updatedBy: string
  }
): Promise<WetteStand> {
  if (!istWochenmontag(payload.woche)) throw new Error('wette braucht einen wochenmontag')
  if (!istWetteVersion(payload.erwarteteVersion, true)) {
    throw new Error('wette braucht eine gueltige erwartete version')
  }
  if (
    payload.text !== null
    && (
      payload.text !== payload.text.trim()
      || payload.text.length < 1
      || payload.text.length > 160
    )
  ) {
    throw new Error('wette braucht einen getrimmten text mit hoechstens 160 zeichen')
  }
  if (!UUID_MUSTER.test(payload.updatedBy)) throw new Error('wette braucht einen gueltigen autor')

  const { data, error } = await db.rpc('setze_duell_wette', {
    p_woche: payload.woche,
    p_text: payload.text,
    p_erwartete_version: payload.erwarteteVersion,
  })
  if (error) throw error
  return bestaetigteWette(data, {
    woche: payload.woche,
    text: payload.text,
    version: payload.erwarteteVersion,
    updatedBy: payload.updatedBy,
  })
}

export async function wechsleUndBestaetigePruefungsfach(
  db: NonNullable<typeof supabase>,
  fachId: string,
  erwartetesFachId: string
): Promise<string> {
  const { data, error } = await db.rpc('setze_pruefungsfach', {
    p_fach_id: fachId,
    p_erwartetes_fach_id: erwartetesFachId,
  })
  if (error) throw error
  if (data !== fachId) throw new Error('pruefungsfachwechsel wurde nicht bestaetigt')
  return fachId
}

function notenPayload(note: Note, eigeneId: string): NoteZeile {
  return {
    id: note.id,
    user_id: eigeneId,
    fach_id: note.fachId,
    art: note.art,
    punkte: note.punkte,
    gewicht: note.gewicht,
    datum: note.datum,
    titel: note.titel,
  }
}

function istDieselbeNotenzeile(zeile: unknown, erwartet: NoteZeile): boolean {
  if (!zeile || typeof zeile !== 'object' || Array.isArray(zeile)) return false
  const wert = zeile as Record<string, unknown>
  return Object.entries(erwartet).every(([name, inhalt]) => wert[name] === inhalt)
}

/**
 * `DO NOTHING` macht eine UUID-Wiederholung idempotent. Erst der anschließende
 * kanonische Read bestätigt, dass nicht eine abweichende Kollision überlebt hat.
 */
export async function schreibeUndBestaetigeNote(
  db: NonNullable<typeof supabase>,
  note: Note,
  eigeneId: string
): Promise<string> {
  const payload = notenPayload(note, eigeneId)
  const { error } = await db
    .from('noten')
    .upsert(payload, { onConflict: 'id', ignoreDuplicates: true })
  if (error) throw error

  const bestaetigung = await db
    .from('noten')
    .select('id,user_id,fach_id,art,punkte,gewicht,datum,titel')
    .eq('id', note.id)
    .eq('user_id', eigeneId)
    .maybeSingle()
  if (bestaetigung.error) throw bestaetigung.error
  if (!istDieselbeNotenzeile(bestaetigung.data, payload)) {
    throw new Error('note wurde nicht eindeutig bestaetigt')
  }
  return note.id
}

export async function loescheUndBestaetigeNote(
  db: NonNullable<typeof supabase>,
  id: string,
  eigeneId: string
): Promise<string> {
  const bestaetigung = await db
    .from('noten')
    .delete()
    .match({ id, user_id: eigeneId })
    .select('id')
    .maybeSingle()
  if (bestaetigung.error) throw bestaetigung.error
  if (bestaetigung.data?.id !== id) {
    throw mutationNichtBestaetigt('notenloeschung wurde nicht bestaetigt')
  }
  return id
}

export type Anmeldestatus = 'laden' | 'an' | 'aus' | 'fehler'

export function useSession() {
  const [status, setStatus] = useState<Anmeldestatus>(hatSupabase ? 'laden' : 'aus')
  const [session, setSession] = useState<Session | null>(null)
  const [fehler, setFehler] = useState<string | null>(null)
  const [ladeversuch, setLadeversuch] = useState(0)

  useEffect(() => {
    if (!supabase) return
    let aktiv = true
    setStatus('laden')
    setFehler(null)
    void supabase.auth.getSession()
      .then(({ data, error }) => {
        if (!aktiv) return
        if (error) {
          setSession(null)
          setStatus('fehler')
          setFehler('anmeldung konnte nicht sicher gelesen werden.')
          return
        }
        setSession(data.session)
        setStatus(data.session ? 'an' : 'aus')
      })
      .catch(() => {
        if (!aktiv) return
        setSession(null)
        setStatus('fehler')
        setFehler('anmeldung konnte nicht sicher gelesen werden.')
      })
    const { data } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s)
      setStatus(s ? 'an' : 'aus')
      setFehler(null)
    })
    return () => {
      aktiv = false
      data.subscription.unsubscribe()
    }
  }, [ladeversuch])

  return {
    status,
    session,
    fehler,
    erneut: () => setLadeversuch((wert) => wert + 1),
  }
}

export async function anmelden(email: string, passwort: string): Promise<string | null> {
  if (!supabase) return 'supabase ist nicht eingerichtet.'
  const { error } = await supabase.auth.signInWithPassword({ email, password: passwort })
  if (!error) return null
  if (error.message.toLowerCase().includes('invalid')) {
    return 'e-mail oder passwort stimmt nicht.'
  }
  return 'anmeldung fehlgeschlagen. prüfe die verbindung und versuch es nochmal.'
}

export async function abmelden() {
  if (!supabase) return
  const { error } = await supabase.auth.signOut()
  if (error) throw error
}

export function supabaseBackend(
  eigeneId: string,
  client: NonNullable<typeof supabase> | null = supabase
): Backend {
  if (!client) throw new Error('supabase ist nicht eingerichtet')
  const db = client
  /** uuid -> person. wird beim laden gefüllt und von realtime mitbenutzt */
  const personen = new Map<string, UserId>()

  /**
   * solange `einheiten` noch nicht eingespielt ist, liest und schreibt die app
   * weiter `eintraege` und `werte`. das hält sie am leben, wenn die migration
   * und der deploy nicht in derselben minute passieren.
   */
  let altbestand = false
  let einheitVonVerfuegbar = false
  let gewichtQuelleVerfuegbar = false
  let wettenVerfuegbar = false
  let abrechnungVerfuegbar = false
  let notenVerfuegbar = false
  let modusBekannt: () => void = () => {}
  const modus = new Promise<void>((r) => {
    modusBekannt = r
  })

  /** eine tageszeile aus dem altbestand, als einheit gelesen */
  const alteEinheit = (
    person: UserId,
    bereich: AreaId,
    tag: string,
    wert: number | null
  ): Einheit => ({
    id: `alt|${person}|${bereich}|${tag}`,
    user: person,
    area: bereich,
    tag,
    wert,
    erfasst: null,
  })

  const einordnen = (ziel: Einheiten, e: Einheit) => {
    const key = tickKey(e.user, e.area, e.tag)
    const liste = ziel[key]
    if (!liste) ziel[key] = [e]
    else if (!liste.some((x) => x.id === e.id)) liste.push(e)
  }

  const zeileZuEinheit = (z: EinheitZeile): Einheit | null => {
    const person = personen.get(z.user_id)
    if (!person) return null
    return {
      id: z.id,
      user: person,
      area: z.bereich,
      tag: z.tag,
      wert: z.wert === null ? null : Number(z.wert),
      erfasst: z.erfasst,
      von: z.von ?? null,
    }
  }

  /**
   * eine zeile aus `schlafnaechte_ansicht` als nacht. derselbe weg fuer das
   * laden und fuer realtime: sonst haette eine live eintreffende nacht andere
   * zahlen als dieselbe nacht nach einem neuladen.
   */
  const zeileZuSchlafnacht = (n: SchlafZeile): Schlafnacht | null => {
    const person = personen.get(n.user_id)
    if (!person) return null
    return {
      user: person,
      nacht: n.nacht,
      schlafMinuten: zahl(n.schlaf_minuten),
      einschlafzeit: n.einschlafzeit,
      aufwachzeit: n.aufwachzeit,
      bettStart: n.bett_start,
      bettEnde: n.bett_ende,
      bettMinuten: n.bett_minuten === null ? null : Number(n.bett_minuten),
      tiefMinuten: zahl(n.tief_minuten),
      remMinuten: zahl(n.rem_minuten),
      kernMinuten: zahl(n.kern_minuten),
      unspezMinuten: zahl(n.unspez_minuten),
      wachMinuten: zahl(n.wach_minuten),
      zielMinuten: n.schlafziel_minuten,
      // ohne die spalte im select bleibt `undefined` — das ist "nicht geladen"
      phasen: Array.isArray(n.phasen) ? n.phasen : null,
      nachtwert: n.nachtwert ?? null,
      scoreKonfidenz: n.score_konfidenz ?? null,
      scoreKomponenten: n.score_komponenten ?? null,
    }
  }

  const zeileZuAufenthalt = (a: AufenthaltZeile): Aufenthalt | null => {
    const person = personen.get(a.user_id)
    if (!person) return null
    return {
      id: String(a.id),
      user: person,
      bereich: a.bereich,
      ort: a.ort,
      ankunft: a.ankunft,
      abgang: a.abgang,
    }
  }

  const zeileZuFach = (f: FachZeile): Fach | null => {
    const person = personen.get(f.user_id)
    if (!person) return null
    return {
      id: f.id,
      user: person,
      name: f.name,
      kursart: f.kursart,
      pruefungsfach: f.pruefungsfach,
      sortierung: Number(f.sortierung),
    }
  }

  const zeileZuNote = (n: NoteZeile): Note | null => {
    const person = personen.get(n.user_id)
    if (!person) return null
    return {
      id: n.id,
      user: person,
      fachId: n.fach_id,
      art: n.art,
      punkte: Number(n.punkte),
      gewicht: Number(n.gewicht),
      datum: n.datum,
      titel: n.titel,
    }
  }

  return {
    art: 'supabase',

    async laden(): Promise<Anfangszustand> {
      // Die Mitgliedschaft ist die Zugriffsliste fuer alle folgenden Reads.
      // Sie muss vollstaendig und eindeutig sein, bevor eine Fachtabelle auch
      // nur angefragt wird; unbekannte Auth-Konten werden nie still zugeordnet.
      const profilAntwort = await versucheAlleSeiten<ProfilZeile>(
        () => db
          .from('profile')
          .select('id, person', { count: 'exact' })
          .order('person', { ascending: true })
          .order('id', { ascending: true }),
        { name: 'profile', schluessel: (profil) => profil.id }
      )
      if (profilAntwort.error) throw profilAntwort.error
      const mitgliedschaft = validiereDuellprofile(profilAntwort.data, eigeneId)
      personen.clear()
      for (const profil of mitgliedschaft.profile) personen.set(profil.id, profil.person)
      const userIds = [...mitgliedschaft.userIds]

      const [
        einheitAnfrage,
        schlafZeilen,
        phasenZeilen,
        gewichtZeilen,
        aufenthaltZeilen,
        wetteZeilen,
        abrechnungZeilen,
        fachZeilen,
        notenZeilen,
      ] = await Promise.all([
        versucheAlleSeiten<EinheitZeile>(
          () => db
            .from('einheiten')
            .select('id, user_id, bereich, tag, wert, erfasst, von', { count: 'exact' })
            .in('user_id', userIds)
            .order('user_id', { ascending: true })
            .order('tag', { ascending: true })
            .order('erfasst', { ascending: true })
            .order('id', { ascending: true }),
          { name: 'einheiten', schluessel: (einheit) => einheit.id }
        ),
        versucheAlleSeiten<SchlafZeile>(
          () => db
            .from('schlafnaechte_ansicht')
            .select(
              'user_id, nacht, schlaf_minuten, einschlafzeit, aufwachzeit, bett_start, bett_ende, bett_minuten, tief_minuten, rem_minuten, kern_minuten, unspez_minuten, wach_minuten, schlafziel_minuten, nachtwert, score_konfidenz, score_komponenten',
              { count: 'exact' }
            )
            .in('user_id', userIds)
            .order('nacht', { ascending: true })
            .order('user_id', { ascending: true }),
          { name: 'schlafnaechte', schluessel: (nacht) => `${nacht.user_id}|${nacht.nacht}` }
        ),
        // Die Verlaeufe der letzten Wochen kommen mit: was man gleich
        // aufschlaegt, soll nicht erst nachladen. Alles davor holt sich das
        // Nachtdetail bei Bedarf.
        versucheAlleSeiten<SchlafphasenZeile>(
          () => db
            .from('schlafnaechte_ansicht')
            .select('user_id, nacht, phasen', { count: 'exact' })
            .in('user_id', userIds)
            .gte('nacht', toKey(addDays(new Date(), -PHASEN_FENSTER_TAGE)))
            .order('nacht', { ascending: true })
            .order('user_id', { ascending: true }),
          { name: 'schlafphasen', schluessel: (nacht) => `${nacht.user_id}|${nacht.nacht}` }
        ),
        versucheAlleSeiten<GewichtZeile>(
          () => db
            .from('gewicht')
            .select('user_id, tag, kg, quelle', { count: 'exact' })
            .in('user_id', userIds)
            .order('tag', { ascending: true })
            .order('user_id', { ascending: true }),
          { name: 'gewicht', schluessel: (gewicht) => `${gewicht.user_id}|${gewicht.tag}` }
        ),
        versucheAlleSeiten<AufenthaltZeile>(
          () => db
            .from('aufenthalte')
            .select('id, user_id, bereich, ort, ankunft, abgang', { count: 'exact' })
            .in('user_id', userIds)
            .order('ankunft', { ascending: true })
            .order('id', { ascending: true }),
          { name: 'aufenthalte', schluessel: (aufenthalt) => String(aufenthalt.id) }
        ),
        versucheAlleSeiten<WetteZeile>(
          () => db
            .from('duell_wetten')
            .select('woche, text, updated_by, updated_at, version_text', { count: 'exact' })
            .order('woche', { ascending: true }),
          { name: 'duell_wetten', schluessel: (wette) => wette.woche }
        ),
        versucheAlleSeiten<AbrechnungZeile>(
          () => db
            .from('wochenabrechnung')
            .select(ABRECHNUNG_SPALTEN, { count: 'exact' })
            .order('woche', { ascending: true }),
          { name: 'wochenabrechnung', schluessel: (abrechnung) => abrechnung.woche }
        ),
        versucheAlleSeiten<FachZeile>(
          () => db
            .from('faecher')
            .select('id, user_id, name, kursart, pruefungsfach, sortierung', { count: 'exact' })
            .in('user_id', userIds)
            .order('user_id', { ascending: true })
            .order('sortierung', { ascending: true })
            .order('id', { ascending: true }),
          { name: 'faecher', schluessel: (fach) => fach.id }
        ),
        versucheAlleSeiten<NoteZeile>(
          () => db
            .from('noten')
            .select('id, user_id, fach_id, art, punkte, gewicht, datum, titel', { count: 'exact' })
            .in('user_id', userIds)
            .order('datum', { ascending: true })
            .order('user_id', { ascending: true })
            .order('id', { ascending: true }),
          { name: 'noten', schluessel: (note) => note.id }
        ),
      ])

      // Während Schema und Frontend getrennt veröffentlicht werden, darf eine
      // neue Ansicht oder Tabelle den bestehenden Tracker nicht lahmlegen.
      const fehltNoch = (code?: string) => code === '42P01' || code === 'PGRST205'
      // `von` wird getrennt ausgerollt. PGRST204 ist laut Data-API der Fehler
      // fuer eine angefragte, aber noch nicht vorhandene Spalte.
      let einheitZeilen = einheitAnfrage
      if (einheitAnfrage.error && istFehlendeVonSpalte(fehlercode(einheitAnfrage.error))) {
        einheitVonVerfuegbar = false
        einheitZeilen = await versucheAlleSeiten<EinheitZeile>(
          () => db
            .from('einheiten')
            .select('id, user_id, bereich, tag, wert, erfasst', { count: 'exact' })
            .in('user_id', userIds)
            .order('user_id', { ascending: true })
            .order('tag', { ascending: true })
            .order('erfasst', { ascending: true })
            .order('id', { ascending: true }),
          { name: 'einheiten', schluessel: (einheit) => einheit.id }
        )
      } else {
        einheitVonVerfuegbar = !einheitAnfrage.error
      }
      // `quelle` wird getrennt ausgerollt: ohne die spalte bleibt jede zahl
      // getippt, statt dass die ganze abfrage scheitert.
      let gewichtMitQuelle: LadeAntwort<GewichtZeile> = gewichtZeilen
      if (gewichtZeilen.error && istFehlendeVonSpalte(fehlercode(gewichtZeilen.error))) {
        gewichtQuelleVerfuegbar = false
        gewichtMitQuelle = await versucheAlleSeiten<GewichtZeile>(
          () => db
            .from('gewicht')
            .select('user_id, tag, kg', { count: 'exact' })
            .in('user_id', userIds)
            .order('tag', { ascending: true })
            .order('user_id', { ascending: true }),
          { name: 'gewicht', schluessel: (gewicht) => `${gewicht.user_id}|${gewicht.tag}` }
        )
      } else {
        gewichtQuelleVerfuegbar = !gewichtZeilen.error
      }
      // Vor der serverautoritativen Migration fehlen die beiden
      // Provenienzspalten. Alte Archive bleiben lesbar und werden im Mapper
      // ehrlich als `legacy_client` markiert; finalisieren kann diese
      // Frontendfassung ohne die neue RPC trotzdem nicht.
      let abrechnungMitQuelle: LadeAntwort<AbrechnungZeile> = abrechnungZeilen
      if (abrechnungZeilen.error && istFehlendeVonSpalte(fehlercode(abrechnungZeilen.error))) {
        abrechnungMitQuelle = await versucheAlleSeiten<AbrechnungZeile>(
          () => db
            .from('wochenabrechnung')
            .select(ABRECHNUNG_SPALTEN_LEGACY, { count: 'exact' })
            .order('woche', { ascending: true }),
          { name: 'wochenabrechnung', schluessel: (abrechnung) => abrechnung.woche }
        )
      }

      if (einheitZeilen.error && !fehltNoch(fehlercode(einheitZeilen.error))) throw einheitZeilen.error
      if (schlafZeilen.error && !fehltNoch(fehlercode(schlafZeilen.error))) throw schlafZeilen.error
      // Die 56-Tage-Vorladung ist nur eine Beschleunigung. Scheitert sie,
      // bleiben die Verlaeufe `null` und werden beim Oeffnen mit sichtbarem
      // Fehlerzustand einzeln nachgeladen; die Kernnachtwerte starten trotzdem.
      if (gewichtMitQuelle.error && !fehltNoch(fehlercode(gewichtMitQuelle.error))) {
        throw gewichtMitQuelle.error
      }
      if (aufenthaltZeilen.error && !fehltNoch(fehlercode(aufenthaltZeilen.error))) {
        throw aufenthaltZeilen.error
      }
      if (wetteZeilen.error && !fehltNoch(fehlercode(wetteZeilen.error))) throw wetteZeilen.error
      if (abrechnungMitQuelle.error && !fehltNoch(fehlercode(abrechnungMitQuelle.error))) {
        throw abrechnungMitQuelle.error
      }
      if (fachZeilen.error && !fehltNoch(fehlercode(fachZeilen.error))) throw fachZeilen.error
      if (notenZeilen.error && !fehltNoch(fehlercode(notenZeilen.error))) throw notenZeilen.error
      wettenVerfuegbar = !wetteZeilen.error
      abrechnungVerfuegbar = !abrechnungMitQuelle.error
      notenVerfuegbar = !fachZeilen.error && !notenZeilen.error

      altbestand = Boolean(einheitZeilen.error)

      // die beiden alten tabellen werden nur noch gelesen, wenn es sein muss
      const [eintraege, werteZeilen] = altbestand
        ? await Promise.all([
            versucheAlleSeiten<EintragZeile>(
              () => db
                .from('eintraege')
                .select('user_id, bereich, tag', { count: 'exact' })
                .in('user_id', userIds)
                .order('user_id', { ascending: true })
                .order('tag', { ascending: true })
                .order('bereich', { ascending: true }),
              {
                name: 'eintraege',
                schluessel: (eintrag) => `${eintrag.user_id}|${eintrag.bereich}|${eintrag.tag}`,
              }
            ),
            versucheAlleSeiten<WertZeile>(
              () => db
                .from('werte')
                .select('bereich, tag, wert', { count: 'exact' })
                .eq('user_id', eigeneId)
                .order('tag', { ascending: true })
                .order('bereich', { ascending: true }),
              { name: 'werte', schluessel: (wert) => `${wert.bereich}|${wert.tag}` }
            ),
          ])
        : [null, null]
      if (eintraege?.error) throw eintraege.error
      if (werteZeilen?.error) throw werteZeilen.error
      const me = mitgliedschaft.me

      const einheiten: Einheiten = {}
      if (altbestand) {
        // `werte` gehört nur dem eigenen konto, mehr als die eigenen minuten
        // gibt der altbestand nicht her.
        const werte = new Map<string, number>()
        for (const w of (werteZeilen?.data ?? []) as WertZeile[]) {
          werte.set(`${w.bereich}|${w.tag}`, w.wert)
        }
        for (const e of (eintraege?.data ?? []) as EintragZeile[]) {
          const person = personen.get(e.user_id)
          if (!person) continue
          const wert = person === me ? (werte.get(`${e.bereich}|${e.tag}`) ?? null) : null
          einordnen(einheiten, alteEinheit(person, e.bereich, e.tag, wert))
        }
      } else {
        for (const z of (einheitZeilen.data ?? []) as EinheitZeile[]) {
          const e = zeileZuEinheit(z)
          if (e) einordnen(einheiten, e)
        }
        // älteste zuerst; ohne zeitpunkt sind die übernommenen altbestände
        for (const liste of Object.values(einheiten)) {
          liste.sort((a, b) => {
            const x = a.erfasst ?? ''
            const y = b.erfasst ?? ''
            return x < y ? -1 : x > y ? 1 : 0
          })
        }
      }

      const verlaeufe = new Map<string, Phase[]>()
      for (const z of (phasenZeilen.error ? [] : (phasenZeilen.data ?? []))) {
        if (Array.isArray(z.phasen)) verlaeufe.set(`${z.user_id}|${z.nacht}`, z.phasen)
      }

      const schlaf: Schlafnacht[] = []
      for (const n of ((schlafZeilen.data ?? []) as SchlafZeile[])) {
        const nacht = zeileZuSchlafnacht(n)
        if (!nacht) continue
        const verlauf = verlaeufe.get(`${n.user_id}|${n.nacht}`)
        schlaf.push(verlauf === undefined ? nacht : { ...nacht, phasen: verlauf })
      }

      const gewichte: Gewichte = {}
      const gewichtQuellen: GewichtQuellen = {}
      for (const z of (gewichtMitQuelle.data ?? []) as GewichtZeile[]) {
        const person = personen.get(z.user_id)
        if (!person) continue
        // Number(): numeric käme sonst als string und die summe im gleitenden
        // schnitt würde stillschweigend aneinandergehängt statt addiert.
        gewichte[gewichtKey(person, z.tag)] = Number(z.kg)
        if (z.quelle === 'gemessen') gewichtQuellen[gewichtKey(person, z.tag)] = 'gemessen'
      }

      const aufenthalte: Aufenthalt[] = []
      for (const a of (aufenthaltZeilen.data ?? []) as AufenthaltZeile[]) {
        const aufenthalt = zeileZuAufenthalt(a)
        if (aufenthalt) aufenthalte.push(aufenthalt)
      }

      const wetten: Wetten = {}
      const wettenMeta: WettenMeta = {}
      for (const w of (wetteZeilen.data ?? []) as WetteZeile[]) {
        const stand = wetteStandAusZeile(w)
        wettenMeta[stand.woche] = {
          version: stand.version,
          updatedBy: stand.updatedBy,
          updatedAt: stand.updatedAt,
        }
        if (stand.text !== null) wetten[stand.woche] = stand.text
      }

      const abrechnungen: Abrechnung[] = []
      for (const a of (abrechnungMitQuelle.data ?? []) as AbrechnungZeile[]) {
        abrechnungen.push(zeileZuAbrechnung(a))
      }

      const faecher: Fach[] = []
      for (const f of (fachZeilen.data ?? []) as FachZeile[]) {
        const fach = zeileZuFach(f)
        if (fach) faecher.push(fach)
      }
      const noten: Note[] = []
      for (const n of (notenZeilen.data ?? []) as NoteZeile[]) {
        const note = zeileZuNote(n)
        if (note) noten.push(note)
      }

      // Erst der vollstaendig validierte Zustand darf den passenden
      // Realtime-Kanal freigeben. Ein fehlendes Profil baut keinen nutzlosen
      // Kanal mit einer unvollstaendigen UUID-zu-Person-Zuordnung auf.
      modusBekannt()
      return {
        me,
        einheiten,
        gewichte,
        gewichtQuellen,
        schlaf,
        aufenthalte,
        wetten,
        wettenMeta,
        abrechnungen,
        noten: { faecher, noten },
        einheitVonVerfuegbar,
        altbestand,
      }
    },

    async schreibeEinheit(e) {
      if (altbestand) {
        await schreibeUndBestaetigeAltEintrag(db, {
          user_id: eigeneId,
          bereich: e.area,
          tag: e.tag,
        })
        if (e.wert !== null) {
          try {
            await this.schreibeEinheitWert(e, e.wert)
          } catch (error) {
            throw mutationNichtBestaetigt(
              'legacy-einheit nur teilweise geschrieben; abgleich erforderlich',
              error
            )
          }
        }
        return
      }

      // ignoreDuplicates: dieselbe id zweimal zu senden — nach einem timeout,
      // aus einer wiederholung — legt keine zweite einheit an.
      const zeile = {
        id: e.id,
        user_id: eigeneId,
        bereich: e.area,
        tag: e.tag,
        wert: e.wert,
        erfasst: e.erfasst,
        ...(einheitVonVerfuegbar ? { von: e.von ?? null } : {}),
      }
      await schreibeUndBestaetigeEinheit(db, zeile)
    },

    async stelleEinheitenWiederHer(einheiten) {
      if (einheiten.length === 0) return
      if (altbestand || !einheitVonVerfuegbar) {
        throw new Error('atomare einheiten-wiederherstellung ist in diesem schema nicht verfügbar')
      }
      const eigenerUser = personen.get(eigeneId)
      if (!eigenerUser || einheiten.some((einheit) => einheit.user !== eigenerUser)) {
        throw new Error('nur eigene einheiten können wiederhergestellt werden')
      }
      await stelleUndBestaetigeEinheitenWiederHer(db, einheiten)
    },

    async schreibeEinheitVon(e, von) {
      if (!einheitVonVerfuegbar) throw new Error('durchführungszeit fehlt noch')
      await aktualisiereUndBestaetigeEinheit(db, e.id, eigeneId, { von }, e.von ?? null)
    },

    async schreibeEinheitWert(e, wert) {
      if (altbestand) {
        if (wert === null || wert <= 0) {
          await loescheUndBestaetigeAltWert(db, {
            user_id: eigeneId,
            bereich: e.area,
            tag: e.tag,
          })
          return
        }
        await schreibeUndBestaetigeAltWert(db, {
          user_id: eigeneId,
          bereich: e.area,
          tag: e.tag,
          wert,
        })
        return
      }

      await aktualisiereUndBestaetigeEinheit(db, e.id, eigeneId, { wert }, e.wert)
    },

    async loescheEinheit(e) {
      if (altbestand) return this.loescheTag([e])
      await loescheUndBestaetigeEinheit(db, e.id, eigeneId)
    },

    async loescheTag(einheiten) {
      const erste = einheiten[0]
      if (!erste) return

      if (altbestand) {
        const treffer = { user_id: eigeneId, bereich: erste.area, tag: erste.tag }
        // Erst den privaten Wert entfernen. Scheitert danach der Tick, bleibt
        // ein ehrlicher Tick ohne Wert statt eines unsichtbaren verwaisten
        // Werts, der bei spaeterem Neuanlegen wieder auftauchen koennte.
        await loescheUndBestaetigeAltWert(db, treffer)
        try {
          await loescheUndBestaetigeAltEintrag(db, treffer)
        } catch (error) {
          throw mutationNichtBestaetigt(
            'legacy-tag nur teilweise geloescht; abgleich erforderlich',
            error
          )
        }
        return
      }

      await loescheUndBestaetigeEinheiten(db, einheiten.map((e) => e.id), eigeneId)
    },

    async schreibeGewicht(tag, kg) {
      if (kg <= 0) {
        await loescheUndBestaetigeGewicht(db, eigeneId, tag)
      } else {
        await schreibeUndBestaetigeGewicht(db, {
          user_id: eigeneId,
          tag,
          kg,
          ...(gewichtQuelleVerfuegbar ? { quelle: 'getippt' as const } : {}),
        })
      }
    },

    async schreibeWette(woche, text, erwarteteVersion) {
      if (!wettenVerfuegbar) throw new Error('duell_wetten fehlt noch')
      if (!text) {
        return loescheUndBestaetigeWette(db, woche, erwarteteVersion, eigeneId)
      }
      return schreibeUndBestaetigeWette(db, {
        woche,
        text,
        erwarteteVersion,
        updatedBy: eigeneId,
      })
    },

    async schreibeAbrechnung(a) {
      if (!abrechnungVerfuegbar) throw new Error('wochenabrechnung fehlt noch')
      return finalisiereUndBestaetigeAbrechnung(db, a.woche)
    },

    async setzePruefungsfach(fachId, erwartetesFachId) {
      if (!notenVerfuegbar) throw new Error('faecher fehlt noch')
      return wechsleUndBestaetigePruefungsfach(db, fachId, erwartetesFachId)
    },

    async schreibeNote(note) {
      if (!notenVerfuegbar) throw new Error('noten fehlt noch')
      return schreibeUndBestaetigeNote(db, note, eigeneId)
    },

    async loescheNote(id) {
      if (!notenVerfuegbar) throw new Error('noten fehlt noch')
      return loescheUndBestaetigeNote(db, id, eigeneId)
    },

    async ladePhasen(user, nacht, signal) {
      const id = [...personen.entries()].find(([, person]) => person === user)?.[0]
      if (!id) throw new Error('person wurde nicht gefunden')
      const { data, error } = await db
        .from('schlafnaechte_ansicht')
        .select('phasen')
        .eq('user_id', id)
        .eq('nacht', nacht)
        .abortSignal(signal)
        .maybeSingle()
      return phasenAusAnsicht(data, error)
    },

    abonniere(cb) {
      // welcher kanal der richtige ist, steht erst nach dem laden fest.
      let kanal: ReturnType<typeof db.channel> | null = null
      let abgemeldet = false
      cb({ typ: 'verbindung', status: 'verbindet' })

      const neuerKanal = (basis: string) => db.channel(
        neuerRealtimeKanalname(basis),
        REALTIME_KANAL_OPTIONEN
      )

      const starteKanal = (builder: ReturnType<typeof db.channel>) => {
        kanal = builder
          .on('system', {}, (payload) => {
            if (abgemeldet) return
            const ereignis = realtimeSystemEreignis(payload)
            if (ereignis) cb(ereignis)
          })
          .subscribe((status) => {
            if (abgemeldet) return
            const ereignis = realtimeSubscribeEreignis(status)
            if (ereignis) cb(ereignis)
          })
      }

      /**
       * schlaf, gewicht und aufenthalte hängen an denselben kanal wie die
       * ticks. sie kommen nicht aus der app, sondern vom kurzbefehl auf dem
       * iphone oder vom zweiten gerät — ohne diese drei bliebe eine offene
       * app so lange auf dem stand des ladens, bis jemand sie neu startet.
       *
       * `schlaf_updates` ist die projektion, nicht die quelltabelle: über den
       * kanal geht damit dieselbe datensparsame zeile wie über die ansicht,
       * und die rohsegmente bleiben, wo sie sind.
       */
      const mitGesundheit = (b: ReturnType<typeof db.channel>) =>
        b
          .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'schlaf_updates' },
            (p) => {
              if (p.eventType === 'DELETE') {
                const alt = p.old as Pick<SchlafZeile, 'user_id' | 'nacht'> | null
                const person = alt?.user_id ? personen.get(alt.user_id) : null
                if (person && alt?.nacht) {
                  cb({ typ: 'schlaf', art: 'weg', user: person, nacht: alt.nacht })
                }
                return
              }
              const zeile = p.new as SchlafZeile | null
              if (!zeile?.user_id) return
              const nacht = zeileZuSchlafnacht(zeile)
              if (nacht) cb({ typ: 'schlaf', art: 'wert', nacht })
            }
          )
          .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'gewicht' },
            (p) => {
              const zeile = (p.eventType === 'DELETE' ? p.old : p.new) as GewichtZeile | null
              if (!zeile?.user_id || !zeile.tag) return
              const person = personen.get(zeile.user_id)
              if (!person) return
              cb({
                typ: 'gewicht', user: person, tag: zeile.tag,
                kg: p.eventType === 'DELETE' ? null : Number(zeile.kg),
                quelle: zeile.quelle === 'gemessen' ? 'gemessen' : 'getippt',
              })
            }
          )
          .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'aufenthalte' },
            (p) => {
              if (p.eventType === 'DELETE') {
                const id = realtimeLoeschId(p, 'bigint')
                if (id) cb({ typ: 'aufenthalt', art: 'weg', id })
                return
              }
              const zeile = p.new as AufenthaltZeile | null
              if (!zeile?.user_id) return
              const aufenthalt = zeileZuAufenthalt(zeile)
              if (aufenthalt) cb({ typ: 'aufenthalt', art: 'wert', aufenthalt })
            }
          )

      const mitNoten = (b: ReturnType<typeof db.channel>) => {
        if (!notenVerfuegbar) return b
        return b
          .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'faecher' },
            (p) => {
              if (p.eventType === 'DELETE') {
                const id = realtimeLoeschId(p)
                if (id) cb({ typ: 'fach', art: 'weg', id })
                return
              }
              const zeile = p.new as FachZeile | null
              if (!zeile?.id) return
              const fach = zeileZuFach(zeile)
              if (fach) cb({
                typ: 'fach',
                art: p.eventType === 'INSERT' ? 'neu' : 'wert',
                fach,
              })
            }
          )
          .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'noten' },
            (p) => {
              if (p.eventType === 'DELETE') {
                const id = realtimeLoeschId(p)
                if (id) cb({ typ: 'note', art: 'weg', id })
                return
              }
              const zeile = p.new as NoteZeile | null
              if (!zeile?.id) return
              const note = zeileZuNote(zeile)
              if (note) cb({
                typ: 'note',
                art: p.eventType === 'INSERT' ? 'neu' : 'wert',
                note,
              })
            }
          )
      }

      void modus.then(() => {
        if (abgemeldet) return

        if (altbestand) {
          const melde = (zeile: EintragZeile | null, art: 'neu' | 'weg') => {
            if (!zeile) return
            const person = personen.get(zeile.user_id)
            if (!person) return
            const einheit = alteEinheit(person, zeile.bereich, zeile.tag, null)
            cb(art === 'weg'
              ? { typ: 'einheit', art: 'weg', id: einheit.id }
              : { typ: 'einheit', art: 'neu', einheit })
          }

          let builder = neuerKanal('eintraege')
            .on(
              'postgres_changes',
              { event: 'INSERT', schema: 'public', table: 'eintraege' },
              (p) => melde(p.new as EintragZeile, 'neu')
            )
            .on(
              'postgres_changes',
              { event: 'DELETE', schema: 'public', table: 'eintraege' },
              (p) => melde(p.old as EintragZeile, 'weg')
            )
          if (wettenVerfuegbar) {
            builder = builder.on(
              'postgres_changes',
              { event: '*', schema: 'public', table: 'duell_wetten' },
              (p) => {
                const ereignis = wetteRealtimeEreignis(p)
                if (ereignis) cb(ereignis)
              }
            )
          }
          if (abrechnungVerfuegbar) {
            builder = builder.on(
              'postgres_changes',
              { event: '*', schema: 'public', table: 'wochenabrechnung' },
              (p) => {
                if (p.eventType === 'DELETE') return
                const a = p.new as AbrechnungZeile | null
                if (a?.woche) cb({ typ: 'abrechnung', abrechnung: zeileZuAbrechnung(a) })
              }
            )
          }
          starteKanal(mitNoten(mitGesundheit(builder)))
          return
        }

        const melde = (zeile: EinheitZeile | null, art: 'neu' | 'wert') => {
          if (!zeile) return
          const einheit = zeileZuEinheit(zeile)
          if (einheit) cb({ typ: 'einheit', art, einheit })
        }

        let builder = neuerKanal('einheiten')
          .on(
            'postgres_changes',
            { event: 'INSERT', schema: 'public', table: 'einheiten' },
            (p) => melde(p.new as EinheitZeile, 'neu')
          )
          .on(
            'postgres_changes',
            { event: 'UPDATE', schema: 'public', table: 'einheiten' },
            (p) => melde(p.new as EinheitZeile, 'wert')
          )
          // Unter RLS enthaelt old bei DELETE auch mit replica identity full
          // nur den Primaerschluessel. Mehr braucht der Store zum Entfernen nicht.
          .on(
            'postgres_changes',
            { event: 'DELETE', schema: 'public', table: 'einheiten' },
            (p) => {
              const id = realtimeLoeschId(p)
              if (id) cb({ typ: 'einheit', art: 'weg', id })
            }
          )
        if (wettenVerfuegbar) {
          builder = builder.on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'duell_wetten' },
            (p) => {
              const ereignis = wetteRealtimeEreignis(p)
              if (ereignis) cb(ereignis)
            }
          )
        }
        if (abrechnungVerfuegbar) {
          builder = builder.on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'wochenabrechnung' },
            (p) => {
              if (p.eventType === 'DELETE') return
              const a = p.new as AbrechnungZeile | null
              if (a?.woche) cb({ typ: 'abrechnung', abrechnung: zeileZuAbrechnung(a) })
            }
          )
        }
        starteKanal(mitNoten(mitGesundheit(builder)))
      })

      return () => {
        abgemeldet = true
        if (kanal) entferneRealtimeKanal(db, kanal)
      }
    },
  }
}
