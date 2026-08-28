import { addDays, toKey } from './dates'
import { FELDER, gewichtKey, istMessbar, tickKey, wertKey } from './types'
import type { AreaId, FeldId, TickQuelle, UserId, Werte, Zustand } from './types'
import { gemessen } from './training'

/**
 * beim gewicht gibt es keinen eigenen tick: gesetzt heißt schlicht, dass für
 * diesen tag ein gewichtseintrag existiert. eine zweite zeile in `eintraege`
 * wäre eine zweite wahrheit — und ein tick ohne messung.
 *
 * bei gym und boxen kommt eine zweite quelle dazu: ein gemessener aufenthalt
 * setzt den tick von allein. das antippen bleibt trotzdem möglich, weil eine
 * standort-automation ausfallen kann und boxen auch zuhause stattfindet — was
 * dabei herauskommt, unterscheidet `quelle`.
 */
export function istGesetzt(z: Zustand, u: UserId, f: FeldId, tag: string): boolean {
  if (f === 'gewicht') return z.gewichte[gewichtKey(u, tag)] !== undefined
  if (istMessbar(f) && gemessen(z.aufenthalte, u, f, tag)) return true
  return z.ticks[tickKey(u, f, tag)] === true
}

/**
 * wie der tick zustande kam — die einzige antwort auf „man kann ja einfach
 * behaupten, man war da". `null` heißt nicht ungesetzt, sondern: hier gibt es
 * nichts zu unterscheiden (lernen, lesen), also wird auch nichts angezeigt.
 */
export function quelle(z: Zustand, u: UserId, f: FeldId, tag: string): TickQuelle | null {
  if (!istGesetzt(z, u, f, tag)) return null
  if (f === 'gewicht') return 'gemessen'
  if (!istMessbar(f)) return null
  return gemessen(z.aufenthalte, u, f, tag) ? 'gemessen' : 'getippt'
}

/** ticks eines feldes in der woche */
export function wocheBereich(
  z: Zustand,
  u: UserId,
  f: FeldId,
  woche: string[]
): number {
  return woche.reduce((n, tag) => n + (istGesetzt(z, u, f, tag) ? 1 : 0), 0)
}

/** alle ticks der woche über die vier bereiche und das gewicht, maximum 35 */
export function wocheGesamt(z: Zustand, u: UserId, woche: string[]): number {
  return FELDER.reduce((n, f) => n + wocheBereich(z, u, f.id, woche), 0)
}

/** abstand zum anderen in diesem feld, positiv heißt vorne */
export function abstand(
  z: Zustand,
  f: FeldId,
  woche: string[],
  ich: UserId,
  er: UserId
): number {
  return wocheBereich(z, ich, f, woche) - wocheBereich(z, er, f, woche)
}

/** tage am stück, rückwärts ab heute. heute zählt nur, wenn gesetzt */
export function streak(z: Zustand, u: UserId, f: FeldId, heute: Date): number {
  let cursor = istGesetzt(z, u, f, toKey(heute)) ? heute : addDays(heute, -1)
  let tage = 0
  for (let i = 0; i < 400; i++) {
    if (!istGesetzt(z, u, f, toKey(cursor))) break
    tage++
    cursor = addDays(cursor, -1)
  }
  return tage
}

export function wert(w: Werte, a: AreaId, tag: string): number {
  return w[wertKey(a, tag)] ?? 0
}

export function setzeTick(z: Zustand, u: UserId, a: AreaId, tag: string, gesetzt: boolean): Zustand {
  const ticks = { ...z.ticks }
  const key = tickKey(u, a, tag)
  if (gesetzt) ticks[key] = true
  else delete ticks[key]
  return { ...z, ticks }
}

export function setzeWert(z: Zustand, a: AreaId, tag: string, v: number): Zustand {
  const werte = { ...z.werte }
  const key = wertKey(a, tag)
  const sauber = Math.max(0, Math.round(v))
  if (sauber === 0) delete werte[key]
  else werte[key] = sauber
  return { ...z, werte }
}

export type Bilanzzeile = {
  area: FeldId
  ich: number
  er: number
}

export function bilanz(
  z: Zustand,
  woche: string[],
  ich: UserId,
  er: UserId
): Bilanzzeile[] {
  return FELDER.map((f) => ({
    area: f.id,
    ich: wocheBereich(z, ich, f.id, woche),
    er: wocheBereich(z, er, f.id, woche),
  }))
}
