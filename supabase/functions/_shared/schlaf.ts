export type Schlafwert =
  | 'in_bed'
  | 'asleep_unspecified'
  | 'asleep_core'
  | 'asleep_deep'
  | 'asleep_rem'
  | 'awake'

export type Rohsegment = {
  start: string
  end: string
  value: string | number
  source?: string
}

export type SchlafHistorie = {
  nacht: string
  einschlafzeit: string
}

export type Schlafberechnung = {
  nacht: string
  schlafMinuten: number
  einschlafzeit: string
  wachphasen: number | null
  wachMinuten: number | null
  nachtwert: number
  bewertungsbasis: 80 | 100
  dauerPunkte: number
  konsistenzPunkte: number | null
  unterbrechungPunkte: number | null
  medianAbweichungMinuten: number | null
  historieNaechte: number
  wachsegmenteVorhanden: boolean
  quellen: string[]
}

type Intervall = { start: number; end: number }
type NormalisiertesSegment = Rohsegment & {
  art: Schlafwert
  startMs: number
  endMs: number
}

const ISO_MIT_ZONE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/
const MINUTE = 60_000

/**
 * Sleep Cycle zerlegt kurze Wachphasen teils in mehrere 30-Sekunden-Stücke.
 * Wachsegmente mit weniger als zwei Minuten Schlaf dazwischen gelten deshalb
 * als eine Unterbrechung. Die Dauer bleibt davon unberührt.
 */
export const WACH_MERGE_GAP_MINUTEN = 2

const NAMEN: Record<string, Schlafwert> = {
  hkcategoryvaluesleepanalysisinbed: 'in_bed',
  hkcategoryvaluesleepanalysisasleepunspecified: 'asleep_unspecified',
  hkcategoryvaluesleepanalysisasleepcore: 'asleep_core',
  hkcategoryvaluesleepanalysisasleepdeep: 'asleep_deep',
  hkcategoryvaluesleepanalysisasleeprem: 'asleep_rem',
  hkcategoryvaluesleepanalysisawake: 'awake',
  inbed: 'in_bed',
  imbett: 'in_bed',
  asleep: 'asleep_unspecified',
  asleepunspecified: 'asleep_unspecified',
  schlaf: 'asleep_unspecified',
  core: 'asleep_core',
  asleepcore: 'asleep_core',
  kern: 'asleep_core',
  deep: 'asleep_deep',
  asleepdeep: 'asleep_deep',
  tief: 'asleep_deep',
  rem: 'asleep_rem',
  asleeprem: 'asleep_rem',
  awake: 'awake',
  wach: 'awake',
}

// HKCategoryValueSleepAnalysis-Rohwerte. Zusätzlich werden die ausgeschriebenen
// und die in deutschen Kurzbefehlen üblichen Textwerte akzeptiert.
const ZAHLEN: Record<number, Schlafwert> = {
  0: 'in_bed',
  1: 'asleep_unspecified',
  2: 'awake',
  3: 'asleep_core',
  4: 'asleep_deep',
  5: 'asleep_rem',
}

export function normalisiereSchlafwert(value: string | number): Schlafwert {
  if (typeof value === 'number' && Number.isInteger(value) && ZAHLEN[value]) return ZAHLEN[value]

  const text = String(value).trim()
  if (/^[0-5]$/.test(text)) return ZAHLEN[Number(text)]!

  const key = text.toLowerCase().replace(/[^a-z0-9äöüß]/g, '')
  const art = NAMEN[key]
  if (!art) throw new Error(`unbekannter schlafwert: ${text}`)
  return art
}

function zeit(value: string): number {
  if (!ISO_MIT_ZONE.test(value)) {
    throw new Error(`datum muss ISO 8601 mit zeitzone sein: ${value}`)
  }
  const parsed = Date.parse(value)
  if (!Number.isFinite(parsed)) throw new Error(`ungültiges datum: ${value}`)
  return parsed
}

function normalisiereSegmente(segmente: Rohsegment[]): NormalisiertesSegment[] {
  if (!Array.isArray(segmente) || segmente.length === 0) {
    throw new Error('mindestens ein schlafsegment fehlt')
  }
  if (segmente.length > 300) throw new Error('höchstens 300 segmente pro nacht erlaubt')

  const gesehen = new Set<string>()
  const normalisiert: NormalisiertesSegment[] = []

  for (const segment of segmente) {
    if (!segment || typeof segment !== 'object') throw new Error('segment ist ungültig')
    if (typeof segment.start !== 'string' || typeof segment.end !== 'string') {
      throw new Error('segment braucht start und end')
    }
    const art = normalisiereSchlafwert(segment.value)
    const startMs = zeit(segment.start)
    const endMs = zeit(segment.end)
    if (endMs <= startMs) throw new Error('segmentende muss nach dem start liegen')
    if (endMs - startMs > 24 * 60 * MINUTE) throw new Error('ein segment ist länger als 24 stunden')

    const key = `${startMs}|${endMs}|${art}|${segment.source ?? ''}`
    if (gesehen.has(key)) continue
    gesehen.add(key)
    normalisiert.push({ ...segment, art, startMs, endMs })
  }

  const start = Math.min(...normalisiert.map((s) => s.startMs))
  const end = Math.max(...normalisiert.map((s) => s.endMs))
  if (end - start > 36 * 60 * MINUTE) {
    throw new Error('segmente umfassen mehr als 36 stunden und damit mehr als eine nacht')
  }

  return normalisiert.sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs)
}

