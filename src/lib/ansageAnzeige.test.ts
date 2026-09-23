import { describe, expect, it } from 'vitest'
import { ansagePaare, ergebnisFuer, fristText, restzeitText, wertungText } from './ansageAnzeige'
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
    expect(restzeitText(jetzt, new Date(2026, 8, 27, 18))).toBe('3 t 4 std')
    expect(restzeitText(jetzt, new Date(2026, 8, 27, 13, 50))).toBe('3 t')
    expect(restzeitText(jetzt, new Date(2026, 8, 24, 19, 2))).toBe('5 std 12 min')
    expect(restzeitText(jetzt, new Date(2026, 8, 24, 14, 0))).toBe('10 min')
    expect(restzeitText(jetzt, new Date(2026, 8, 25, 13, 50))).toBe('24 std')
    expect(restzeitText(jetzt, jetzt)).toBe('vorbei')
  })
})

describe('wertungText', () => {
  it('sagt aus sicht der schauenden person, wer was bekommt', () => {
    expect(wertungText(ansage(), 'erijon')).toBe('Wenn koray das Ziel schafft: +2 Punkte für koray. Sonst: +2 Punkte für dich.')
    expect(wertungText(ansage(), 'koray')).toBe('Wenn du das Ziel schaffst: +2 Punkte für dich. Sonst: +2 Punkte für erijon.')
    const gekontert = ansage({ reaktion: { art: 'kontern', am: new Date(2026, 8, 21, 12).toISOString() } })
    expect(wertungText(gekontert, 'erijon')).toBe('Wenn koray das Ziel schafft: +4 Punkte für koray. Sonst: +4 Punkte für dich.')
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

describe('fristText', () => {
  it('nennt sonntag 18 uhr, bei der ersten fassung samstag', () => {
    expect(fristText(ansage())).toBe('bis Sonntag, 18 Uhr')
    expect(fristText({ ...ansage(), version: undefined, bis: '2026-09-26' })).toBe('bis Samstag')
  })
})
