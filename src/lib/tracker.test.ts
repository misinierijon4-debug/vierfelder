import { describe, expect, it } from 'vitest'
import { addDays, isoWeek, startOfWeek, toKey, weekDays } from './dates'
import {
  abstand,
  anzahlEinheiten,
  erledigteFelder,
  tageMitDaten,
  baueEinheit,
  einheitenAn,
  entferneEinheit,
  fuegeEinheitHinzu,
  hatTageswert,
  istGesetzt,
  letzteEinheit,
  setzeEinheitWert,
  setzeTick,
  streak,
  tagesWert,
  tageseinheiten,
  wocheBereich,
  wocheGesamt,
} from './tracker'
import { gewichtKey } from './types'
import type { Zustand } from './types'

const leer: Zustand = { einheiten: {}, gewichte: {}, aufenthalte: [] }
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

describe('einheiten', () => {
  /** eine einheit mit festem wert anlegen und zurückgeben */
  function mitEinheit(z: Zustand, area: 'lernen' | 'gym' | 'boxen' | 'lesen', tag: string, wert: number | null) {
    const e = { ...baueEinheit('erijon', area, tag, wert), id: `${area}-${tag}-${Math.random()}` }
    return { z: fuegeEinheitHinzu(z, e), e }
  }

  it('zählt zwei einheiten an einem tag als einen tick', () => {
    let z = mitEinheit(leer, 'gym', '2026-08-26', 65).z
    z = mitEinheit(z, 'gym', '2026-08-26', 28).z

    expect(anzahlEinheiten(z, 'erijon', 'gym', '2026-08-26')).toBe(2)
    expect(istGesetzt(z, 'erijon', 'gym', '2026-08-26')).toBe(true)
    // die punkteregel bleibt: der wochenstand zählt tage, nicht durchführungen
    expect(wocheBereich(z, 'erijon', 'gym', weekDays(MITTWOCH))).toBe(1)
  })

  it('addiert die minuten des tages und hält die einzelnen fest', () => {
    let z = mitEinheit(leer, 'gym', '2026-08-26', 65).z
    z = mitEinheit(z, 'gym', '2026-08-26', 28).z

    expect(tagesWert(z, 'erijon', 'gym', '2026-08-26')).toBe(93)
    expect(tageseinheiten(z, 'erijon', 'gym', '2026-08-26').map((e) => e.wert)).toEqual([65, 28])
  })

  it('erfindet keine minuten, wo nie welche erfasst wurden', () => {
    const z = mitEinheit(leer, 'lesen', '2026-08-26', null).z
    expect(einheitenAn(z, 'erijon', 'lesen', '2026-08-26')[0]!.wert).toBeNull()
    expect(tagesWert(z, 'erijon', 'lesen', '2026-08-26')).toBe(0)
    expect(istGesetzt(z, 'erijon', 'lesen', '2026-08-26')).toBe(true)
  })

  it('nimmt eine einzelne einheit zurück, ohne den tag zu leeren', () => {
    const erste = mitEinheit(leer, 'boxen', '2026-08-26', 40)
    const zweite = mitEinheit(erste.z, 'boxen', '2026-08-26', 20)

    const z = entferneEinheit(zweite.z, zweite.e.id)
    expect(anzahlEinheiten(z, 'erijon', 'boxen', '2026-08-26')).toBe(1)
    expect(istGesetzt(z, 'erijon', 'boxen', '2026-08-26')).toBe(true)

    const ohne = entferneEinheit(z, erste.e.id)
    expect(istGesetzt(ohne, 'erijon', 'boxen', '2026-08-26')).toBe(false)
  })

  it('legt dieselbe einheit kein zweites mal an', () => {
    const { z, e } = mitEinheit(leer, 'gym', '2026-08-26', 30)
    const nochmal = fuegeEinheitHinzu(z, e)
    expect(anzahlEinheiten(nochmal, 'erijon', 'gym', '2026-08-26')).toBe(1)
    expect(nochmal).toBe(z)
  })

  it('ändert den wert genau einer einheit', () => {
    const erste = mitEinheit(leer, 'lernen', '2026-08-26', 45)
    const zweite = mitEinheit(erste.z, 'lernen', '2026-08-26', 15)

    const z = setzeEinheitWert(zweite.z, zweite.e.id, 30)
    expect(tagesWert(z, 'erijon', 'lernen', '2026-08-26')).toBe(75)
    expect(letzteEinheit(z, 'erijon', 'lernen', '2026-08-26')!.wert).toBe(30)
  })

  it('kennt keine negativen werte', () => {
    const { z, e } = mitEinheit(leer, 'lesen', '2026-08-26', 10)
    const runter = setzeEinheitWert(z, e.id, -10)
    expect(tagesWert(runter, 'erijon', 'lesen', '2026-08-26')).toBe(0)
  })

  it('unterscheidet null minuten von nie erfassten minuten', () => {
    // beides ergibt die tagessumme 0, aber die zeile sagt zwei verschiedene
    // dinge: „ohne wert" heißt nie erfasst, die 0 heißt heruntergezählt.
    const ohne = mitEinheit(leer, 'lernen', '2026-08-26', null).z
    expect(tagesWert(ohne, 'erijon', 'lernen', '2026-08-26')).toBe(0)
    expect(hatTageswert(ohne, 'erijon', 'lernen', '2026-08-26')).toBe(false)

    const { z, e } = mitEinheit(leer, 'lernen', '2026-08-27', 15)
    const runter = setzeEinheitWert(z, e.id, 0)
    expect(tagesWert(runter, 'erijon', 'lernen', '2026-08-27')).toBe(0)
    expect(hatTageswert(runter, 'erijon', 'lernen', '2026-08-27')).toBe(true)
  })

  it('sieht den wert des tages, auch wenn nur eine von zwei einheiten ihn hat', () => {
    let z = mitEinheit(leer, 'gym', '2026-08-26', 45).z
    z = mitEinheit(z, 'gym', '2026-08-26', null).z
    expect(hatTageswert(z, 'erijon', 'gym', '2026-08-26')).toBe(true)
    expect(tagesWert(z, 'erijon', 'gym', '2026-08-26')).toBe(45)
  })

  it('hat ohne einheit auch keinen wert', () => {
    expect(hatTageswert(leer, 'erijon', 'gym', '2026-08-26')).toBe(false)
  })

  it('legt die einheit auf den lokalen tag, nicht auf den utc-tag', () => {
    // 23:40 ortszeit ist in utc schon der folgetag
    const spaet = new Date(2026, 7, 26, 23, 40)
    const e = baueEinheit('erijon', 'gym', toKey(spaet), 30, spaet)
    expect(e.tag).toBe('2026-08-26')
    expect(new Date(e.erfasst!).getTime()).toBe(spaet.getTime())
  })
})

