import { describe, expect, it } from 'vitest'
import { EBENE, monotonerPfad, nachtkurve, zeitreihe } from './nachtkurve'
import type { Abschnitt } from './nachtkurve'

const masse = { breite: 320, hoehe: 100 }

/** alle stuetzpunkte eines pfades, in der reihenfolge des zeichnens */
function punkteAusPfad(d: string): { x: number; y: number }[] {
  const zahlen = d.split(/[^-0-9.]+/).filter((s) => s !== '').map(Number)
  const punkte: { x: number; y: number }[] = []
  for (let i = 0; i + 1 < zahlen.length; i += 2) punkte.push({ x: zahlen[i]!, y: zahlen[i + 1]! })
  return punkte
}

/** eine nacht, wie health sie liefert: sekundengenaue grenzen, viele stuecke */
function healthNacht(): Abschnitt[] {
  const arten = ['kern', 'tief', 'kern', 'rem', 'wach'] as const
  const dauern = [24, 38, 17, 21, 6, 31, 26, 14, 23, 8, 19, 42, 11, 27, 9, 35, 22, 16, 28, 7]
  const stuecke: Abschnitt[] = []
  let t = 1380
  dauern.forEach((d, i) => {
    // eine sekunde naht zwischen zwei segmenten — genau daran zerbrach die
    // alte kurve, weil eine sekunde breiter ist als die damalige toleranz
    stuecke.push({ art: arten[i % arten.length]!, von: t, bis: t + d - 1 / 60 })
    t += d
  })
  return stuecke
}

describe('zeitreihe', () => {
  it('macht aus intervallen eine reihe mit fester schrittweite und ohne luecke', () => {
    const reihe = zeitreihe([{ art: 'kern', von: 0, bis: 10 }], 0, 10)

    expect(reihe).toHaveLength(11)
    expect(reihe.map((p) => p.t)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    expect(reihe.every((p) => Number.isFinite(p.tiefe))).toBe(true)
  })

  it('trifft den letzten schritt genau auf das ende, auch bei krummer spanne', () => {
    const reihe = zeitreihe([{ art: 'kern', von: 0, bis: 7.3 }], 0, 7.3)

    expect(reihe[reihe.length - 1]!.t).toBe(7.3)
    // kein doppelter punkt am ende
    expect(new Set(reihe.map((p) => p.t)).size).toBe(reihe.length)
  })

  it('haelt jede hoehe zwischen den vier ebenen', () => {
    const reihe = zeitreihe(healthNacht(), 1380, 1380 + 424)

    for (const p of reihe) {
      expect(Number.isFinite(p.tiefe)).toBe(true)
      expect(p.tiefe).toBeGreaterThanOrEqual(EBENE.wach)
      expect(p.tiefe).toBeLessThanOrEqual(EBENE.tief)
    }
  })

  it('ueberbrueckt eine messluecke geradlinig statt sie offen zu lassen', () => {
    // zwischen 20 und 60 hat health nichts gemeldet
    const reihe = zeitreihe(
      [
        { art: 'wach', von: 0, bis: 20 },
        { art: 'tief', von: 60, bis: 80 },
      ],
      0,
      80
    )

    const mitte = reihe.find((p) => p.t === 40)!
    // genau in der mitte zwischen wach oben und tief unten
    expect(mitte.tiefe).toBeCloseTo((EBENE.wach + EBENE.tief) / 2, 6)
    // und die gerade ist wirklich eine gerade
    const bei30 = reihe.find((p) => p.t === 30)!
    const bei50 = reihe.find((p) => p.t === 50)!
    expect(bei30.tiefe + bei50.tiefe).toBeCloseTo(2 * mitte.tiefe, 6)
  })

  it('bleibt leer ohne phasen oder ohne spanne', () => {
    expect(zeitreihe([], 0, 100)).toEqual([])
    expect(zeitreihe([{ art: 'kern', von: 0, bis: 10 }], 100, 100)).toEqual([])
    expect(zeitreihe([{ art: 'kern', von: 0, bis: 10 }], 0, 100, 0)).toEqual([])
  })

  it('wirft unbrauchbare stuecke weg, statt an ihnen zu zerbrechen', () => {
    const reihe = zeitreihe(
      [
        { art: 'kern', von: Number.NaN, bis: 10 },
        { art: 'tief', von: 20, bis: 20 },
        { art: 'rem', von: 40, bis: 30 },
        { art: 'wach', von: 0, bis: 60 },
      ],
      0,
      60
    )

    expect(reihe).toHaveLength(61)
    expect(reihe.every((p) => p.tiefe === EBENE.wach)).toBe(true)
  })
})

describe('monotonerPfad', () => {
  it('faengt einmal an und hoert nie zwischendurch auf', () => {
    const d = monotonerPfad([
      { x: 0, y: 0 },
      { x: 10, y: 10 },
      { x: 20, y: 0 },
    ])

    expect(d.match(/M/g)).toHaveLength(1)
    expect(d.startsWith('M 0 0')).toBe(true)
    expect(d.replace(/^M [^C]+/, '').trim().startsWith('C')).toBe(true)
  })

  it('schwingt zwischen zwei stuetzpunkten nie ueber sie hinaus', () => {
    // eine harte stufe: eine gewoehnliche spline wuerde hier unter die null
    // und ueber die zehn schwingen — eine delle unter den tiefschlaf
    const punkte = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 20, y: 10 },
      { x: 30, y: 10 },
    ]
    const alle = punkteAusPfad(monotonerPfad(punkte))

    for (const p of alle) {
      expect(p.y).toBeGreaterThanOrEqual(-1e-9)
      expect(p.y).toBeLessThanOrEqual(10 + 1e-9)
    }
  })

  it('laesst eine gerade eine gerade bleiben', () => {
    const d = monotonerPfad([
      { x: 0, y: 0 },
      { x: 10, y: 10 },
      { x: 20, y: 20 },
    ])

    for (const p of punkteAusPfad(d)) expect(p.y).toBeCloseTo(p.x, 6)
  })

  it('kommt mit null und einem punkt zurecht', () => {
    expect(monotonerPfad([])).toBe('')
    expect(monotonerPfad([{ x: 3, y: 4 }])).toBe('M 3 4')
  })
})