function waehleLetzteNacht(segmente: NormalisiertesSegment[]): NormalisiertesSegment[] {
  const inBed = segmente.filter((s) => s.art === 'in_bed').sort((a, b) => b.endMs - a.endMs)
  if (inBed.length > 0) {
    const anker = inBed[0]!
    return segmente.filter((s) => s.startMs < anker.endMs && s.endMs > anker.startMs)
  }

  // Quellen ohne InBed werden an einer Lücke von drei Stunden getrennt. Bei
  // einem 24-Stunden-Fenster gewinnt die zuletzt endende Schlafepisode; ein
  // früherer Mittagsschlaf verändert damit weder Dauer noch Einschlafzeit.
  const cluster: NormalisiertesSegment[][] = []
  let ende = 0
  for (const segment of segmente) {
    const aktuell = cluster[cluster.length - 1]
    if (!aktuell || segment.startMs - ende > 3 * 60 * MINUTE) cluster.push([segment])
    else aktuell.push(segment)
    ende = Math.max(ende, segment.endMs)
  }
  return cluster.sort(
    (a, b) => Math.max(...b.map((s) => s.endMs)) - Math.max(...a.map((s) => s.endMs))
  )[0]!
}

function vereinige(intervalle: Intervall[], gapMs = 0): Intervall[] {
  const sortiert = intervalle
    .filter((i) => i.end > i.start)
    .sort((a, b) => a.start - b.start || a.end - b.end)

  if (sortiert.length === 0) return []
  const ergebnis: Intervall[] = [{ ...sortiert[0]! }]

  for (const aktuell of sortiert.slice(1)) {
    const letztes = ergebnis[ergebnis.length - 1]!
    if (aktuell.start <= letztes.end + gapMs) letztes.end = Math.max(letztes.end, aktuell.end)
    else ergebnis.push({ ...aktuell })
  }

  return ergebnis
}

function schneide(intervalle: Intervall[], start: number, end: number): Intervall[] {
  return intervalle
    .map((i) => ({ start: Math.max(i.start, start), end: Math.min(i.end, end) }))
    .filter((i) => i.end > i.start)
}

function zieheAb(basis: Intervall[], abzug: Intervall[]): Intervall[] {
  let rest = vereinige(basis)
  for (const minus of vereinige(abzug)) {
    const naechster: Intervall[] = []
    for (const teil of rest) {
      if (minus.end <= teil.start || minus.start >= teil.end) {
        naechster.push(teil)
        continue
      }
      if (minus.start > teil.start) naechster.push({ start: teil.start, end: minus.start })
      if (minus.end < teil.end) naechster.push({ start: minus.end, end: teil.end })
    }
    rest = naechster
  }
  return rest
}

function minuten(intervalle: Intervall[]): number {
  return intervalle.reduce((summe, i) => summe + (i.end - i.start) / MINUTE, 0)
}

