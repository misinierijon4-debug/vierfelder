import { addDays, toKey } from './dates'
import { FELDER, area, gewichtKey, istMessbar, neueEinheitId, tickKey } from './types'
import type {
  AreaId,
  Aufenthalt,
  Einheit,
  Einheiten,
  FeldId,
  Gewichte,
  Schlafnacht,
  TickQuelle,
  UserId,
  Zustand,
} from './types'
import { dauerMinuten, gemessen, messungen, tagVon, zaehlt } from './training'

/**
 * beim gewicht gibt es keine einheit: gesetzt heißt schlicht, dass für diesen
 * tag ein gewichtseintrag existiert. eine einheit ohne messung wäre eine zweite
 * wahrheit.
 *
 * bei den vier bereichen kommt eine zweite quelle dazu: eine gemessene sitzung
 * setzt den tick von allein — ein aufenthalt am trainingsort oder ein fokus,
 * der lang genug lief. das antippen bleibt trotzdem möglich, weil eine
 * automation ausfallen kann und man auch ohne fokus liest — was dabei
 * herauskommt, unterscheidet `quelle`.
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
 * behaupten, man war da". seit es für jeden bereich eine messquelle gibt, gilt
 * die unterscheidung überall: `null` heißt nur noch, dass der tick gar nicht
 * gesetzt ist.
 */
export function quelle(z: Zustand, u: UserId, f: FeldId, tag: string): TickQuelle | null {
  if (!istGesetzt(z, u, f, tag)) return null
  // beim gewicht kommt die messung aus der waage über apple health und die
  // token-automation. wer die zahl in der app eintippt, hat getippt — eine
  // waage im bad macht aus einem daumen keine messung.
  if (f === 'gewicht') return z.gewichtQuellen?.[gewichtKey(u, tag)] ?? 'getippt'
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
  /**
   * einheit des werts. eine messung liefert immer minuten, auch beim lesen:
   * ein fokus misst zeit und kann keine seiten zählen.
   */
  einheit: 'min' | 'seiten'
  /** die durchführungszeit selbst, soweit sie erfasst wurde */
  von?: string | null
  /** zeitpunkt der eintragung (getippt) oder des beginns (gemessen) */
  erfasst: string | null
  herkunft: TickQuelle
  /** nur bei einer messung: der name der quelle, ein ort oder ein fokus */
  ort?: string
}

/** alle durchführungen eines tages, nach zeitpunkt sortiert */
export function tageseinheiten(z: Zustand, u: UserId, f: FeldId, tag: string): Tageseinheit[] {
  if (f === 'gewicht') return []

  const liste: Tageseinheit[] = einheitenAn(z, u, f, tag).map((e) => ({
    id: e.id,
    wert: e.wert,
    einheit: area(f).unit,
    von: e.von ?? null,
    erfasst: e.erfasst,
    herkunft: 'getippt' as const,
  }))

  for (const a of messungen(z.aufenthalte, u, f, tag)) {
    liste.push({
      id: `messung|${a.ankunft}|${a.ort}`,
      wert: Math.round(dauerMinuten(a)!),
      einheit: 'min',
      von: null,
      erfasst: a.ankunft,
      herkunft: 'gemessen',
      ort: a.ort,
    })
  }

  // ohne zeitpunkt nach vorn: das sind die übernommenen altbestände, und die
  // liegen vor allem, was seither mit uhrzeit dazugekommen ist.
  return liste.sort((x, y) => {
    const xt = x.von ?? x.erfasst
    const yt = y.von ?? y.erfasst
    if (xt === yt) return 0
    if (xt === null) return -1
    if (yt === null) return 1
    return xt < yt ? -1 : 1
  })
}

/** wie oft die aktivität an diesem tag stattgefunden hat */
export function anzahlEinheiten(z: Zustand, u: UserId, f: FeldId, tag: string): number {
  return tageseinheiten(z, u, f, tag).length
}

/**
 * summe der werte eines tages, in der einheit des bereichs. einheiten ohne wert
 * zählen mit null mit, nicht mit einem geschätzten durchschnitt.
 *
 * beim lesen bleiben die gemessenen minuten hier draußen: minuten zu seiten zu
 * addieren ergäbe eine zahl, die nichts bedeutet. sie stehen dafür in
 * `messungsMinuten`.
 */
export function tagesWert(z: Zustand, u: UserId, f: FeldId, tag: string): number {
  if (f === 'gewicht') return 0
  const einheit = area(f).unit
  return tageseinheiten(z, u, f, tag)
    .filter((e) => e.einheit === einheit)
    .reduce((s, e) => s + (e.wert ?? 0), 0)
}

