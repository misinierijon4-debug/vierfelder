import type { AreaId, Ticks, UserId, Werte } from './types'

/** ein einzelner tick, so wie ihn realtime liefert */
export type TickEreignis = {
  user: UserId
  area: AreaId
  tag: string
  gesetzt: boolean
}

export type Anfangszustand = {
  me: UserId
  ticks: Ticks
  werte: Werte
}

/**
 * die app kennt nur dieses interface. lokal (prototyp) und supabase
 * erfüllen es beide, App.tsx merkt den unterschied nicht.
 */
export interface Backend {
  readonly art: 'lokal' | 'supabase'
  laden(): Promise<Anfangszustand>
  schreibeTick(area: AreaId, tag: string, gesetzt: boolean): Promise<void>
  schreibeWert(area: AreaId, tag: string, wert: number): Promise<void>
  /** ruft cb bei jedem fremden oder eigenen tick auf. gibt die abmeldung zurück */
  abonniere(cb: (e: TickEreignis) => void): () => void
}
