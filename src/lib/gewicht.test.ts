import { describe, expect, it } from 'vitest'
import { addDays, toKey } from './dates'
import {
  achse,
  fenster,
  formatDelta,
  formatKg,
  gewichtAn,
  letztesGewicht,
  parseKg,
  reihe,
  reiheRoh,
  teileBeiLuecke,
  trend,
  xMarken,
} from './gewicht'
import { gewichtKey } from './types'
import type { Gewichte, UserId } from './types'

const HEUTE = new Date(2026, 7, 27)
const HEUTE_KEY = toKey(HEUTE)

/** tag relativ zu heute, negativ heißt in der vergangenheit */
function tag(versatz: number): string {
  return toKey(addDays(HEUTE, versatz))
}

function bau(...eintraege: [UserId, number, number][]): Gewichte {
  const g: Gewichte = {}
  for (const [u, versatz, kg] of eintraege) g[gewichtKey(u, tag(versatz))] = kg
  return g
}

function roh(...paare: [number, number][]): { tag: string; kg: number }[] {
  return paare.map(([versatz, kg]) => ({ tag: tag(versatz), kg }))
}

describe('trend', () => {
  it('ist bei einem einzigen eintrag der wert selbst', () => {
    expect(trend(roh([0, 81.4]))).toEqual([81.4])
  })

  it('mittelt zwei aufeinanderfolgende tage', () => {
    expect(trend(roh([-1, 80], [0, 82]))).toEqual([80, 81])
  })

  it('mittelt sieben tage und lässt den achten den ersten fallen', () => {
    const werte = trend(roh([-7, 100], [-6, 10], [-5, 10], [-4, 10], [-3, 10], [-2, 10], [-1, 10], [0, 10]))
    // punkt 7 (index 6) sieht die tage -6..0 im fenster, also 100 ist raus
    expect(werte[6]).toBeCloseTo(100 / 7 + (10 * 6) / 7, 5)
    expect(werte[7]).toBe(10)
  })

  it('mittelt nicht über eine lücke hinweg', () => {
    // kalenderbasiert: nach zehn leeren tagen steht der punkt allein im fenster
    const werte = trend(roh([-20, 90], [-19, 90], [0, 80]))
    expect(werte[2]).toBe(80)
  })

  it('ist kausal: ein späterer eintrag ändert einen früheren trend nicht', () => {
    const ohne = trend(roh([-2, 80], [-1, 82]))
    const mit = trend(roh([-2, 80], [-1, 82], [0, 100]))
    expect(mit[0]).toBe(ohne[0])
    expect(mit[1]).toBe(ohne[1])
  })
})

describe('reihe', () => {
  it('rechnet den trend über die volle historie und schneidet erst danach', () => {
    // 40 tage historie, fenster nur 30: der erste punkt im fenster muss die
    // sieben tage davor kennen und darf deshalb nicht sein eigener rohwert sein
    const eintraege: [UserId, number, number][] = []
    for (let i = 39; i >= 0; i--) eintraege.push(['erijon', -i, 80 + (i % 2)])
    const g = bau(...eintraege)

    const { von, bis } = fenster(g, HEUTE_KEY, 30)
    const r = reihe(g, 'erijon', von, bis)

    expect(r.punkte).toHaveLength(30)
    expect(r.punkte[0]!.trend).not.toBe(r.punkte[0]!.kg)
  })

  it('nullt jede person an ihrem eigenen ersten punkt', () => {
    const g = bau(['erijon', -20, 84], ['erijon', 0, 81], ['koray', -3, 74], ['koray', 0, 75])
    const { von, bis } = fenster(g, HEUTE_KEY, 30)

    const e = reihe(g, 'erijon', von, bis)
    const k = reihe(g, 'koray', von, bis)

    expect(e.punkte[0]!.delta).toBe(0)
    expect(e.basis).toBe(e.punkte[0]!.trend)
    // koray fängt mitten im fenster an und steht dort trotzdem bei null
    expect(k.punkte[0]!.tag).toBe(tag(-3))
    expect(k.punkte[0]!.delta).toBe(0)
  })

  it('verträgt eine person ganz ohne einträge', () => {
    const g = bau(['erijon', 0, 81])
    const { von, bis } = fenster(g, HEUTE_KEY, 30)
    const k = reihe(g, 'koray', von, bis)

    expect(k.punkte).toEqual([])
    expect(k.letzter).toBeNull()
  })

  it('nimmt nur die tage im fenster', () => {
    const g = bau(['erijon', -60, 90], ['erijon', -1, 81], ['erijon', 0, 80])
    const { von, bis } = fenster(g, HEUTE_KEY, 30)
    const r = reihe(g, 'erijon', von, bis)

    expect(r.punkte).toHaveLength(2)
    expect(r.letzter).toEqual({ tag: HEUTE_KEY, kg: 80 })
  })
})

describe('fenster', () => {
  it('zählt beide enden mit', () => {
    expect(fenster({}, HEUTE_KEY, 30)).toEqual({ von: tag(-29), bis: HEUTE_KEY })
    expect(fenster({}, HEUTE_KEY, 90)).toEqual({ von: tag(-89), bis: HEUTE_KEY })
  })

  it('nimmt bei alles den frühesten eintrag über beide personen', () => {
    const g = bau(['erijon', -10, 81], ['koray', -100, 75])
    expect(fenster(g, HEUTE_KEY, 'alles')).toEqual({ von: tag(-100), bis: HEUTE_KEY })
  })

  it('fällt bei alles ohne daten auf heute zurück', () => {
    expect(fenster({}, HEUTE_KEY, 'alles')).toEqual({ von: HEUTE_KEY, bis: HEUTE_KEY })
  })
})