function runde(value: number, stellen = 2): number {
  const faktor = 10 ** stellen
  return Math.round(value * faktor) / faktor
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function lokaleUhrzeitMinuten(iso: string): number {
  const match = iso.match(/T(\d{2}):(\d{2})/)
  if (!match) throw new Error(`uhrzeit fehlt im datum: ${iso}`)
  const minute = Number(match[1]) * 60 + Number(match[2])
  // 00:15 soll direkt neben 23:45 liegen, nicht am anderen Ende des Tages.
  return minute < 18 * 60 ? minute + 24 * 60 : minute
}

function median(values: number[]): number {
  const sortiert = [...values].sort((a, b) => a - b)
  const mitte = Math.floor(sortiert.length / 2)
  return sortiert.length % 2 ? sortiert[mitte]! : (sortiert[mitte - 1]! + sortiert[mitte]!) / 2
}

/**
 * Eigener "nachtwert", kein Apple-Schlafindex.
 *
 * Dauer: linear 0 bis 50 Punkte; das persönliche Ziel entspricht 50 Punkten.
 * Konsistenz: 30 Punkte bei exakt dem Median der bis zu 13 vorigen Nächte,
 * linear fallend bis 0 Punkte bei 180 Minuten Abweichung.
 * Unterbrechungen: 12 Punkte für die Gesamtdauer, linear bis 0 bei 30 Minuten;
 * 8 Punkte für die Anzahl, linear bis 0 bei acht zusammengeführten Wachphasen.
 *
 * Ohne Awake-Segmente bleibt der 20-Punkte-Faktor vollständig weg. Die
 * verbleibenden maximal 80 Punkte werden auf 0 bis 100 umgerechnet. Fehlt der
 * Konsistenzverlauf in der ersten Nacht, werden dafür 0 statt 30 Punkte gesetzt.
 */
export function berechneSchlafnacht(
  segmente: Rohsegment[],
  schlafzielMinuten: number,
  historie: SchlafHistorie[]
): Schlafberechnung {
  if (!Number.isInteger(schlafzielMinuten) || schlafzielMinuten < 240 || schlafzielMinuten > 720) {
    throw new Error('schlafzielMinuten muss eine ganze zahl zwischen 240 und 720 sein')
  }

  const normalisiert = waehleLetzteNacht(normalisiereSegmente(segmente))
  const schlaf = normalisiert.filter((s) => s.art.startsWith('asleep_'))
  if (schlaf.length === 0) throw new Error('keine auswertbaren schlafsegmente gefunden')

  const einschlafSegment = schlaf.reduce((a, b) => (a.startMs <= b.startMs ? a : b))
  const letztesSchlafSegment = schlaf.reduce((a, b) => (a.endMs >= b.endMs ? a : b))
  const schlafStart = einschlafSegment.startMs
  const schlafEnde = letztesSchlafSegment.endMs

  const wachRoh = normalisiert
    .filter((s) => s.art === 'awake')
    .map((s) => ({ start: s.startMs, end: s.endMs }))
  const wachsegmenteVorhanden = wachRoh.length > 0
  const wachInSchlafspanne = schneide(wachRoh, schlafStart, schlafEnde)
  const wachFuerDauer = vereinige(wachInSchlafspanne)
  const wachphasen = vereinige(wachInSchlafspanne, WACH_MERGE_GAP_MINUTEN * MINUTE)

  const schlafVereinigt = vereinige(schlaf.map((s) => ({ start: s.startMs, end: s.endMs })))
  // Bei widersprüchlichen Quellen zählt derselbe Zeitraum nie zugleich als wach
  // und schlafend. Awake gewinnt, weil fehlende Daten nicht positiv wirken dürfen.
  const reineSchlafzeit = zieheAb(schlafVereinigt, wachFuerDauer)
  const schlafMinuten = runde(minuten(reineSchlafzeit))
  const wachMinuten = runde(minuten(wachFuerDauer))

  const nacht = letztesSchlafSegment.end.slice(0, 10)
  const dauerPunkte = runde(50 * clamp(schlafMinuten / schlafzielMinuten, 0, 1))

  const vorige = [...historie]
    .filter((h) => h.nacht < nacht)
    .sort((a, b) => b.nacht.localeCompare(a.nacht))
    .slice(0, 13)
  let konsistenzPunkte: number | null = null
  let medianAbweichungMinuten: number | null = null
  if (vorige.length > 0) {
    const referenz = median(vorige.map((h) => lokaleUhrzeitMinuten(h.einschlafzeit)))
    medianAbweichungMinuten = runde(Math.abs(lokaleUhrzeitMinuten(einschlafSegment.start) - referenz))
    konsistenzPunkte = runde(30 * (1 - clamp(medianAbweichungMinuten / 180, 0, 1)))
  }

  let unterbrechungPunkte: number | null = null
  if (wachsegmenteVorhanden) {
    const dauerAnteil = 12 * (1 - clamp(wachMinuten / 30, 0, 1))
    const anzahlAnteil = 8 * (1 - clamp(wachphasen.length / 8, 0, 1))
    unterbrechungPunkte = runde(dauerAnteil + anzahlAnteil)
  }

  const bewertungsbasis: 80 | 100 = wachsegmenteVorhanden ? 100 : 80
  const erreichtePunkte = dauerPunkte + (konsistenzPunkte ?? 0) + (unterbrechungPunkte ?? 0)
  const nachtwert = Math.round(clamp((erreichtePunkte / bewertungsbasis) * 100, 0, 100))

  return {
    nacht,
    schlafMinuten,
    einschlafzeit: einschlafSegment.start,
    wachphasen: wachsegmenteVorhanden ? wachphasen.length : null,
    wachMinuten: wachsegmenteVorhanden ? wachMinuten : null,
    nachtwert,
    bewertungsbasis,
    dauerPunkte,
    konsistenzPunkte,
    unterbrechungPunkte,
    medianAbweichungMinuten,
    historieNaechte: vorige.length,
    wachsegmenteVorhanden,
    quellen: [...new Set(normalisiert.map((s) => s.source?.trim()).filter(Boolean) as string[])],
  }
}