/** summe der gemessenen minuten eines tages, über alle sitzungen */
export function messungsMinuten(z: Zustand, u: UserId, f: FeldId, tag: string): number {
  return tageseinheiten(z, u, f, tag)
    .filter((e) => e.herkunft === 'gemessen')
    .reduce((s, e) => s + (e.wert ?? 0), 0)
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

/** wie viele der fünf felder an diesem tag stehen. maximum 5 */
export function erledigteFelder(z: Zustand, u: UserId, tag: string): number {
  return FELDER.reduce((n, f) => n + (istGesetzt(z, u, f.id, tag) ? 1 : 0), 0)
}

/**
 * jeder tag, an dem diese person überhaupt etwas hat — einheiten, ein gewicht
 * oder eine gemessene sitzung. der kalender braucht das, um zu wissen, wie weit
 * die historie zurückreicht.
 */
export function tageMitDaten(z: Zustand, u: UserId): string[] {
  const tage = new Set<string>()

  for (const [key, liste] of Object.entries(z.einheiten)) {
    if (liste.length > 0 && key.startsWith(`${u}|`)) tage.add(key.slice(key.lastIndexOf('|') + 1))
  }
  for (const key of Object.keys(z.gewichte)) {
    if (key.startsWith(`${u}|`)) tage.add(key.slice(key.indexOf('|') + 1))
  }
  for (const a of z.aufenthalte) {
    if (a.user === u && zaehlt(a)) tage.add(tagVon(a))
  }

  return [...tage].sort()
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
  jetzt: Date = new Date(),
  von?: string | null
): Einheit {
  return {
    id: neueEinheitId(),
    user: u,
    area: a,
    tag,
    wert: saeubere(wert),
    erfasst: jetzt.toISOString(),
    von: von ?? null,
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

/**
 * eine live gemeldete nacht in die liste einsortieren.
 *
 * Person und Nacht sind der Schluessel, nicht die Reihenfolge des Eintreffens:
 * ein zweiter Lauf des Kurzbefehls meldet dieselbe Nacht noch einmal, und zwei
 * Zeilen fuer eine Nacht wuerden im Kalender doppelt stehen und den
 * Wochenschnitt verfaelschen. Sortiert bleibt die Liste wie beim Laden.
 */
export function mitNacht(naechte: Schlafnacht[], neue: Schlafnacht): Schlafnacht[] {
  const ohne = naechte.filter((n) => !(n.user === neue.user && n.nacht === neue.nacht))
  ohne.push(neue)
  return ohne.sort((a, b) => (a.nacht < b.nacht ? -1 : a.nacht > b.nacht ? 1 : 0))
}

/** ein gewicht vom zweiten geraet. `kg === null` entfernt den eintrag */
export function mitGewicht(
  gewichte: Gewichte,
  user: UserId,
  tag: string,
  kg: number | null
): Gewichte {
  const key = gewichtKey(user, tag)
  // unveraendert heisst unveraendert: dieselbe identitaet spart den render
  if (kg === null ? !(key in gewichte) : gewichte[key] === kg) return gewichte
  const next = { ...gewichte }
  if (kg === null) delete next[key]
  else next[key] = kg
  return next
}

/**
 * eine gemessene ankunft oder ein abgang.
 *
 * Die Ankunft legt den Aufenthalt an, der Abgang schliesst ihn — dieselbe
 * Ankunft kommt also zweimal, das zweite Mal mit `abgang`. Person, Bereich und
 * Ankunftszeit sind der Schluessel; die Ankunftszeit aendert sich nie.
 */
export function mitAufenthalt(aufenthalte: Aufenthalt[], neuer: Aufenthalt): Aufenthalt[] {
  const idx = aufenthalte.findIndex(
    (x) => x.user === neuer.user && x.bereich === neuer.bereich && x.ankunft === neuer.ankunft
  )
  if (idx === -1) return [...aufenthalte, neuer]
  const vorhanden = aufenthalte[idx]!
  if (vorhanden.abgang === neuer.abgang && vorhanden.ort === neuer.ort) return aufenthalte
  const next = [...aufenthalte]
  next[idx] = neuer
  return next
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

/**
 * uebernimmt die veraenderlichen felder einer einheit (wert und von) anhand
 * der id — fuer den realtime-weg und den lokalen kanal, wo ein update als
 * ganze einheit ankommt.
 */
export function mitEinheit(einheiten: Einheiten, e: Einheit): Einheiten {
  const next: Einheiten = {}
  let getroffen = false
  for (const [key, liste] of Object.entries(einheiten)) {
    next[key] = liste.map((x) => {
      if (x.id !== e.id) return x
      getroffen = true
      return { ...x, wert: e.wert, von: e.von === undefined ? x.von : e.von }
    })
  }
  return getroffen ? next : einheiten
}

export function mitVon(einheiten: Einheiten, id: string, von: string | null): Einheiten {
  const next: Einheiten = {}
  let getroffen = false
  for (const [key, liste] of Object.entries(einheiten)) {
    next[key] = liste.map((x) => {
      if (x.id !== id) return x
      getroffen = true
      return { ...x, von }
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

/**
 * ob an diesem tag überhaupt eine dauer erfasst ist. null und 0 sind nicht
 * dasselbe: „ohne wert" heißt nie erfasst, 0 heißt heruntergezählt bis auf
 * null. die bereichszeile zeigt deshalb zwei verschiedene dinge an.
 */
export function hatTageswert(z: Zustand, u: UserId, f: FeldId, tag: string): boolean {
  if (f === 'gewicht') return false
  // in der einheit des bereichs gefragt: eine gemessene lesestunde ist kein
  // seitenwert, dort steht weiter „ohne wert" — die minuten stehen rechts.
  const einheit = area(f).unit
  return tageseinheiten(z, u, f, tag).some((e) => e.einheit === einheit && e.wert !== null)
}
