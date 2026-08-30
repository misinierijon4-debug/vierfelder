import { addDays, toKey } from './dates'
import { FELDER, gewichtKey, istMessbar, neueEinheitId, tickKey } from './types'
import type {
  AreaId,
  Einheit,
  Einheiten,
  FeldId,
  TickQuelle,
  UserId,
  Zustand,
} from './types'
import { dauerMinuten, gemessen, messungen } from './training'

/**
 * beim gewicht gibt es keine einheit: gesetzt heißt schlicht, dass für diesen
 * tag ein gewichtseintrag existiert. eine einheit ohne messung wäre eine zweite
 * wahrheit.
 *
 * bei gym und boxen kommt eine zweite quelle dazu: ein gemessener aufenthalt
 * setzt den tick von allein. das antippen bleibt trotzdem möglich, weil eine
 * standort-automation ausfallen kann und boxen auch zuhause stattfindet — was
 * dabei herauskommt, unterscheidet `quelle`.
 *
 * seit den einheiten heißt „getippt gesetzt": es gibt mindestens eine einheit.
 * ob es eine oder drei sind, ändert am haken nichts — der wochenstand zählt
 * tage, nicht durchführungen.
 */
export function istGesetzt(z: Zustand, u: UserId, f: FeldId, tag: string): boolean {
  if (f === 'gewicht') return z.gewichte[gewichtKey(u, tag)] !== undefined
  if (istMessbar(f) && gemessen(z.aufenthalte, u, f, tag)) return true
  return einheitenAn(z, u, f, tag).length > 0
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

/** die getippten einheiten eines tages, älteste zuerst. nie undefined */
export function einheitenAn(z: Zustand, u: UserId, f: FeldId, tag: string): Einheit[] {
  if (f === 'gewicht') return []
  return z.einheiten[tickKey(u, f, tag)] ?? []
}

/**
 * eine einheit, wie die oberfläche sie zeigt: getippt aus `einheiten`,
 * gemessen aus einem aufenthalt. beide sind durchführungen, nur unterschiedlich
 * belegt — deshalb stehen sie in einer liste und nicht in zwei.
 */
export type Tageseinheit = {
  id: string
  wert: number | null
  /** zeitpunkt der eintragung (getippt) oder der ankunft (gemessen) */
  erfasst: string | null
  herkunft: TickQuelle
  /** nur bei einer messung: der trainingsort */
  ort?: string
}

/** alle durchführungen eines tages, nach zeitpunkt sortiert */
export function tageseinheiten(z: Zustand, u: UserId, f: FeldId, tag: string): Tageseinheit[] {
  if (f === 'gewicht') return []

  const liste: Tageseinheit[] = einheitenAn(z, u, f, tag).map((e) => ({
    id: e.id,
    wert: e.wert,
    erfasst: e.erfasst,
    herkunft: 'getippt' as const,
  }))

  for (const a of messungen(z.aufenthalte, u, f, tag)) {
    liste.push({
      id: `messung|${a.ankunft}|${a.ort}`,
      wert: Math.round(dauerMinuten(a)!),
      erfasst: a.ankunft,
      herkunft: 'gemessen',
      ort: a.ort,
    })
  }

  // ohne zeitpunkt nach vorn: das sind die übernommenen altbestände, und die
  // liegen vor allem, was seither mit uhrzeit dazugekommen ist.
  return liste.sort((x, y) => {
    if (x.erfasst === y.erfasst) return 0
    if (x.erfasst === null) return -1
    if (y.erfasst === null) return 1
    return x.erfasst < y.erfasst ? -1 : 1
  })
}

/** wie oft die aktivität an diesem tag stattgefunden hat */
export function anzahlEinheiten(z: Zustand, u: UserId, f: FeldId, tag: string): number {
  return tageseinheiten(z, u, f, tag).length
}

/**
 * summe der werte eines tages. einheiten ohne wert zählen mit null minuten mit,
 * nicht mit einem geschätzten durchschnitt.
 */
export function tagesWert(z: Zustand, u: UserId, f: FeldId, tag: string): number {
  return tageseinheiten(z, u, f, tag).reduce((s, e) => s + (e.wert ?? 0), 0)
}

/** die jüngste getippte einheit — die, auf die die schritte wirken */
export function letzteEinheit(z: Zustand, u: UserId, f: FeldId, tag: string): Einheit | null {
  const liste = einheitenAn(z, u, f, tag)
  return liste.length > 0 ? liste[liste.length - 1]! : null
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

function saeubere(v: number | null): number | null {
  if (v === null) return null
  return Math.max(0, Math.round(v))
}

/** eine einheit, wie sie in den zustand und in die datenbank geht */
export function baueEinheit(
  u: UserId,
  a: AreaId,
  tag: string,
  wert: number | null,
  jetzt: Date = new Date()
): Einheit {
  return {
    id: neueEinheitId(),
    user: u,
    area: a,
    tag,
    wert: saeubere(wert),
    erfasst: jetzt.toISOString(),
  }
}

/**
 * dieselbe einheit zweimal einzufügen ändert nichts: die id entscheidet. genau
 * das macht einen wiederholten schreibversuch und ein doppelt gemeldetes
 * realtime-ereignis harmlos.
 */
export function fuegeHinzu(einheiten: Einheiten, e: Einheit): Einheiten {
  const key = tickKey(e.user, e.area, e.tag)
  const vorhanden = einheiten[key] ?? []
  if (vorhanden.some((x) => x.id === e.id)) return einheiten
  return { ...einheiten, [key]: [...vorhanden, e] }
}

export function ohneEinheit(einheiten: Einheiten, id: string): Einheiten {
  const next: Einheiten = {}
  let getroffen = false
  for (const [key, liste] of Object.entries(einheiten)) {
    const rest = liste.filter((e) => e.id !== id)
    if (rest.length !== liste.length) getroffen = true
    if (rest.length > 0) next[key] = rest
  }
  return getroffen ? next : einheiten
}

export function mitWert(einheiten: Einheiten, id: string, wert: number | null): Einheiten {
  const next: Einheiten = {}
  let getroffen = false
  for (const [key, liste] of Object.entries(einheiten)) {
    next[key] = liste.map((e) => {
      if (e.id !== id) return e
      getroffen = true
      return { ...e, wert: saeubere(wert) }
    })
  }
  return getroffen ? next : einheiten
}

/** nimmt den ganzen tag zurück, mit allen einheiten */
export function ohneTag(
  einheiten: Einheiten,
  u: UserId,
  a: AreaId,
  tag: string
): Einheiten {
  const key = tickKey(u, a, tag)
  if (!einheiten[key]) return einheiten
  const next = { ...einheiten }
  delete next[key]
  return next
}

export function fuegeEinheitHinzu(z: Zustand, e: Einheit): Zustand {
  const einheiten = fuegeHinzu(z.einheiten, e)
  return einheiten === z.einheiten ? z : { ...z, einheiten }
}

export function entferneEinheit(z: Zustand, id: string): Zustand {
  const einheiten = ohneEinheit(z.einheiten, id)
  return einheiten === z.einheiten ? z : { ...z, einheiten }
}

export function setzeEinheitWert(z: Zustand, id: string, wert: number | null): Zustand {
  const einheiten = mitWert(z.einheiten, id, wert)
  return einheiten === z.einheiten ? z : { ...z, einheiten }
}

/**
 * der an/aus-schalter der bereichszeile. an legt die erste einheit an, aus
 * nimmt den ganzen tag zurück — auch eine zweite oder dritte einheit, sonst
 * bliebe ein haken stehen, den niemand mehr sieht.
 */
export function setzeTick(
  z: Zustand,
  u: UserId,
  a: AreaId,
  tag: string,
  gesetzt: boolean
): Zustand {
  if (!gesetzt) {
    const einheiten = ohneTag(z.einheiten, u, a, tag)
    return einheiten === z.einheiten ? z : { ...z, einheiten }
  }
  if (einheitenAn(z, u, a, tag).length > 0) return z
  return fuegeEinheitHinzu(z, baueEinheit(u, a, tag, null))
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