describe('an- und abhaken', () => {
  it('legt beim ersten tap eine einheit ohne wert an', () => {
    const z = setzeTick(leer, 'erijon', 'gym', '2026-08-26', true)
    const liste = einheitenAn(z, 'erijon', 'gym', '2026-08-26')
    expect(liste).toHaveLength(1)
    expect(liste[0]!.wert).toBeNull()
    expect(liste[0]!.erfasst).not.toBeNull()
  })

  it('lässt einen zweiten tap den vorhandenen eintrag nicht ersetzen', () => {
    const z = setzeTick(leer, 'erijon', 'gym', '2026-08-26', true)
    expect(setzeTick(z, 'erijon', 'gym', '2026-08-26', true)).toBe(z)
  })

  it('räumt beim abhaken alle einheiten des tages weg', () => {
    let z = setzeTick(leer, 'erijon', 'gym', '2026-08-26', true)
    z = fuegeEinheitHinzu(z, baueEinheit('erijon', 'gym', '2026-08-26', 28))
    z = setzeTick(z, 'erijon', 'gym', '2026-08-26', false)
    expect(einheitenAn(z, 'erijon', 'gym', '2026-08-26')).toHaveLength(0)
    expect(istGesetzt(z, 'erijon', 'gym', '2026-08-26')).toBe(false)
  })
})

describe('kalender', () => {
  it('zählt die erledigten felder eines tages, das gewicht mit', () => {
    let z = setzeTick(leer, 'erijon', 'gym', '2026-08-26', true)
    z = setzeTick(z, 'erijon', 'lesen', '2026-08-26', true)
    z = { ...z, gewichte: { ...z.gewichte, [gewichtKey('erijon', '2026-08-26')]: 81 } }

    expect(erledigteFelder(z, 'erijon', '2026-08-26')).toBe(3)
    expect(erledigteFelder(z, 'koray', '2026-08-26')).toBe(0)
    expect(erledigteFelder(z, 'erijon', '2026-08-25')).toBe(0)
  })

  it('zählt einen tag mit zwei einheiten trotzdem als ein feld', () => {
    let z = setzeTick(leer, 'erijon', 'gym', '2026-08-26', true)
    z = fuegeEinheitHinzu(z, baueEinheit('erijon', 'gym', '2026-08-26', 28))
    expect(erledigteFelder(z, 'erijon', '2026-08-26')).toBe(1)
  })

  it('kennt die tage mit daten, einheiten und gewicht zusammen', () => {
    let z = setzeTick(leer, 'erijon', 'gym', '2026-08-26', true)
    z = setzeTick(z, 'koray', 'lesen', '2026-08-20', true)
    z = { ...z, gewichte: { ...z.gewichte, [gewichtKey('erijon', '2026-08-24')]: 81 } }

    expect(tageMitDaten(z, 'erijon')).toEqual(['2026-08-24', '2026-08-26'])
    expect(tageMitDaten(z, 'koray')).toEqual(['2026-08-20'])
  })
})
