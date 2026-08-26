import { addDays, toKey } from './dates'
import { AREAS, tickKey, wertKey } from './types'
import type { AreaId, UserId, Werte, Zustand } from './types'

export function istGesetzt(z: Zustand, u: UserId, a: AreaId, tag: string): boolean {
  return z.ticks[tickKey(u, a, tag)] === true
}

/** ticks eines bereichs in der woche */
export function wocheBereich(
  z: Zustand,
  u: UserId,
  a: AreaId,
  woche: string[]
): number {
  return woche.reduce((n, tag) => n + (istGesetzt(z, u, a, tag) ? 1 : 0), 0)
}

/** alle ticks der woche über alle vier bereiche, maximum 28 */
export function wocheGesamt(z: Zustand, u: UserId, woche: string[]): number {
  return AREAS.reduce((n, a) => n + wocheBereich(z, u, a.id, woche), 0)
}

/** abstand zum anderen in diesem bereich, positiv heißt vorne */
export function abstand(
  z: Zustand,
  a: AreaId,
  woche: string[],
  ich: UserId,
  er: UserId
): number {
  return wocheBereich(z, ich, a, woche) - wocheBereich(z, er, a, woche)
}

/** tage am stück, rückwärts ab heute. heute zählt nur, wenn gesetzt */
export function streak(z: Zustand, u: UserId, a: AreaId, heute: Date): number {
  let cursor = istGesetzt(z, u, a, toKey(heute)) ? heute : addDays(heute, -1)
  let tage = 0
  for (let i = 0; i < 400; i++) {
    if (!istGesetzt(z, u, a, toKey(cursor))) break
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
  area: AreaId
  ich: number
  er: number
}

export function bilanz(
  z: Zustand,
  woche: string[],
  ich: UserId,
  er: UserId
): Bilanzzeile[] {
  return AREAS.map((a) => ({
    area: a.id,
    ich: wocheBereich(z, ich, a.id, woche),
    er: wocheBereich(z, er, a.id, woche),
  }))
}
