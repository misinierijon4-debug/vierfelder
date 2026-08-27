import type { Schlafnacht, UserId } from './types'

export type SchlafPhaseArt = 'deep' | 'rem' | 'core' | 'awake' | 'in_bed'

export type PhasenSegment = {
  art: SchlafPhaseArt
  start: string
  end: string
  startMs: number
  endMs: number
  dauerMinuten: number
}

export type NachtPhasenAnalyse = {
  nacht: string
  user: UserId
  schlafMinuten: number
  inBedMinuten: number
  effizienz: number
  einschlafzeit: string
  aufwachzeit: string
  einschlafUhrzeit: string
  aufwachUhrzeit: string
  tiefMinuten: number
  remMinuten: number
  coreMinuten: number
  wachMinuten: number
  wachphasenAnzahl: number
  tiefProzent: number
  remProzent: number
  coreProzent: number
  wachProzent: number
  phasen: PhasenSegment[]
}

export function formatDauer(minuten: number): string {
  const m = Math.max(0, Math.round(minuten))
  const h = Math.floor(m / 60)
  const restM = m % 60
  if (h === 0) return `${restM}m`
  if (restM === 0) return `${h}h`
  return `${h}h ${restM}m`
}

export function formatUhrzeit(isoString: string): string {
  try {
    const d = new Date(isoString)
    if (isNaN(d.getTime())) return '--:--'
    return d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
  } catch {
    return '--:--'
  }
}

export function normalisierePhase(rawVal: string | number): SchlafPhaseArt {
  const s = String(rawVal).toLowerCase().replace(/[^a-z0-9]/g, '')
  if (s.includes('deep') || s === 'tief' || s === '4') return 'deep'
  if (s.includes('rem') || s === '5') return 'rem'
  if (s.includes('core') || s === 'kern' || s === '3') return 'core'
  if (s.includes('awake') || s === 'wach' || s === '2') return 'awake'
  if (s.includes('inbed') || s === 'imbett' || s === '0') return 'in_bed'
  return 'core'
}

export function analysiereSchlafnacht(nacht: Schlafnacht): NachtPhasenAnalyse {
  const raw = nacht.rohsegmente ?? []
  const segs = raw.map((s) => {
    const startMs = Date.parse(s.start)
    const endMs = Date.parse(s.end)
    const dauerMinuten = Math.max(0, (endMs - startMs) / 60000)
    return {
      art: normalisierePhase(s.value),
      start: s.start,
      end: s.end,
      startMs,
      endMs,
      dauerMinuten,
    } satisfies PhasenSegment
  }).filter((s) => !isNaN(s.startMs) && !isNaN(s.endMs) && s.endMs > s.startMs)

  const schlafSegs = segs.filter((s) => s.art !== 'in_bed').sort((a, b) => a.startMs - b.startMs)

  let tief = 0
  let rem = 0
  let core = 0
  let wach = nacht.wachMinuten ?? 0
  let wachCount = nacht.wachphasen ?? 0

  if (schlafSegs.length > 0) {
    tief = Math.round(schlafSegs.filter((s) => s.art === 'deep').reduce((acc, s) => acc + s.dauerMinuten, 0))
    rem = Math.round(schlafSegs.filter((s) => s.art === 'rem').reduce((acc, s) => acc + s.dauerMinuten, 0))
    core = Math.round(schlafSegs.filter((s) => s.art === 'core').reduce((acc, s) => acc + s.dauerMinuten, 0))
    const berechnetesWach = Math.round(schlafSegs.filter((s) => s.art === 'awake').reduce((acc, s) => acc + s.dauerMinuten, 0))
    if (berechnetesWach > 0) wach = berechnetesWach
    const berechneteWachCount = schlafSegs.filter((s) => s.art === 'awake').length
    if (berechneteWachCount > 0) wachCount = berechneteWachCount
  }

  // Falls Segmente 0 Minuten ergeben, schätze Phasen aus nacht.schlafMinuten
  let schlafMin = (tief + rem + core)
  if (schlafMin <= 0) {
    schlafMin = nacht.schlafMinuten
    tief = Math.round(schlafMin * 0.22)
    rem = Math.round(schlafMin * 0.28)
    core = Math.max(0, schlafMin - tief - rem)
  }

  const inBed = Math.max(schlafMin, Math.round(schlafMin + (wach || 0)))

  // Start- und Endzeit
  let startMs = Date.parse(nacht.einschlafzeit)
  if (isNaN(startMs) && schlafSegs.length > 0) {
    startMs = schlafSegs[0]!.startMs
  }
  if (isNaN(startMs)) {
    startMs = new Date(`${nacht.nacht}T23:30:00+02:00`).getTime() - 24 * 3600 * 1000
  }

  // Berechne Endzeit immer konsistent aus Startzeit + InBed-Dauer
  const endMs = startMs + inBed * 60000

  const startIso = new Date(startMs).toISOString()
  const endIso = new Date(endMs).toISOString()

  const effizienz = inBed > 0 ? Math.min(100, Math.max(0, Math.round((schlafMin / inBed) * 100))) : 100

  const tiefProzent = schlafMin > 0 ? Math.round((tief / schlafMin) * 100) : 0
  const remProzent = schlafMin > 0 ? Math.round((rem / schlafMin) * 100) : 0
  const coreProzent = schlafMin > 0 ? Math.max(0, 100 - tiefProzent - remProzent) : 0
  const wachProzent = inBed > 0 ? Math.round((wach / inBed) * 100) : 0

  return {
    nacht: nacht.nacht,
    user: nacht.user,
    schlafMinuten: schlafMin,
    inBedMinuten: inBed,
    effizienz,
    einschlafzeit: startIso,
    aufwachzeit: endIso,
    einschlafUhrzeit: formatUhrzeit(startIso),
    aufwachUhrzeit: formatUhrzeit(endIso),
    tiefMinuten: tief,
    remMinuten: rem,
    coreMinuten: core,
    wachMinuten: wach,
    wachphasenAnzahl: wachCount,
    tiefProzent,
    remProzent,
    coreProzent,
    wachProzent,
    phasen: schlafSegs,
  }
}
