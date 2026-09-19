import { describe, expect, it } from 'vitest'
import { kalenderMonate, tageImMonat, wochenImMonat, wochenZeitraum } from './kalender'

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

  it('gruppiert das monatsraster in wochenzeilen mit ihrem montag', () => {
    // september 2026 beginnt an einem dienstag: die erste zeile startet im august
    const wochen = wochenImMonat(tageImMonat(2026, 8))
    expect(wochen[0]!.montag).toBe('2026-08-31')
    expect(wochen[0]!.tage[0]).toBeNull()
    expect(wochen[0]!.tage[1]).toBe('2026-09-01')
    expect(wochen[2]!.montag).toBe('2026-09-14')
    expect(wochen[2]!.tage[0]).toBe('2026-09-14')
    expect(wochen.every((w) => w.tage.length === 7)).toBe(true)
  })

  it('hängt den bericht einer woche über den monatswechsel an genau eine zeile', () => {
    // dieselbe woche 31.08.–06.09. steht in beiden monatsrastern
    const august = wochenImMonat(tageImMonat(2026, 7))
    const september = wochenImMonat(tageImMonat(2026, 8))
    const inAugust = august.find((w) => w.montag === '2026-08-31')!
    const inSeptember = september.find((w) => w.montag === '2026-08-31')!

    expect(inAugust.traegtBericht).toBe(false)
    expect(inSeptember.traegtBericht).toBe(true)
    // jede woche taucht genau einmal mit zeichen auf
    expect(august.filter((w) => w.traegtBericht)).toHaveLength(4)
  })
})
