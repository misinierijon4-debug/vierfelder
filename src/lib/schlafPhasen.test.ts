import { describe, expect, it } from 'vitest'
import { analysiereSchlafnacht, formatDauer, normalisierePhase } from './schlafPhasen'
import type { Schlafnacht } from './types'

describe('schlafPhasen', () => {
  it('formatiert Dauer verständlich in Stunden und Minuten', () => {
    expect(formatDauer(473)).toBe('7h 53m')
    expect(formatDauer(480)).toBe('8h')
    expect(formatDauer(45)).toBe('45m')
    expect(formatDauer(0)).toBe('0m')
  })

  it('normalisiert Phasen-Textwerte und HealthKit-Identifier', () => {
    expect(normalisierePhase('HKCategoryValueSleepAnalysisAsleepDeep')).toBe('deep')
    expect(normalisierePhase('AsleepREM')).toBe('rem')
    expect(normalisierePhase('Core')).toBe('core')
    expect(normalisierePhase('Awake')).toBe('awake')
    expect(normalisierePhase('InBed')).toBe('in_bed')
    expect(normalisierePhase('tief')).toBe('deep')
    expect(normalisierePhase('wach')).toBe('awake')
  })

  it('analysiert Rohsegmente einer Nacht und berechnet Phasen & Effizienz', () => {
    const nacht: Schlafnacht = {
      user: 'erijon',
      nacht: '2026-08-26',
      schlafMinuten: 492,
      einschlafzeit: '2026-08-25T23:25:42+02:00',
      wachphasen: 1,
      wachMinuten: 48,
      nachtwert: 88,
      bewertungsbasis: 100,
      rohsegmente: [
        { start: '2026-08-25T23:25:42+02:00', end: '2026-08-26T00:14:12+02:00', value: 'Awake' },
        { start: '2026-08-26T00:14:12+02:00', end: '2026-08-26T01:14:12+02:00', value: 'AsleepDeep' },
        { start: '2026-08-26T01:14:12+02:00', end: '2026-08-26T03:14:12+02:00', value: 'AsleepREM' },
        { start: '2026-08-26T03:14:12+02:00', end: '2026-08-26T08:25:42+02:00', value: 'AsleepCore' },
      ],
    }

    const res = analysiereSchlafnacht(nacht)
    expect(res.user).toBe('erijon')
    expect(res.tiefMinuten).toBe(60)
    expect(res.remMinuten).toBe(120)
    expect(res.coreMinuten).toBe(312)
    expect(res.wachMinuten).toBe(49)
    expect(res.schlafMinuten).toBe(492)
    expect(res.inBedMinuten).toBe(541)
    expect(res.effizienz).toBeGreaterThan(90)
    expect(res.einschlafUhrzeit).toContain(':')
    expect(res.aufwachUhrzeit).toContain(':')
  })
})
