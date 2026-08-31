import type { Aufenthalt, Einheit, Einheiten, Gewichte, Schlafnacht, UserId } from './types'

/** eine einheit, so wie realtime oder ein anderer tab sie meldet */
export type EinheitEreignis = {
  typ: 'einheit'
  art: 'neu' | 'weg' | 'wert'
  einheit: Einheit
}

export type WetteEreignis = { typ: 'wette'; woche: string; text: string }
export type BackendEreignis = EinheitEreignis | WetteEreignis
export type Wetten = Record<string, string>

export type Anfangszustand = {
  me: UserId
  einheiten: Einheiten
  gewichte: Gewichte
  schlaf: Schlafnacht[]
  /** gemessene trainingsbesuche beider personen. schreibt nur die datenbank */
  aufenthalte: Aufenthalt[]
  wetten: Wetten
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
  /** ruft cb bei jeder fremden oder eigenen einheit auf. gibt die abmeldung zurück */
  abonniere(cb: (e: BackendEreignis) => void): () => void
}
