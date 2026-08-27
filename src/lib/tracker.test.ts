import { describe, expect, it } from 'vitest'
import { addDays, isoWeek, startOfWeek, toKey, weekDays } from './dates'
import { abstand, istGesetzt, setzeTick, setzeWert, streak, wert, wocheBereich, wocheGesamt } from './tracker'
import { gewichtKey } from './types'
import type { Zustand } from './types'

const leer: Zustand = { ticks: {}, werte: {}, gewichte: {} }
const MITTWOCH = new Date(2026, 7, 26, 12)

function mit(z: Zustand, ...eintraege: [string, string][]): Zustand {
  return eintraege.reduce(
    (acc, [u, tag]) => setzeTick(acc, u as never, 'lernen', tag, true),
    z
  )
}

describe('woche', () => {
  it('beginnt am montag', () => {
    expect(toKey(startOfWeek(MITTWOCH))).toBe('2026-08-24')
    expect(weekDays(MITTWOCH)).toHaveLength(7)
    expect(weekDays(MITTWOCH)[0]).toBe('2026-08-24')
    expect(weekDays(MITTWOCH)[6]).toBe('2026-08-30')
  })

  it('kennt die kalenderwoche', () => {
    expect(isoWeek(MITTWOCH)).toBe(35)
  })
})

describe('ticks', () => {
  it('zählt einen tag genau einmal', () => {
    const z = setzeTick(leer, 'erijon', 'gym', '2026-08-26', true)
    const nochmal = setzeTick(z, 'erijon', 'gym', '2026-08-26', true)
    expect(wocheBereich(nochmal, 'erijon', 'gym', weekDays(MITTWOCH))).toBe(1)
  })

  it('trennt die beiden nutzer', () => {
    const z = mit(leer, ['erijon', '2026-08-24'], ['erijon', '2026-08-25'], ['koray', '2026-08-24'])
    const woche = weekDays(MITTWOCH)
    expect(wocheBereich(z, 'erijon', 'lernen', woche)).toBe(2)
    expect(wocheBereich(z, 'koray', 'lernen', woche)).toBe(1)
    expect(abstand(z, 'lernen', woche, 'erijon', 'koray')).toBe(1)
    expect(abstand(z, 'lernen', woche, 'koray', 'erijon')).toBe(-1)
  })

  it('summiert über alle vier bereiche', () => {
    let z = setzeTick(leer, 'koray', 'lernen', '2026-08-24', true)
    z = setzeTick(z, 'koray', 'boxen', '2026-08-24', true)
    z = setzeTick(z, 'koray', 'lesen', '2026-08-25', true)
    expect(wocheGesamt(z, 'koray', weekDays(MITTWOCH))).toBe(3)
  })

  it('nimmt einen tick wieder zurück', () => {
    const z = setzeTick(leer, 'erijon', 'lesen', '2026-08-26', true)
    const zurueck = setzeTick(z, 'erijon', 'lesen', '2026-08-26', false)
    expect(istGesetzt(zurueck, 'erijon', 'lesen', '2026-08-26')).toBe(false)
  })
})

describe('streak', () => {
  it('zählt heute mit, wenn heute gesetzt ist', () => {
    let z = leer
    for (const versatz of [0, -1, -2]) {
      z = setzeTick(z, 'erijon', 'lernen', toKey(addDays(MITTWOCH, versatz)), true)
    }
    expect(streak(z, 'erijon', 'lernen', MITTWOCH)).toBe(3)
  })

  it('läuft weiter, solange heute noch offen ist', () => {
    let z = leer
    for (const versatz of [-1, -2]) {
      z = setzeTick(z, 'erijon', 'gym', toKey(addDays(MITTWOCH, versatz)), true)
    }
    expect(streak(z, 'erijon', 'gym', MITTWOCH)).toBe(2)
  })

  it('reißt bei einer lücke ab', () => {
    let z = setzeTick(leer, 'erijon', 'boxen', toKey(addDays(MITTWOCH, -1)), true)
    z = setzeTick(z, 'erijon', 'boxen', toKey(addDays(MITTWOCH, -3)), true)
    expect(streak(z, 'erijon', 'boxen', MITTWOCH)).toBe(1)
  })
})

describe('gewicht als fünftes feld', () => {
  /** ein gewichtseintrag, ohne zeile in ticks — der tick wird abgeleitet */
  function mitGewicht(z: Zustand, u: string, tag: string, kg: number): Zustand {
    return { ...z, gewichte: { ...z.gewichte, [gewichtKey(u as never, tag)]: kg } }
  }

  it('gilt als gesetzt, sobald ein wert für den tag existiert', () => {
    const z = mitGewicht(leer, 'erijon', '2026-08-26', 81.4)
    expect(istGesetzt(z, 'erijon', 'gewicht', '2026-08-26')).toBe(true)
    expect(istGesetzt(z, 'erijon', 'gewicht', '2026-08-25')).toBe(false)
    expect(istGesetzt(z, 'koray', 'gewicht', '2026-08-26')).toBe(false)
  })

  it('zählt in den wochenstand, der damit bis 35 geht', () => {
    let z = leer
    const woche = weekDays(MITTWOCH)
    for (const tag of woche) {
      for (const bereich of ['lernen', 'gym', 'boxen', 'lesen'] as const) {
        z = setzeTick(z, 'erijon', bereich, tag, true)
      }
      z = mitGewicht(z, 'erijon', tag, 81)
    }
    expect(wocheGesamt(z, 'erijon', woche)).toBe(35)
  })

  it('führt einen eigenen streak fürs wiegen', () => {
    let z = leer
    for (const versatz of [0, -1, -2]) {
      z = mitGewicht(z, 'erijon', toKey(addDays(MITTWOCH, versatz)), 81)
    }
    expect(streak(z, 'erijon', 'gewicht', MITTWOCH)).toBe(3)
  })

  it('vergleicht die wiegetage der beiden', () => {
    let z = mitGewicht(leer, 'erijon', '2026-08-24', 81)
    z = mitGewicht(z, 'erijon', '2026-08-25', 81)
    z = mitGewicht(z, 'koray', '2026-08-24', 75)
    expect(abstand(z, 'gewicht', weekDays(MITTWOCH), 'erijon', 'koray')).toBe(1)
  })
})

describe('werte', () => {
  it('lässt den tick stehen, wenn der wert auf null zurückgeht', () => {
    let z = setzeTick(leer, 'erijon', 'lernen', '2026-08-26', true)
    z = setzeWert(z, 'lernen', '2026-08-26', 45)
    expect(wert(z.werte, 'lernen', '2026-08-26')).toBe(45)

    z = setzeWert(z, 'lernen', '2026-08-26', 0)
    expect(istGesetzt(z, 'erijon', 'lernen', '2026-08-26')).toBe(true)
    expect(wert(z.werte, 'lernen', '2026-08-26')).toBe(0)
  })

  it('kennt keine negativen werte', () => {
    const z = setzeWert(leer, 'lesen', '2026-08-26', -10)
    expect(wert(z.werte, 'lesen', '2026-08-26')).toBe(0)
  })
})
