import type {
  Abrechnung,
  Aufenthalt,
  Einheit,
  Einheiten,
  Fach,
  Gewichte,
  GewichtQuellen,
  Note,
  Notenstand,
  Phase,
  Schlafnacht,
  TickQuelle,
  UserId,
} from './types'

/** eine einheit, so wie realtime oder ein anderer tab sie meldet */
export type EinheitEreignis =
  | { typ: 'einheit'; art: 'neu' | 'wert'; einheit: Einheit }
  | { typ: 'einheit'; art: 'weg'; id: string }

export const KEINE_WETTE_VERSION = '0'

export type WetteMeta = {
  /** global monoton von der kanonischen Schreibstelle vergeben */
  version: string
  /** Auth-UUID bei Supabase, lokale Person im Prototyp, `legacy` bei Altbestand */
  updatedBy: string
  /** server- bzw. speicherseitig erzeugter ISO-Zeitpunkt */
  updatedAt: string
}

export type WetteStand = WetteMeta & {
  woche: string
  /** null ist ein versionierter Tombstone und verhindert ABA nach einem Delete */
  text: string | null
}

export type WettenMeta = Record<string, WetteMeta>

export type WetteEreignis =
  | { typ: 'wette'; art: 'wert'; stand: WetteStand }
  | { typ: 'wette'; art: 'invalidierung'; woche?: string }
export type AbrechnungEreignis = { typ: 'abrechnung'; abrechnung: Abrechnung }
export type FachEreignis =
  | { typ: 'fach'; art: 'neu' | 'wert'; fach: Fach }
  | { typ: 'fach'; art: 'weg'; id: string }
export type NoteEreignis =
  | { typ: 'note'; art: 'neu' | 'wert'; note: Note }
  | { typ: 'note'; art: 'weg'; id: string }

/**
 * eine nacht, die importiert, neu bewertet oder aus der lesprojektion entfernt
 * wurde. eine wertmeldung ersetzt die vorhandene nacht derselben person.
 */
export type SchlafEreignis =
  | { typ: 'schlaf'; art: 'wert'; nacht: Schlafnacht }
  | { typ: 'schlaf'; art: 'weg'; user: UserId; nacht: string }

/** ein gewicht von einem anderen gerät. `kg === null` heißt gelöscht */
export type GewichtEreignis = {
  typ: 'gewicht'
  user: UserId
  tag: string
  kg: number | null
  /** wie die zahl geschrieben wurde. ohne angabe gilt sie als getippt */
  quelle?: TickQuelle
}

/** eine gemessene ankunft oder ein abgang, so wie die automation sie schreibt */
export type AufenthaltEreignis =
  | { typ: 'aufenthalt'; art: 'wert'; aufenthalt: Aufenthalt }
  | { typ: 'aufenthalt'; art: 'weg'; id: string }

export type BackendDatenEreignis =
  | EinheitEreignis
  | WetteEreignis
  | AbrechnungEreignis
  | SchlafEreignis
  | GewichtEreignis
  | AufenthaltEreignis
  | FachEreignis
  | NoteEreignis

export type RealtimeFehlergrund =
  | 'channel_error'
  | 'timed_out'
  | 'closed'
  | 'replication_error'

/**
 * Zustand des Live-Kanals. `bereit` bedeutet, dass nicht nur der WebSocket,
 * sondern auch die dahinterliegende Postgres-Replikation bestaetigt ist.
 * Fehlertexte des Providers bleiben absichtlich ausserhalb des UI-Vertrags.
 */
export type VerbindungEreignis =
  | { typ: 'verbindung'; status: 'verbindet' }
  | { typ: 'verbindung'; status: 'transportbereit' }
  | { typ: 'verbindung'; status: 'bereit' }
  | { typ: 'verbindung'; status: 'veraltet'; grund: RealtimeFehlergrund }

export type BackendEreignis = BackendDatenEreignis | VerbindungEreignis
export type Wetten = Record<string, string>

const WETTE_VERSION_MUSTER = /^(0|[1-9][0-9]*)$/
const DATUM_MUSTER = /^\d{4}-\d{2}-\d{2}$/

/** Bigint bleibt im Browser Text und wird nur fuer den Vergleich zu BigInt. */
export function istWetteVersion(wert: unknown, nullErlaubt = false): wert is string {
  if (typeof wert !== 'string' || !WETTE_VERSION_MUSTER.test(wert)) return false
  return nullErlaubt || wert !== KEINE_WETTE_VERSION
}

export function vergleicheWetteVersion(a: string, b: string): number {
  if (!istWetteVersion(a, true) || !istWetteVersion(b, true)) {
    throw new Error('ungueltige wette-version')
  }
  const links = BigInt(a)
  const rechts = BigInt(b)
  return links < rechts ? -1 : links > rechts ? 1 : 0
}

