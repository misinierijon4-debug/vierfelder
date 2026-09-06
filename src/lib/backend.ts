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

export type WetteEreignis = { typ: 'wette'; woche: string; text: string | null }
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
  laden(): Promise<Anfangszustand>
  /** legt eine durchführung an. die id kommt vom client und macht das wiederholbar */
  schreibeEinheit(e: Einheit): Promise<void>
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
  /** gemeinsamer Einsatz, Schluessel ist der lokale Montag der Woche */
  schreibeWette(woche: string, text: string): Promise<void>
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