describe('nachtkurve', () => {
  it('ist ein einziger pfad, auch bei sekundengenauen nahtstellen', () => {
    const kurve = nachtkurve(healthNacht(), 1380, 1380 + 424, masse)

    // genau ein M: der pfad kann gar nicht in stuecke zerfallen
    expect(kurve.d.match(/M/g)).toHaveLength(1)
    // und kein einziges L: es gibt keine waagerechten fragmente mehr
    expect(kurve.d).not.toContain('L')
    expect(kurve.d).toContain('C')
  })

  it('haelt jede kurvenhoehe im feld, ohne NaN', () => {
    const kurve = nachtkurve(healthNacht(), 1380, 1380 + 424, masse)

    for (const p of punkteAusPfad(kurve.d)) {
      expect(Number.isFinite(p.x)).toBe(true)
      expect(Number.isFinite(p.y)).toBe(true)
      expect(p.y).toBeGreaterThanOrEqual(EBENE.wach * masse.hoehe - 0.01)
      expect(p.y).toBeLessThanOrEqual(EBENE.tief * masse.hoehe + 0.01)
    }
  })

  it('spannt die kurve ueber die ganze breite', () => {
    const kurve = nachtkurve(healthNacht(), 1380, 1380 + 424, masse)
    const punkte = punkteAusPfad(kurve.d)

    expect(punkte[0]!.x).toBe(0)
    expect(punkte[punkte.length - 1]!.x).toBeCloseTo(masse.breite, 6)
  })

  it('legt die vier ebenen auf ihre hoehe', () => {
    const kurve = nachtkurve(
      [
        { art: 'wach', von: 0, bis: 100 },
        { art: 'rem', von: 100, bis: 200 },
        { art: 'kern', von: 200, bis: 300 },
        { art: 'tief', von: 300, bis: 400 },
      ],
      0,
      400,
      masse
    )
    const punkte = punkteAusPfad(kurve.d)

    // anfang auf der wachhoehe, ende auf der tiefschlafhoehe
    expect(punkte[0]!.y).toBeCloseTo(EBENE.wach * masse.hoehe, 6)
    expect(punkte[punkte.length - 1]!.y).toBeCloseTo(EBENE.tief * masse.hoehe, 6)
    // und dazwischen wird jede ebene erreicht
    const hoehen = punkte.map((p) => p.y)
    for (const art of ['wach', 'rem', 'kern', 'tief'] as const) {
      expect(hoehen.some((y) => Math.abs(y - EBENE[art] * masse.hoehe) < 0.01)).toBe(true)
    }
  })

  it('setzt die farbmarken an die zeitanteile der phasen', () => {
    const kurve = nachtkurve(
      [
        { art: 'wach', von: 0, bis: 100 },
        { art: 'tief', von: 100, bis: 200 },
      ],
      0,
      200,
      masse
    )

    expect(kurve.marken[0]).toEqual({ offset: 0, art: 'wach' })
    expect(kurve.marken[kurve.marken.length - 1]).toEqual({ offset: 1, art: 'tief' })
    // der wechsel liegt um die haelfte der nacht herum
    const wechsel = kurve.marken.filter((m) => m.offset > 0 && m.offset < 1)
    expect(wechsel).toHaveLength(2)
    expect(wechsel[0]!.art).toBe('wach')
    expect(wechsel[1]!.art).toBe('tief')
    expect((wechsel[0]!.offset + wechsel[1]!.offset) / 2).toBeCloseTo(0.5, 6)
  })

  it('haelt die farbmarken aufsteigend, damit svg sie annimmt', () => {
    const kurve = nachtkurve(healthNacht(), 1380, 1380 + 424, masse)

    let letzter = -1
    for (const marke of kurve.marken) {
      expect(marke.offset).toBeGreaterThanOrEqual(letzter)
      expect(marke.offset).toBeLessThanOrEqual(1)
      letzter = marke.offset
    }
  })

  it('bleibt fuer jede nachtlaenge ein durchgehender pfad', () => {
    // von zwei stunden bis vierzehn: die rechnung darf nirgends kippen
    for (const laenge of [120, 300, 480, 620, 840]) {
      const stuecke: Abschnitt[] = []
      const arten = ['kern', 'tief', 'rem', 'wach'] as const
      let t = 0
      let i = 0
      while (t < laenge) {
        const d = Math.min(laenge - t, 7 + ((i * 13) % 41))
        stuecke.push({ art: arten[i % arten.length]!, von: t, bis: t + d - 1 / 60 })
        t += d
        i++
      }
      const kurve = nachtkurve(stuecke, 0, laenge, masse)

      expect(kurve.d.match(/M/g), `nacht ueber ${laenge} minuten`).toHaveLength(1)
      expect(kurve.d).not.toContain('NaN')
      expect(punkteAusPfad(kurve.d).every((p) => Number.isFinite(p.y))).toBe(true)
    }
  })

  it('bleibt leer, wo nichts zu zeichnen ist', () => {
    expect(nachtkurve([], 0, 100, masse).d).toBe('')
    expect(nachtkurve([{ art: 'kern', von: 0, bis: 10 }], 100, 100, masse).d).toBe('')
    expect(nachtkurve([{ art: 'kern', von: 0, bis: 10 }], Number.NaN, 100, masse).d).toBe('')
  })

  it('zeichnet auch eine nacht aus einem einzigen stueck', () => {
    const kurve = nachtkurve([{ art: 'unspez', von: 0, bis: 400 }], 0, 400, masse)

    expect(kurve.d.match(/M/g)).toHaveLength(1)
    expect(kurve.marken).toEqual([
      { offset: 0, art: 'unspez' },
      { offset: 1, art: 'unspez' },
    ])
    for (const p of punkteAusPfad(kurve.d)) expect(p.y).toBeCloseTo(EBENE.kern * masse.hoehe, 6)
  })

  it('bleibt kompakt: das plateau braucht keine minute je stuetzpunkt', () => {
    const kurve = nachtkurve([{ art: 'kern', von: 0, bis: 480 }], 0, 480, masse)

    // 480 minuten in der reihe, aber eine waagerechte linie braucht im pfad
    // nur zwei stuetzpunkte — also genau ein kurvenstueck
    expect(kurve.reihe).toHaveLength(481)
    expect(kurve.d.match(/C/g)).toHaveLength(1)
  })
})