describe('achse', () => {
  it('erzwingt eine mindestspanne, wenn alle werte gleich sind', () => {
    const g = bau(['erijon', -1, 80], ['erijon', 0, 80])
    const r = reihe(g, 'erijon', tag(-29), HEUTE_KEY)
    const a = achse([r])

    expect(a.max).toBeGreaterThan(a.min)
    expect(a.marken).toContain(0)
  })

  it('verschenkt bei reiner abnahme keine fläche nach oben', () => {
    const g = bau(['erijon', -20, 90], ['erijon', -10, 86], ['erijon', 0, 82])
    const r = reihe(g, 'erijon', tag(-29), HEUTE_KEY)
    const a = achse([r])

    expect(a.min).toBeLessThan(0)
    expect(a.max).toBe(0)
    expect(a.marken).toContain(0)
  })

  it('weitet die domain für einen rohen ausreißer', () => {
    const g = bau(['erijon', -2, 80], ['erijon', -1, 80], ['erijon', 0, 86])
    const r = reihe(g, 'erijon', tag(-29), HEUTE_KEY)
    const a = achse([r])
    const groesster = Math.max(...r.punkte.map((p) => p.kg - r.basis))

    expect(a.max).toBeGreaterThanOrEqual(groesster)
  })

  it('bleibt bei drei bis fünf marken, egal wie groß die spanne ist', () => {
    for (const abnahme of [0, 2, 6, 20, 40]) {
      const g = bau(['erijon', -20, 80 + abnahme], ['erijon', 0, 80])
      const r = reihe(g, 'erijon', tag(-29), HEUTE_KEY)
      const a = achse([r])

      expect(a.marken.length).toBeGreaterThanOrEqual(3)
      expect(a.marken.length).toBeLessThanOrEqual(5)
      expect(a.marken).toContain(0)
    }
  })

  it('liefert auch ohne jeden punkt eine benutzbare achse', () => {
    const a = achse([])
    expect(a.max).toBeGreaterThan(a.min)
    expect(Number.isFinite(a.min)).toBe(true)
  })
})

describe('teileBeiLuecke', () => {
  const punkte = (...versaetze: number[]) =>
    versaetze.map((v) => ({ tag: tag(v), kg: 80, trend: 80, delta: 0 }))

  it('teilt bei drei fehltagen nicht', () => {
    expect(teileBeiLuecke(punkte(-6, -3, 0))).toHaveLength(1)
  })

  it('teilt bei zehn fehltagen', () => {
    expect(teileBeiLuecke(punkte(-11, -10, 0))).toHaveLength(2)
  })

  it('macht aus einem einzelnen punkt ein eigenes stück', () => {
    expect(teileBeiLuecke(punkte(0))).toEqual([punkte(0)])
  })
})

describe('xMarken', () => {
  it('liefert vier eindeutige marken über dreißig tage', () => {
    const marken = xMarken(tag(-29), HEUTE_KEY)
    expect(marken).toHaveLength(4)
    expect(new Set(marken.map((m) => m.tag)).size).toBe(4)
    expect(marken[0]!.tag).toBe(tag(-29))
    expect(marken[3]!.tag).toBe(HEUTE_KEY)
  })

  it('kommt mit einem fenster von einem tag klar', () => {
    const marken = xMarken(HEUTE_KEY, HEUTE_KEY)
    expect(marken.length).toBeGreaterThanOrEqual(1)
  })
})

describe('nachschlagen', () => {
  it('findet den wert eines tages und den letzten eintrag', () => {
    const g = bau(['erijon', -3, 82], ['erijon', 0, 81.4])
    expect(gewichtAn(g, 'erijon', HEUTE_KEY)).toBe(81.4)
    expect(gewichtAn(g, 'erijon', tag(-1))).toBeNull()
    expect(letztesGewicht(g, 'erijon')).toEqual({ tag: HEUTE_KEY, kg: 81.4 })
    expect(letztesGewicht(g, 'koray')).toBeNull()
  })

  it('hält die personen auseinander', () => {
    const g = bau(['erijon', 0, 81], ['koray', 0, 75])
    expect(reiheRoh(g, 'erijon')).toEqual([{ tag: HEUTE_KEY, kg: 81 }])
    expect(reiheRoh(g, 'koray')).toEqual([{ tag: HEUTE_KEY, kg: 75 }])
  })
})

describe('parsen und formatieren', () => {
  it('nimmt komma, punkt und ein angehängtes kg', () => {
    expect(parseKg('81,4')).toBe(81.4)
    expect(parseKg('81.4')).toBe(81.4)
    expect(parseKg(' 81,40 kg ')).toBe(81.4)
    expect(parseKg('81')).toBe(81)
  })

  it('rundet schon beim eingang auf hundert gramm', () => {
    expect(parseKg('81,45')).toBe(81.5)
  })

  it('lehnt unsinn und vertipper ab', () => {
    for (const text of ['', '   ', 'abc', '-5', '814', '8', '81,4,5', '1e3']) {
      expect(parseKg(text)).toBeNull()
    }
  })

  it('formatiert mit einer nachkommastelle', () => {
    expect(formatKg(81)).toBe('81,0')
    expect(formatKg(81.44)).toBe('81,4')
  })

  it('rundet vor der vorzeichenwahl', () => {
    expect(formatDelta(0)).toBe('±0,0')
    expect(formatDelta(-0.04)).toBe('±0,0')
    expect(formatDelta(0.04)).toBe('±0,0')
  })

  it('benutzt den typografischen minus, nicht den bindestrich', () => {
    expect(formatDelta(-3.2)).toBe('−3,2')
    expect(formatDelta(-3.2).charCodeAt(0)).toBe(0x2212)
    expect(formatDelta(3.2)).toBe('+3,2')
  })
})
