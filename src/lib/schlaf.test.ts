import { describe, expect, it } from 'vitest'
import { berechneSchlafnacht, normalisiereSchlafwert } from '../../supabase/functions/_shared/schlaf'

const basis = '2026-08-26'

function segment(start: string, end: string, value: string | number) {
  return {
    start: `${basis}T${start}+02:00`,
    end: `${basis}T${end}+02:00`,
    value,
    source: 'test',
  }
}

describe('schlafwerte', () => {
  it('versteht exportnamen, kurzbefehlsnamen und rohwerte', () => {
    expect(normalisiereSchlafwert('HKCategoryValueSleepAnalysisAsleepCore')).toBe('asleep_core')
    expect(normalisiereSchlafwert('Wach')).toBe('awake')
    expect(normalisiereSchlafwert(5)).toBe('asleep_rem')
  })

  it('ignoriert in-bed und vereinigt überlappende schlafstadien', () => {
    const nacht = berechneSchlafnacht(
      [
        segment('00:00:00', '08:00:00', 'InBed'),
        segment('00:30:00', '04:30:00', 'Core'),
        segment('04:00:00', '08:00:00', 'REM'),
        segment('02:00:00', '02:10:00', 'Awake'),
      ],
      480,
      []
    )

    expect(nacht.schlafMinuten).toBe(440)
    expect(nacht.wachMinuten).toBe(10)
    expect(nacht.wachphasen).toBe(1)
    expect(nacht.nacht).toBe('2026-08-26')
  })

  it('führt kurze, getrennte wachsegmente zu einer phase zusammen', () => {
    const nacht = berechneSchlafnacht(
      [
        segment('00:00:00', '08:00:00', 'Core'),
        segment('02:00:00', '02:01:00', 'Awake'),
        segment('02:02:00', '02:03:00', 'Awake'),
      ],
      480,
      []
    )

    expect(nacht.wachMinuten).toBe(2)
    expect(nacht.wachphasen).toBe(1)
  })

  it('normiert ohne awake auf 80 punkte und vergibt nichts für fehlende konsistenz', () => {
    const nacht = berechneSchlafnacht([segment('00:00:00', '08:00:00', 'Core')], 480, [])

    expect(nacht.bewertungsbasis).toBe(80)
    expect(nacht.konsistenzPunkte).toBeNull()
    expect(nacht.unterbrechungPunkte).toBeNull()
    expect(nacht.nachtwert).toBe(63)
  })

  it('nimmt bei einem 24-stunden-fenster die letzte in-bed-episode', () => {
    const nacht = berechneSchlafnacht(
      [
        segment('14:00:00', '15:00:00', 'InBed'),
        segment('14:10:00', '14:50:00', 'Core'),
        segment('22:00:00', '23:59:00', 'InBed'),
        segment('22:15:00', '23:45:00', 'Core'),
      ],
      480,
      []
    )

    expect(nacht.schlafMinuten).toBe(90)
    expect(nacht.einschlafzeit).toContain('22:15:00')
  })

  it('berechnet den median pro nutzer aus höchstens 13 vorherigen nächten', () => {
    const historie = Array.from({ length: 15 }, (_, i) => ({
      nacht: `2026-08-${String(25 - i).padStart(2, '0')}`,
      einschlafzeit: `2026-08-${String(25 - i).padStart(2, '0')}T23:30:00+02:00`,
    }))
    const nacht = berechneSchlafnacht(
      [segment('23:45:00', '23:59:00', 'Core'), segment('23:58:00', '23:59:00', 'Awake')],
      480,
      historie
    )

    expect(nacht.historieNaechte).toBe(13)
    expect(nacht.medianAbweichungMinuten).toBe(15)
    expect(nacht.konsistenzPunkte).toBe(27.5)
  })

  it('lehnt unbekannte kategorien und unformatierte daten ab', () => {
    expect(() => normalisiereSchlafwert('perfekt')).toThrow('unbekannter schlafwert')
    expect(() =>
      berechneSchlafnacht(
        [{ start: '26.08.2026 00:00', end: '26.08.2026 08:00', value: 'Core' }],
        480,
        []
      )
    ).toThrow('ISO 8601')
  })
})
