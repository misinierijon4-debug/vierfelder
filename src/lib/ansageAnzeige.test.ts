import { describe, expect, it } from 'vitest'
import { ansagePaare, ansageRang, ergebnisFuer, fristText, gruppenTitel, restzeitText, wertungText } from './ansageAnzeige'
import type { Ansage } from './ansagen'

const ansage = (rest: Partial<Ansage> = {}): Ansage => ({
  id: 'a1',
  version: 2,
  von: 'erijon',
  an: 'koray',
  feld: 'boxen',
  stufe: 'mutig',
  einsatz: 2,
  ab: '2026-09-21',
  bis: '2026-09-27',
  ziel: 4,
  erstelltAm: new Date(2026, 8, 21, 10).toISOString(),
  ...rest,
})

describe('restzeitText', () => {
  const jetzt = new Date(2026, 8, 24, 13, 50)
  it('wird kürzer, je näher die frist', () => {
    expect(restzeitText(jetzt, new Date(2026, 8, 27, 18))).toBe('3 tage 4 std')
    expect(restzeitText(jetzt, new Date(2026, 8, 27, 13, 50))).toBe('3 tage')
    expect(restzeitText(jetzt, new Date(2026, 8, 24, 19, 2))).toBe('5 std 12 min')
    expect(restzeitText(jetzt, new Date(2026, 8, 24, 14, 0))).toBe('10 min')
    expect(restzeitText(jetzt, new Date(2026, 8, 25, 14, 50))).toBe('1 tag 1 std')
    expect(restzeitText(jetzt, new Date(2026, 8, 25, 13, 50))).toBe('24 std')
    expect(restzeitText(jetzt, jetzt)).toBe('vorbei')
  })
})

describe('wertungText', () => {
  it('sagt aus sicht der schauenden person, wer was bekommt', () => {
    expect(wertungText(ansage(), 'erijon')).toBe('schafft koray es: +2 für koray. sonst +2 für dich.')
    expect(wertungText(ansage(), 'koray')).toBe('schaffst du es: +2 für dich. sonst +2 für erijon.')
    const gekontert = ansage({ reaktion: { art: 'kontern', am: new Date(2026, 8, 21, 12).toISOString() } })
    expect(wertungText(gekontert, 'erijon')).toBe('schafft koray es: +4 für koray. sonst +4 für dich.')
  })
})

describe('ergebnisFuer', () => {
  it('nennt, wer die punkte bekommt', () => {
    expect(ergebnisFuer(ansage(), 'laeuft')).toBeNull()
    expect(ergebnisFuer(ansage(), 'geschafft')).toEqual({ an: 'koray', punkte: 2 })
    expect(ergebnisFuer(ansage(), 'verfehlt')).toEqual({ an: 'erijon', punkte: 2 })
  })
})

describe('ansagePaare', () => {
  it('hängt die gegenrichtung an ihre ansage und lässt andere wochen weg', () => {
    const a = ansage()
    const gegen = ansage({ id: 'g', von: 'koray', an: 'erijon', bezug: 'a1' })
    const alt = ansage({ id: 'alt', bis: '2026-09-20', ab: '2026-09-14' })
    const neu = ansage({ id: 'neu', feld: 'lesen', erstelltAm: new Date(2026, 8, 22, 9).toISOString() })
    expect(ansagePaare([alt, a, gegen, neu], new Date(2026, 8, 23, 12))).toEqual([
      { ansage: neu, gegen: null },
      { ansage: a, gegen },
    ])
  })
})

describe('ansageRang', () => {
  const alle = () => true
  it('stellt vor, wo man selbst liefern muss, und entschiedenes ans ende', () => {
    const an = ansage({ von: 'koray', an: 'erijon' })
    const von = ansage({ von: 'erijon', an: 'koray' })
    const duAuch = { ansage: von, gegen: ansage({ id: 'g', von: 'koray', an: 'erijon', bezug: 'a1' }) }
    expect(ansageRang({ ansage: an, gegen: null }, 'erijon', alle)).toBe(0)
    expect(ansageRang(duAuch, 'erijon', alle)).toBe(0)
    expect(ansageRang({ ansage: von, gegen: null }, 'erijon', alle)).toBe(1)
    expect(ansageRang({ ansage: an, gegen: null }, 'erijon', () => false)).toBe(2)
  })

  it('wertet bei „du auch“ jede richtung für sich', () => {
    const von = ansage({ von: 'erijon', an: 'koray' })
    const gegen = ansage({ id: 'g', von: 'koray', an: 'erijon', bezug: 'a1' })
    const paar = { ansage: von, gegen }
    // koray ist fertig, erijons gegenrichtung läuft noch: erijon muss liefern
    expect(ansageRang(paar, 'erijon', (a) => a.id === 'g')).toBe(0)
    // erijon ist fertig, nur koray läuft noch: erijon sieht zu
    expect(ansageRang(paar, 'erijon', (a) => a.id === 'a1')).toBe(1)
  })
})

describe('fristText', () => {
  it('nennt sonntag 18 uhr, bei der ersten fassung samstag', () => {
    expect(fristText(ansage())).toBe('bis sonntag 18 uhr')
    expect(fristText({ ...ansage(), version: undefined, bis: '2026-09-26' })).toBe('bis samstag')
  })
})

describe('gruppenTitel', () => {
  it('nennt, wer liefern muss, aus sicht der schauenden person', () => {
    expect(gruppenTitel(0, 'erijon')).toBe('du musst liefern')
    expect(gruppenTitel(1, 'erijon')).toBe('koray muss liefern')
    expect(gruppenTitel(1, 'koray')).toBe('erijon muss liefern')
    expect(gruppenTitel(2, 'koray')).toBe('entschieden')
  })
})
