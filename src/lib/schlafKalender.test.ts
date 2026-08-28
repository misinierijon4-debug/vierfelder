import { describe, expect, it } from 'vitest'
import { kalenderMonate, tageImMonat, wochenZeitraum } from './schlafKalender'

describe('schlafkalender', () => {
  it('ordnet einen monat montagsbasiert in volle wochen ein', () => {
    const august = tageImMonat(2026, 7)
    expect(august).toHaveLength(42)
    expect(august.slice(0, 5)).toEqual([null, null, null, null, null])
    expect(august[5]).toBe('2026-08-01')
    expect(august.at(-1)).toBeNull()
  })

  it('behaelt schalttage', () => {
    const februar = tageImMonat(2028, 1).filter(Boolean)
    expect(februar).toHaveLength(29)
    expect(februar.at(-1)).toBe('2028-02-29')
  })

  it('zeigt mindestens zwei monate und erweitert bis zur aeltesten nacht', () => {
    const kurz = kalenderMonate([], '2026-08-28', '2026-08-27')
    expect(kurz.map((m) => m.key)).toEqual(['2026-07', '2026-08'])

    const historie = kalenderMonate(['2025-12-31'], '2026-02-03', '2026-02-02')
    expect(historie.map((m) => m.key)).toEqual(['2025-12', '2026-01', '2026-02'])
  })

  it('formatiert die sichtbare woche kompakt', () => {
    expect(
      wochenZeitraum([
        '2026-08-17',
        '2026-08-18',
        '2026-08-19',
        '2026-08-20',
        '2026-08-21',
        '2026-08-22',
        '2026-08-23',
      ])
    ).toBe('17.–23. august')
  })
})
