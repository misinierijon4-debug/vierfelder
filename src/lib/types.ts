export type AreaId = 'lernen' | 'gym' | 'boxen' | 'lesen'
export type UserId = 'erijon' | 'koray'
export type AppTab = 'tracker' | 'schlaf'

/**
 * alles, was in die wochenwertung zählt. `AreaId` bleibt absichtlich bei den
 * vier antippbaren bereichen: nur die landen in `eintraege`, und so kann
 * `schreibeTick` typsicher nie ein 'gewicht' dorthin schreiben.
 */
export type FeldId = AreaId | 'gewicht'

/**
 * die bereiche, für die es eine messung gibt. nur hier trägt die unterscheidung
 * zwischen gemessen und getippt eine aussage: bei lernen und lesen kann kein
 * gerät wissen, ob es stattgefunden hat, also wäre die marke dort kein urteil
 * über den eintrag, sondern nur rauschen.
 */
export type MessbarerBereich = 'gym' | 'boxen'

export const MESSBARE_BEREICHE: MessbarerBereich[] = ['gym', 'boxen']

export function istMessbar(f: FeldId): f is MessbarerBereich {
  return f === 'gym' || f === 'boxen'
}

/** wie ein tick zustande kam. `null`, wo eine messung gar nicht möglich wäre */
export type TickQuelle = 'gemessen' | 'getippt'

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

/**
 * das gewicht ist kein tick, den man antippt, sondern eine messung — es zählt
 * aber genauso in wochenstand, raster und bilanz. deshalb steht es neben AREAS
 * und nicht darin.
 */
export const GEWICHT_FELD = { id: 'gewicht' as const, label: 'gewicht' }

/** alles, worüber gewertet wird: die vier bereiche und das gewicht */
export const FELDER: { id: FeldId; label: string }[] = [
  ...AREAS.map((a) => ({ id: a.id as FeldId, label: a.label })),
  GEWICHT_FELD,
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

/** `${user}|${area}|${yyyy-mm-dd}` — der schlüssel eines tages je person */
export type TickKey = string

/** altbestand: der haken je person, bereich und tag aus `eintraege` */
export type Ticks = Record<TickKey, true>

/** altbestand: `${area}|${yyyy-mm-dd}` -> tageswert aus `werte`, nur eigene */
export type Werte = Record<string, number>

/**
 * eine einzelne durchführung. gym um sieben und gym um sieben abends sind zwei
 * einheiten, kein ersetzter tageswert. `wert` ist null, wo nie eine dauer
 * erfasst wurde — geraten wird nichts.
 */
export type Einheit = {
  /** uuid, vom client erzeugt. dieselbe id zweimal zu senden legt nichts an */
  id: string
  user: UserId
  area: AreaId
  /** lokaler kalendertag, gebildet mit `toKey` — nie aus einer utc-zeit */
  tag: string
  /** minuten oder seiten, je nach bereich. null heißt: nie erfasst */
  wert: number | null
  /** zeitpunkt der eintragung als iso-string, soweit vorhanden */
  erfasst: string | null
}

/** `${user}|${area}|${yyyy-mm-dd}` -> die einheiten des tages, älteste zuerst */
export type Einheiten = Record<TickKey, Einheit[]>

/** `${user}|${yyyy-mm-dd}` -> kilogramm. beide sehen beide, wie bei den ticks */
export type Gewichte = Record<string, number>

/**
 * ein gemessener aufenthalt an einem trainingsort, so wie die
 * standort-automation ihn gemeldet hat. `abgang` fehlt, solange man noch da
 * ist — ein offener aufenthalt zählt nicht, sonst wäre eine vorbeifahrt ein
 * training.
 */
export type Aufenthalt = {
  user: UserId
  bereich: MessbarerBereich
  ort: string
  ankunft: string
  abgang: string | null
}

export type Zustand = {
  einheiten: Einheiten
  gewichte: Gewichte
  aufenthalte: Aufenthalt[]
}

export type PhasenArt = 'tief' | 'rem' | 'kern' | 'unspez' | 'wach'

/** ein stück nacht. start und dauer in minuten, gezählt ab der einschlafzeit */
export type Phase = {
  art: PhasenArt
  start: number
  dauer: number
}

/**
 * eine nacht, so wie `schlafnaechte_ansicht` sie liefert. kein score:
 * jedes feld hier ist eine gemessene größe aus apple health.
 */
export type Schlafnacht = {
  user: UserId
  nacht: string
  schlafMinuten: number
  einschlafzeit: string
  aufwachzeit: string | null
  bettStart: string | null
  bettEnde: string | null
  bettMinuten: number | null
  tiefMinuten: number
  remMinuten: number
  kernMinuten: number
  unspezMinuten: number
  wachMinuten: number
  /** persönliches schlafziel aus dem kurzbefehl */
  zielMinuten: number
  /** leer, wenn die quelle keine stadien liefert. dann bleibt die dauer */
  phasen: Phase[]
}

export function tickKey(u: UserId, a: AreaId, tag: string): TickKey {
  return `${u}|${a}|${tag}`
}

/**
 * eine id, die auf jedem gerät und ohne netz entsteht. sie ist der primary key
 * der zeile: ein wiederholtes senden nach einem timeout legt deshalb keine
 * zweite einheit an, sondern läuft ins leere.
 */
export function neueEinheitId(): string {
  const c = globalThis.crypto
  if (c && typeof c.randomUUID === 'function') return c.randomUUID()
  // älteres webview: zufall aus getRandomValues, sonst aus Math.random
  const bytes = new Uint8Array(16)
  if (c && typeof c.getRandomValues === 'function') c.getRandomValues(bytes)
  else for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256)
  bytes[6] = (bytes[6]! & 0x0f) | 0x40
  bytes[8] = (bytes[8]! & 0x3f) | 0x80
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

export function wertKey(a: AreaId, tag: string): string {
  return `${a}|${tag}`
}

export function gewichtKey(u: UserId, tag: string): string {
  return `${u}|${tag}`
}

export type Ereignis = {
  id: number
  user: UserId
  area: AreaId
  tag: string
  gesetzt: boolean
  quelle: 'selbst' | 'fremd'
}
