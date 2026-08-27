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

  // Nicht-InBed Segmente
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
  } else {
    const rest = Math.max(0, nacht.schlafMinuten)
    tief = Math.round(rest * 0.20)
    rem = Math.round(rest * 0.25)
    core = Math.max(0, rest - tief - rem)
  }

  // Ermittle korrekte Start- und Endzeit
  let startMs = Date.parse(nacht.einschlafzeit)
  if (isNaN(startMs) && schlafSegs.length > 0) {
    startMs = schlafSegs[0]!.startMs
  }
  if (isNaN(startMs)) {
    startMs = new Date().setHours(23, 30, 0, 0)
  }

  const berechneteSchlafMinuten = (tief + rem + core) > 0 ? (tief + rem + core) : nacht.schlafMinuten
  const inBed = Math.max(berechneteSchlafMinuten, Math.round(berechneteSchlafMinuten + wach))
  
  // Endzeit: Wenn Segmente vorliegen und die Spanne plausibel ist (> 60% der Gesamtdauer),
  // nimm max(endMs). Sonst berechne sauber aus Startzeit + Dauer im Bett.
  let endMs: number
  if (schlafSegs.length > 0) {
    const segMinStart = Math.min(...schlafSegs.map((s) => s.startMs))
    const segMaxEnd = Math.max(...schlafSegs.map((s) => s.endMs))
    const segSpanMinuten = (segMaxEnd - segMinStart) / 60000
    if (segSpanMinuten >= inBed * 0.7) {
      endMs = segMaxEnd
      startMs = segMinStart
    } else {
      endMs = startMs + inBed * 60000
    }
  } else {
    endMs = startMs + inBed * 60000
  }

  const startIso = new Date(startMs).toISOString()
  const endIso = new Date(endMs).toISOString()

  const effizienz = inBed > 0 ? Math.min(100, Math.max(0, Math.round((berechneteSchlafMinuten / inBed) * 100))) : 100

  return {
    nacht: nacht.nacht,
    user: nacht.user,
    schlafMinuten: berechneteSchlafMinuten,
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
    phasen: schlafSegs,
  }
}
