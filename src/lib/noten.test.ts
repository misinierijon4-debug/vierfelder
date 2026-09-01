import { describe, expect, it } from 'vitest'
import type { Fach, Note } from './types'
import { abiPrognose, brauchtFuerZiel, brauchtInKlausur, defizite, fachSchnitt, gesamtpunkteZuAbinote, klausurAnteil, notenGewicht, punkteKurz, punkteZuNote, trend } from './noten'

const fach = (id: string, kursart: 'lk' | 'gk' = 'gk'): Fach => ({
  id, user: 'erijon', name: id, kursart, pruefungsfach: null, sortierung: 0,
})
const note = (fachId: string, punkte: number, art: 'klausur' | 'epo' | 'hue' = 'klausur', gewicht = notenGewicht(art), datum = '2026-09-01'): Note => ({
  id: `${fachId}-${art}-${punkte}-${datum}-${gewicht}`, user: 'erijon', fachId, art, punkte, gewicht, datum, titel: '',
})

describe('punkte und kurze noten', () => {
  it.each([[15, 1], [14, 1], [11, 2], [8, 3], [5, 4], [2, 5], [0, 6]])(
    '%i punkte ergeben den anker %i',
    (punkte, erwartet) => expect(punkteZuNote(punkte)).toBeCloseTo(erwartet)
  )
  it('bildet die volle punkte-tabelle ab', () => {
    expect(Array.from({ length: 16 }, (_, p) => punkteKurz(p))).toEqual([
      '6', '5−', '5', '5+', '4−', '4', '4+', '3−', '3', '3+', '2−', '2', '2+', '1−', '1', '1+',
    ])
  })
})

describe('fachschnitt', () => {
  it('rechnet nur klausuren und nur mündliche noten', () => {
    expect(fachSchnitt([note('m', 10), note('m', 14)], fach('m')).gesamt).toBe(12)
    expect(fachSchnitt([note('m', 9, 'hue')], fach('m')).gesamt).toBe(9)
  })
  it('rechnet lk fest 50/50 und gk fest 33/67', () => {
    const noten = [note('m', 12), note('m', 8, 'hue')]
    expect(klausurAnteil('lk')).toBe(50)
    expect(klausurAnteil('gk')).toBe(33)
    expect(fachSchnitt(noten, fach('m', 'lk')).gesamt).toBe(10)
    expect(fachSchnitt(noten, fach('m', 'gk')).gesamt).toBeCloseTo(9.32)
  })
  it('wertet epo im mündlichen topf doppelt gegenüber einer hü', () => {
    const schnitt = fachSchnitt([note('m', 12, 'epo'), note('m', 6, 'hue')], fach('m'))
    expect(notenGewicht('epo')).toBe(20)
    expect(notenGewicht('hue')).toBe(10)
    expect(schnitt.muendlich).toBe(10)
  })
  it('zaehlt einen leeren topf nicht als null', () => {
    expect(fachSchnitt([note('m', 13)], fach('m')).gesamt).toBe(13)
  })
})

describe('prognose', () => {
  it('findet nur faecher unter 5 punkten', () => {
    const faecher = [fach('a'), fach('b'), fach('c')]
    expect(defizite(faecher, [note('a', 4), note('b', 5)], 'erijon').map((f) => f.id)).toEqual(['a'])
  })
  it('trifft die offiziellen grenzen 900 und 300', () => {
    const faecher = [fach('a', 'lk'), fach('b', 'lk'), fach('c', 'lk'), fach('d')]
    expect(abiPrognose(faecher, faecher.map((f) => note(f.id, 15)), 'erijon')).toMatchObject({ gesamt: 900, note: 1 })
    expect(abiPrognose(faecher, faecher.map((f) => note(f.id, 5)), 'erijon')).toMatchObject({ gesamt: 300, note: 4 })
  })
  it('nutzt an der spitze die amtliche punktetabelle statt normaler rundung', () => {
    expect(gesamtpunkteZuAbinote(900)).toBe(1)
    expect(gesamtpunkteZuAbinote(823)).toBe(1)
    expect(gesamtpunkteZuAbinote(822)).toBe(1.1)
    expect(gesamtpunkteZuAbinote(300)).toBe(4)
  })
  it('wertet nur zwei leistungskurse doppelt und grundkurse einfach', () => {
    const faecher = [fach('lk1', 'lk'), fach('lk2', 'lk'), fach('lk3', 'lk'), fach('gk')]
    const p = abiPrognose(faecher, [note('lk1', 15), note('lk2', 15), note('lk3', 0), note('gk', 0)], 'erijon')!
    expect(p.blockI).toBe(Math.round((15 * 16) * (40 / 44)))
  })
  it('setzt bei lauter 15 block i auf genau 600', () => {
    const faecher = [fach('a', 'lk'), fach('b', 'lk'), fach('c', 'lk'), fach('d')]
    expect(abiPrognose(faecher, faecher.map((f) => note(f.id, 15)), 'erijon')?.blockI).toBe(600)
  })
  it('liefert ohne noten null', () => expect(abiPrognose([fach('a')], [], 'erijon')).toBeNull())
  it('meldet 8 unterkurse und nullpunkte, aber keine erfundene lk-sondergrenze', () => {
    const faecher = [fach('lk', 'lk'), fach('g1'), fach('g2'), fach('gut')]
    const p = abiPrognose(faecher, [note('lk', 4), note('g1', 0), note('g2', 4), note('gut', 15)], 'erijon')!
    expect(p.unterkurse).toEqual({ lk: 4, gk: 8 })
    expect(p.huerden).toContain('mehr als 7 unterkurse')
    expect(p.huerden).toContain('ein kurs mit 0 punkten ist nicht einbringbar')
    expect(p.huerden.some((h) => h.includes('leistungskursen'))).toBe(false)
  })
  it('meldet keine huerde bei einer tragfaehigen hochrechnung', () => {
    const faecher = [fach('a', 'lk'), fach('b', 'lk'), fach('c', 'lk'), fach('d')]
    expect(abiPrognose(faecher, faecher.map((f) => note(f.id, 10)), 'erijon')?.huerden).toEqual([])
  })
})

describe('ziel und trend', () => {
  it('findet eine erreichbare naechste klausur', () => expect(brauchtInKlausur([note('m', 8)], fach('m'), 10)).toBe(12))
  it('liefert null wenn geschafft oder nicht erreichbar', () => {
    expect(brauchtInKlausur([note('m', 12)], fach('m'), 10)).toBeNull()
    expect(brauchtInKlausur([note('m', 0, 'klausur', 50)], fach('m'), 14)).toBeNull()
  })
  it('leitet den nötigen punkteschnitt aus der amtlichen abinoten-grenze ab', () => {
    const faecher = [fach('a', 'lk'), fach('b', 'lk'), fach('c', 'lk'), fach('d')]
    const noten = faecher.map((f) => note(f.id, 8))
    expect(brauchtFuerZiel(faecher, noten, 'erijon', 2)).toBeCloseTo(643 / 60)
    expect(brauchtFuerZiel(faecher, faecher.map((f) => note(f.id, 15)), 'erijon', 2)).toBeNull()
  })
  it('gibt die letzten werte aelteste zuerst zurueck', () => {
    const noten = [note('m', 12, 'klausur', 10, '2026-09-03'), note('m', 8, 'klausur', 10, '2026-09-01'), note('m', 10, 'klausur', 10, '2026-09-02')]
    expect(trend(noten, 'm', 2)).toEqual([10, 12])
    expect(trend(noten, 'm', 6)).toEqual([8, 10, 12])
  })
})