/** Strikte UTC-Pruefung vermeidet normalisierte Fantasiedaten wie 2026-02-31. */
export function istWochenmontag(woche: unknown): woche is string {
  if (typeof woche !== 'string' || !DATUM_MUSTER.test(woche)) return false
  const datum = new Date(`${woche}T00:00:00.000Z`)
  return !Number.isNaN(datum.getTime())
    && datum.toISOString().slice(0, 10) === woche
    && datum.getUTCDay() === 1
}

export type Anfangszustand = {
  me: UserId
  einheiten: Einheiten
  gewichte: Gewichte
  /** je gewicht: getippt oder von der waage gemessen. fehlt = getippt */
  gewichtQuellen: GewichtQuellen
  schlaf: Schlafnacht[]
  /** gemessene trainingsbesuche beider personen. schreibt nur die datenbank */
  aufenthalte: Aufenthalt[]
  wetten: Wetten
  /** kanonische CAS-Basis, einschliesslich geloeschter Wochen-Tombstones */
  wettenMeta: WettenMeta
  /** archivierte sonntagsabrechnungen, älteste zuerst */
  abrechnungen: Abrechnung[]
  noten: Notenstand
  /** die optionale durchfuehrungszeit kann schon gespeichert werden */
  einheitVonVerfuegbar: boolean
  /**
   * die tabelle `einheiten` fehlt noch, gelesen wurde aus `eintraege` und
   * `werte`. dann gibt es genau eine einheit pro tag und die oberfläche bietet
   * keine zweite an — besser als eine app, die leer aussieht, weil migration
   * und deploy nicht in derselben minute passiert sind.
   */
  altbestand: boolean
}

/**
 * die app kennt nur dieses interface. lokal (prototyp) und supabase
 * erfüllen es beide, App.tsx merkt den unterschied nicht.
 */
export interface Backend {
  readonly art: 'lokal' | 'supabase'
  /**
   * stabile kennung dieser datenquelle. sie trennt den gemerkten offline-stand
   * zweier konten auf demselben geraet und ueberlebt einen neustart der app.
   */
  readonly kennung: string
  laden(): Promise<Anfangszustand>
  /** legt eine durchführung an. die id kommt vom client und macht das wiederholbar */
  schreibeEinheit(e: Einheit): Promise<void>
  /** stellt bis zu 64 geloeschte durchfuehrungen atomar und idempotent wieder her */
  stelleEinheitenWiederHer(einheiten: readonly Einheit[]): Promise<void>
  /** ändert die minuten oder seiten einer einheit */
  schreibeEinheitWert(e: Einheit, wert: number | null): Promise<void>
  /** ändert die erfasste durchführungszeit einer einheit. null löscht sie */
  schreibeEinheitVon(e: Einheit, von: string | null): Promise<void>
  /** nimmt eine einzelne durchführung zurück */
  loescheEinheit(e: Einheit): Promise<void>
  /** nimmt den ganzen tag zurück, mit allen einheiten */
  loescheTag(einheiten: Einheit[]): Promise<void>
  /** kilogramm für einen tag. `kg <= 0` löscht den eintrag */
  schreibeGewicht(tag: string, kg: number): Promise<void>
  /**
   * Gemeinsamer Einsatz; leer erzeugt einen Tombstone. Die Mutation darf nur
   * auf exakt der Version aufbauen, die der Nutzer gesehen hat.
   */
  schreibeWette(woche: string, text: string, erwarteteVersion: string): Promise<WetteStand>
  /** archiviert die sonntagsabrechnung und gibt die kanonisch gespeicherte Zeile zurück */
  schreibeAbrechnung(a: Abrechnung): Promise<Abrechnung>
  /** wechselt das vierte Prüfungsfach atomar und bestätigt die Ziel-ID */
  setzePruefungsfach(fachId: string, erwartetesFachId: string): Promise<string>
  /** idempotente Notenmutation; Erfolg bestätigt dieselbe UUID */
  schreibeNote(note: Note): Promise<string>
  loescheNote(id: string): Promise<string>
  /**
   * holt den verlauf einer einzelnen nacht nach. nur das nachtdetail braucht
   * ihn, deshalb kommt er nicht mit der ganzen historie mit.
   */
  ladePhasen(user: UserId, nacht: string, signal: AbortSignal): Promise<Phase[]>
  /** ruft cb bei jeder fremden oder eigenen einheit auf. gibt die abmeldung zurück */
  abonniere(cb: (e: BackendEreignis) => void): () => void
}
