import { describe, expect, it } from 'vitest'
import {
  belegQuote,
  berechneDuell,
  berechneRestprogramm,
  duellFronten,
  duellStatusText,
  duellTickerEintraege,
  entscheideDuell,
  saisonHistorie,
} from './duell'
import type { Aufenthalt, Zustand } from './types'
import { tickKey } from './types'
import { weekDays } from './dates'

function leererZustand(): Zustand {
  return {
    einheiten: {},
    gewichte: {},
    aufenthalte: [],
  }
}

describe('duell.ts logik & berechnungen', () => {
  const montag = new Date('2026-08-24T12:00:00Z')
  const woche = weekDays(montag)
  const heuteKey = '2026-08-27'

  it('berechneRestprogramm erkennt uneinholbar, matchball und zugzwang', () => {
    const rest1 = berechneRestprogramm(woche, heuteKey, 25, 4, 5, 0)
    expect(rest1.uneinholbarIch).toBe(true)
    expect(rest1.matchballIch).toBe(false)

    const rest2 = berechneRestprogramm(woche, heuteKey, 24, 4, 5, 0)
    expect(rest2.uneinholbarIch).toBe(false)
    expect(rest2.matchballIch).toBe(true)

    const rest3 = berechneRestprogramm(woche, heuteKey, 10, 12)
    expect(rest3.zugzwangIch).toBe(true)
    expect(rest3.uneinholbarEr).toBe(false)
  })

  it('zählt am Montag auch die heute noch offenen fünf Felder', () => {
    const montagRest = berechneRestprogramm(woche, woche[0], 0, 0, 0, 0)
    expect(montagRest.restMaxIch).toBe(35)
    expect(montagRest.restMaxEr).toBe(35)
    expect(montagRest.uneinholbarIch).toBe(false)
  })

  it('berechnet sonntags verbleibende Felder je Person statt pauschal null', () => {
    const sonntag = berechneRestprogramm(woche, woche[6], 31, 29, 1, 4)
    expect(sonntag.restMaxIch).toBe(4)
    expect(sonntag.restMaxEr).toBe(1)
    expect(sonntag.uneinholbarIch).toBe(true)
  })

  it('entscheidet Punktgleichstand über den Beleg und echten Gleichstand als remis', () => {
    expect(entscheideDuell(20, 20, 8, 6)).toEqual({ sieger: 'ich', grund: 'beleg' })
    expect(entscheideDuell(20, 20, 8, 8)).toEqual({
      sieger: 'unentschieden',
      grund: 'unentschieden',
    })
  })

  it('duellStatusText formuliert messerscharfe, präzise sätze', () => {
    const rest = berechneRestprogramm(woche, heuteKey, 10, 8)
    const st1 = duellStatusText(2, 0, 10, 8, rest, 'koray')
    expect(st1.druck).toBe('heuteFuehrung')
    expect(st1.text).toContain('du führst heute 2:0')

    const st2 = duellStatusText(0, 2, 8, 10, rest, 'koray')
    expect(st2.druck).toBe('heuteRueckstand')
    expect(st2.text).toContain('koray führt heute 2:0')
  })

  it('duellStatusText wendet bei ausgeschöpftem Sonntag den Beleg-Tiebreak an', () => {
    const rest = berechneRestprogramm(woche, woche[6], 20, 20, 5, 5)
    const status = duellStatusText(5, 5, 20, 20, rest, 'koray', 9, 7)
    expect(status.druck).toBe('entschieden')
    expect(status.text).toContain('beleg-tiebreak')
  })

  it('belegQuote unterscheidet gemessene von getippten tagen', () => {
    const z = leererZustand()
    z.einheiten[tickKey('erijon', 'gym', '2026-08-24')] = [
      { id: '1', user: 'erijon', area: 'gym', tag: '2026-08-24', erfasst: '2026-08-24T10:00:00Z', wert: 60 },
    ]
    const aufenthalt: Aufenthalt = {
      user: 'erijon',
      bereich: 'gym',
      ort: 'fitx',
      ankunft: '2026-08-25T10:00:00Z',
      abgang: '2026-08-25T11:00:00Z',
    }
    z.aufenthalte.push(aufenthalt)

    const quote = belegQuote(z, 'erijon', woche)
    expect(quote.gesamt).toBe(2)
    expect(quote.gemessen).toBe(1)
    expect(quote.getippt).toBe(1)
    expect(quote.quote).toBe(50)
  })

  it('duellFronten analysiert alle 5 disziplinen', () => {
    const z = leererZustand()
    z.einheiten[tickKey('erijon', 'gym', '2026-08-24')] = [
      { id: '1', user: 'erijon', area: 'gym', tag: '2026-08-24', erfasst: '2026-08-24T10:00:00Z', wert: 60 },
    ]
    z.einheiten[tickKey('koray', 'boxen', '2026-08-24')] = [
      { id: '2', user: 'koray', area: 'boxen', tag: '2026-08-24', erfasst: '2026-08-24T10:00:00Z', wert: 60 },
    ]

    const fronten = duellFronten(z, woche, 'erijon', 'koray')
    expect(fronten).toHaveLength(5)
    const gym = fronten.find((f) => f.id === 'gym')
    const boxen = fronten.find((f) => f.id === 'boxen')
    expect(gym?.halter).toBe('ich')
    expect(boxen?.halter).toBe('er')
    expect(fronten.find((f) => f.id === 'lernen')?.halter).toBe('offen')
  })

  it('berechneDuell liefert konsistente aggregate für den kopf', () => {
    const z = leererZustand()
    z.einheiten[tickKey('erijon', 'gym', '2026-08-27')] = [
      { id: '1', user: 'erijon', area: 'gym', tag: '2026-08-27', erfasst: '2026-08-27T10:00:00Z', wert: 60 },
    ]
    const match = berechneDuell(z, woche, heuteKey, 'erijon')
    expect(match.heuteIch).toBe(1)
    expect(match.heuteEr).toBe(0)
    expect(match.wocheIch).toBe(1)
    expect(match.dominanzVerhaeltnis).toBe(1)
  })

  it('duellTicker sammelt aktionen chronologisch', () => {
    const z = leererZustand()
    z.einheiten[tickKey('koray', 'lernen', '2026-08-27')] = [
      { id: '1', user: 'koray', area: 'lernen', tag: '2026-08-27', erfasst: '2026-08-27T14:00:00Z', wert: 45 },
    ]
    const ref = new Date('2026-08-27T14:15:00Z')
    const ticker = duellTickerEintraege(z, woche, ref)
    expect(ticker).toHaveLength(1)
    expect(ticker[0].userId).toBe('koray')
    expect(ticker[0].feld).toBe('lernen')
    expect(ticker[0].relativeZeit).toBe('vor 15m')
  })

  it('duellTicker verwirft offene, zu kurze und überlappende Messungen', () => {
    const z = leererZustand()
    z.aufenthalte.push(
      {
        user: 'erijon', bereich: 'gym', ort: 'offen',
        ankunft: '2026-08-27T10:00:00Z', abgang: null,
      },
      {
        user: 'erijon', bereich: 'gym', ort: 'kurz',
        ankunft: '2026-08-27T11:00:00Z', abgang: '2026-08-27T11:05:00Z',
      },
      {
        user: 'erijon', bereich: 'gym', ort: 'lang',
        ankunft: '2026-08-27T12:00:00Z', abgang: '2026-08-27T13:00:00Z',
      },
      {
        user: 'erijon', bereich: 'gym', ort: 'doppelt',
        ankunft: '2026-08-27T12:10:00Z', abgang: '2026-08-27T12:40:00Z',
      }
    )
    const ticker = duellTickerEintraege(z, woche, new Date('2026-08-27T14:00:00Z'))
    expect(ticker.filter((e) => e.quelle === 'gemessen')).toHaveLength(1)
    expect(ticker[0].zusatz).toBe('60 min')
  })

  it('zeigt bei leerer Belegbasis keinen erfundenen Null-Prozent-Wert', () => {
    expect(belegQuote(leererZustand(), 'erijon', woche).quote).toBeNull()
  })

  it('saisonHistorie berechnet serien und wochen-bilanzen mit tiebreaker', () => {
    const z = leererZustand()
    z.einheiten[tickKey('erijon', 'gym', '2026-08-17')] = [
      { id: '1', user: 'erijon', area: 'gym', tag: '2026-08-17', erfasst: '2026-08-17T10:00:00Z', wert: 60 },
    ]
    const hist = saisonHistorie(z, montag, 3, 'erijon')
    expect(hist.letzteWochen.length).toBeGreaterThanOrEqual(1)
    expect(hist.siegeIch).toBe(1)
    expect(hist.aktuelleSerie.halter).toBe('ich')
    expect(hist.aktuelleSerie.anzahl).toBe(1)
  })

  it('saisonHistorie verbindet Siege nicht über eine spielfreie Woche hinweg', () => {
    const z = leererZustand()
    z.einheiten[tickKey('erijon', 'gym', '2026-08-10')] = [
      { id: 'alt', user: 'erijon', area: 'gym', tag: '2026-08-10', erfasst: null, wert: 60 },
    ]
    const hist = saisonHistorie(z, montag, 3, 'erijon')
    expect(hist.siegeIch).toBe(1)
    expect(hist.aktuelleSerie).toEqual({ halter: 'keiner', anzahl: 0 })
  })
})
