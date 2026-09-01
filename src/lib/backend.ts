import type {
  Aufenthalt,
  Einheit,
  Einheiten,
  Fach,
  Gewichte,
  Note,
  Notenstand,
  Phase,
  Schlafnacht,
  UserId,
} from './types'

/** eine einheit, so wie realtime oder ein anderer tab sie meldet */
export type EinheitEreignis = {
  typ: 'einheit'
  art: 'neu' | 'weg' | 'wert'
  einheit: Einheit
}

export type WetteEreignis = { typ: 'wette'; woche: string; text: string }
export type FachEreignis = { typ: 'fach'; art: 'neu' | 'weg' | 'wert'; fach: Fach }
export type NoteEreignis = { typ: 'note'; art: 'neu' | 'weg' | 'wert'; note: Note }

/**
 * eine nacht, die gerade importiert oder neu bewertet wurde. sie ersetzt die
 * vorhandene nacht derselben person, sonst käme dieselbe nacht doppelt in die
 * liste, wenn der kurzbefehl zweimal läuft.
 */
export type SchlafEreignis = { typ: 'schlaf'; nacht: Schlafnacht }

/** ein gewicht von einem anderen gerät. `kg === null` heißt gelöscht */
export type GewichtEreignis = {
  typ: 'gewicht'
  user: UserId
  tag: string
  kg: number | null
}

/** eine gemessene ankunft oder ein abgang, so wie die automation sie schreibt */
export type AufenthaltEreignis = { typ: 'aufenthalt'; aufenthalt: Aufenthalt }

export type BackendEreignis =
  | EinheitEreignis
  | WetteEreignis
  | SchlafEreignis
  | GewichtEreignis
  | AufenthaltEreignis
  | FachEreignis
  | NoteEreignis
export type Wetten = Record<string, string>

export type Anfangszustand = {
  me: UserId
  einheiten: Einheiten
  gewichte: Gewichte
  schlaf: Schlafnacht[]
  /** gemessene trainingsbesuche beider personen. schreibt nur die datenbank */
  aufenthalte: Aufenthalt[]
  wetten: Wetten
  noten: Notenstand
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
  /** nimmt eine einzelne durchführung zurück */
  loescheEinheit(e: Einheit): Promise<void>
  /** nimmt den ganzen tag zurück, mit allen einheiten */
  loescheTag(einheiten: Einheit[]): Promise<void>
  /** kilogramm für einen tag. `kg <= 0` löscht den eintrag */
  schreibeGewicht(tag: string, kg: number): Promise<void>
  /** gemeinsamer Einsatz, Schluessel ist der lokale Montag der Woche */
  schreibeWette(woche: string, text: string): Promise<void>
  /** einzige veränderliche fachangabe: mündliches prüfungsfach 4 oder 5 */
  setzePruefungsfach(fachId: string, nummer: number | null): Promise<void>
  schreibeNote(note: Note): Promise<void>
  loescheNote(id: string): Promise<void>
  /**
   * holt den verlauf einer einzelnen nacht nach. nur das nachtdetail braucht
   * ihn, deshalb kommt er nicht mit der ganzen historie mit.
   */
  ladePhasen(user: UserId, nacht: string): Promise<Phase[]>
  /** ruft cb bei jeder fremden oder eigenen einheit auf. gibt die abmeldung zurück */
  abonniere(cb: (e: BackendEreignis) => void): () => void
}
