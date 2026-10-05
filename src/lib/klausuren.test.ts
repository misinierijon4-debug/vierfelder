import { describe, expect, it } from 'vitest'
import type { Fach, Klausur, Note, Notenstand, UserId } from './types'
import { abstandText, datumKurz, eniKlausur, eniKlausurAusStand, kommendeKlausuren, naechsteKlausur, ohneNote, tageBis, zeitText } from './klausuren'

const fach = (id: string, user: UserId, name: string, kursart: Fach['kursart'] = 'gk'): Fach =>
  ({ id, user, name, kursart, pruefungsfach: null, sortierung: 0 })

const klausur = (id: string, user: UserId, fachId: string, datum: string, beginn: string | null = '08:00', ende: string | null = '12:00'): Klausur =>
  ({ id, user, fachId, art: 'klausur', kurs: null, datum, beginn, ende, bemerkung: '' })

const FAECHER = [
  fach('eg', 'erijon', 'geschichte', 'lk'),
  fach('em', 'erijon', 'mathe'),
  fach('ed', 'erijon', 'deutsch'),
  fach('kg', 'koray', 'geschichte', 'lk'),
  fach('ke', 'koray', 'englisch'),
]
const KLAUSUREN = [
  klausur('1', 'erijon', 'em', '2026-11-23', '07:55', '09:30'),
  klausur('2', 'erijon', 'eg', '2026-11-18'),
  klausur('3', 'erijon', 'ed', '2026-09-30'),
  klausur('4', 'koray', 'kg', '2026-11-18'),
  klausur('5', 'koray', 'ke', '2026-12-09', null, null),
]
const stand = (noten: Note[] = []): Notenstand => ({ faecher: FAECHER, noten, klausuren: KLAUSUREN })

describe('klausuren', () => {
  it('zählt kalendertage, auch über die zeitumstellung', () => {
    expect(tageBis('2026-10-05', '2026-10-27')).toBe(22)
    // sommerzeit endet am 25.10.2026
    expect(tageBis('2026-10-24', '2026-10-27')).toBe(3)
    expect(tageBis('2026-10-05', '2026-09-30')).toBe(-5)
    expect(abstandText(0)).toBe('heute')
    expect(abstandText(1)).toBe('morgen')
    expect(abstandText(22)).toBe('in 22 tagen')
    expect(abstandText(-5)).toBe('vor 5 tagen')
  })

  it('schreibt datum und zeit kurz', () => {
    expect(datumKurz('2026-10-27')).toBe('di 27.10.')
    expect(zeitText(KLAUSUREN[0]!)).toBe('07:55–09:30')
    expect(zeitText(KLAUSUREN[4]!)).toBeNull()
  })

  it('listet nur kommende eigene klausuren, nächste zuerst, und erkennt gemeinsame', () => {
    const liste = kommendeKlausuren(stand(), 'erijon', '2026-10-05')
    expect(liste.map((z) => [z.fach.name, z.tage, z.zusammen])).toEqual([
      ['geschichte', 44, true],
      ['mathe', 49, false],
    ])
    expect(kommendeKlausuren(stand(), 'koray', '2026-11-18').map((z) => [z.fach.name, z.tage])).toEqual([
      ['geschichte', 0],
      ['englisch', 21],
    ])
  })

  it('findet die nächste klausur eines fachs', () => {
    expect(naechsteKlausur(stand(), FAECHER[1]!, '2026-10-05')?.klausur.datum).toBe('2026-11-23')
    expect(naechsteKlausur(stand(), FAECHER[2]!, '2026-10-05')).toBeNull()
  })

  it('erinnert an eine geschriebene klausur, bis die note da ist', () => {
    expect(ohneNote(stand(), 'erijon', '2026-10-05').map((z) => z.fach.name)).toEqual(['deutsch'])
    const note: Note = { id: 'n', user: 'erijon', fachId: 'ed', art: 'klausur', punkte: 11, gewicht: 10, datum: '2026-10-20', titel: '' }
    expect(ohneNote(stand([note]), 'erijon', '2026-10-21')).toEqual([])
    // eine ältere klausurnote zählt nicht für diese klausur
    expect(ohneNote(stand([{ ...note, datum: '2026-09-01' }]), 'erijon', '2026-10-21')).toHaveLength(1)
    // nach sechs wochen hört es auf
    expect(ohneNote(stand(), 'erijon', '2026-11-12')).toEqual([])
  })

  it('kommt ohne klausurplan aus', () => {
    expect(kommendeKlausuren({ faecher: FAECHER, noten: [] }, 'erijon', '2026-10-05')).toEqual([])
  })

  it('gibt ENI nur eine klausur in den nächsten drei wochen', () => {
    expect(eniKlausurAusStand(stand(), 'erijon', '2026-10-05')).toBeNull()
    expect(eniKlausurAusStand(stand(), 'erijon', '2026-10-28')).toEqual({ fach: 'geschichte lk', datum: '2026-11-18', tage: 21 })
    expect(eniKlausurAusStand(stand(), 'erijon', '2026-11-18')).toEqual({ fach: 'geschichte lk', datum: '2026-11-18', tage: 0 })
    expect(eniKlausur([
      { fach: 'mathe', lk: false, datum: '2026-11-23' },
      { fach: 'bio', lk: true, datum: '2026-11-20' },
    ], '2026-11-19')).toEqual({ fach: 'bio lk', datum: '2026-11-20', tage: 1 })
  })
})
