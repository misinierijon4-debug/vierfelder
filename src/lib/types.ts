export type AreaId = 'lernen' | 'gym' | 'boxen' | 'lesen'
export type UserId = 'erijon' | 'koray'
export type AppTab = 'tracker' | 'schlaf'

export type AreaDef = {
  id: AreaId
  label: string
  unit: 'min' | 'seiten'
  step: number
}

export type UserDef = {
  id: UserId
  name: string
  farbe: string
  leer: string
}

export const AREAS: AreaDef[] = [
  { id: 'lernen', label: 'lernen', unit: 'min', step: 15 },
  { id: 'gym', label: 'gym', unit: 'min', step: 15 },
  { id: 'boxen', label: 'boxen', unit: 'min', step: 15 },
  { id: 'lesen', label: 'lesen', unit: 'seiten', step: 10 },
]

/** farbe gehört der person, nicht der rolle */
export const USERS: UserDef[] = [
  { id: 'erijon', name: 'erijon', farbe: 'var(--erijon)', leer: 'var(--erijon-leer)' },
  { id: 'koray', name: 'koray', farbe: 'var(--koray)', leer: 'var(--koray-leer)' },
]

export function user(id: UserId): UserDef {
  return USERS.find((u) => u.id === id)!
}

export function other(id: UserId): UserDef {
  return USERS.find((u) => u.id !== id)!
}

export function area(id: AreaId): AreaDef {
  return AREAS.find((a) => a.id === id)!
}

/** `${user}|${area}|${yyyy-mm-dd}` — spiegelt den primary key von `eintraege` */
export type TickKey = string

export type Ticks = Record<TickKey, true>

/** `${area}|${yyyy-mm-dd}` — liegt pro nutzer getrennt, spiegelt `werte` */
export type Werte = Record<string, number>

export type Zustand = {
  ticks: Ticks
  werte: Werte
}

export type RohsegmentDef = {
  start: string
  end: string
  value: string | number
  source?: string
}

export type Schlafnacht = {
  user: UserId
  nacht: string
  schlafMinuten: number
  einschlafzeit: string
  wachphasen: number | null
  wachMinuten: number | null
  nachtwert: number
  bewertungsbasis: 80 | 100
  schlafzielMinuten?: number
  rohsegmente?: RohsegmentDef[]
}

export function tickKey(u: UserId, a: AreaId, tag: string): TickKey {
  return `${u}|${a}|${tag}`
}

export function wertKey(a: AreaId, tag: string): string {
  return `${a}|${tag}`
}

export type Ereignis = {
  id: number
  user: UserId
  area: AreaId
  tag: string
  gesetzt: boolean
  quelle: 'selbst' | 'fremd'
}
