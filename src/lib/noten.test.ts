import { describe, expect, it } from 'vitest'
import { tickKey } from './types'
import type { Aufenthalt, Einheit, Fach, Note, Zustand } from './types'
import { abiPrognose, brauchtFuerSchnitt, brauchtFuerZiel, brauchtInKlausur, defizite, fachSchnitt, gesamtpunkteZuAbinote, istNotenDatum, klausurAnteil, kursGewichteterSchnitt, lernMinutenVorNoten, notenGewicht, punkteKurz, punkteZuNote, trend, vergleich } from './noten'

const fach = (id: string, kursart: 'lk' | 'gk' = 'gk'): Fach => ({
  id, user: 'erijon', name: id, kursart, pruefungsfach: null, sortierung: 0,
})
const note = (fachId: string, punkte: number, art: 'klausur' | 'epo' | 'hue' = 'klausur', gewicht = notenGewicht(art), datum = '2026-09-01'): Note => ({
  id: `${fachId}-${art}-${punkte}-${datum}-${gewicht}`, user: 'erijon', fachId, art, punkte, gewicht, datum, titel: '',
})
const einheit = (user: 'erijon' | 'koray', area: Einheit['area'], tag: string, wert: number | null): Einheit => ({
  id: `${user}-${area}-${tag}-${wert}`, user, area, tag, wert, erfasst: null,
})
const zustand = (einheiten: Einheit[], aufenthalte: Aufenthalt[] = []): Zustand => {
  const gruppiert: Zustand['einheiten'] = {}
  for (const e of einheiten) {
    const key = tickKey(e.user, e.area, e.tag)
    gruppiert[key] = [...(gruppiert[key] ?? []), e]
  }
  return { einheiten: gruppiert, gewichte: {}, aufenthalte }
}

describe('punkte und kurze noten', () => {
  it('akzeptiert nur echte daten bis heute', () => {
    expect(istNotenDatum('2026-09-02', '2026-09-02')).toBe(true)
    expect(istNotenDatum('2026-09-03', '2026-09-02')).toBe(false)
    expect(istNotenDatum('2026-09-31', '2026-10-01')).toBe(false)
    expect(istNotenDatum('', '2026-09-02')).toBe(false)
  })
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

describe('gewichtete schnitte', () => {
  it('gewichtet lk doppelt gegen gk', () => {
    const faecher = [fach('lk', 'lk'), fach('g1'), fach('g2')]
    const noten = [note('lk', 12), note('g1', 8), note('g2', 4)]
    expect(kursGewichteterSchnitt(faecher, noten, 'erijon')).toBeCloseTo(9)
  })
  it('laesst faecher ohne note aus dem nenner', () => {
    const faecher = [fach('a', 'lk'), fach('b')]
    expect(kursGewichteterSchnitt(faecher, [note('a', 15)], 'erijon')).toBe(15)
  })
  it('liefert null ohne faecher oder ohne noten', () => {
    expect(kursGewichteterSchnitt([], [], 'erijon')).toBeNull()
    expect(kursGewichteterSchnitt([fach('a')], [], 'erijon')).toBeNull()
  })
})

describe('lernminuten vor noten', () => {
  it('summiert lernen nur im fenster und schliesst die grenze ein', () => {
    const noten = [note('m', 10, 'hue', notenGewicht('hue'), '2026-09-10')]
    const einheiten = [
      einheit('erijon', 'lernen', '2026-08-28', 20),
      einheit('erijon', 'lernen', '2026-08-27', 60),
      einheit('erijon', 'lernen', '2026-09-10', 30),
    ]
    expect(lernMinutenVorNoten(zustand(einheiten), noten, 'erijon')).toEqual([{ note: noten[0]!, lernMinuten: 50 }])
  })
  it('schliesst andere bereiche, fremde einheiten und null-werte aus', () => {
    const noten = [note('m', 10, 'hue', notenGewicht('hue'), '2026-09-05')]
    const einheiten = [
      einheit('erijon', 'gym', '2026-09-01', 90),
      einheit('erijon', 'lesen', '2026-09-02', 40),
      einheit('koray', 'lernen', '2026-09-03', 120),
      einheit('erijon', 'lernen', '2026-09-04', null),
    ]
    expect(lernMinutenVorNoten(zustand(einheiten), noten, 'erijon')).toEqual([{ note: noten[0]!, lernMinuten: 0 }])
  })
  it('zaehlt gemessene lernzeit aus fokus-sitzungen mit', () => {
    const noten = [note('m', 10, 'hue', notenGewicht('hue'), '2026-09-05')]
    const aufenthalte: Aufenthalt[] = [{
      user: 'erijon', bereich: 'lernen', ort: 'fokus lernen',
      ankunft: '2026-09-04T16:00:00+02:00', abgang: '2026-09-04T16:45:00+02:00',
    }]
    expect(lernMinutenVorNoten(zustand([], aufenthalte), noten, 'erijon')).toEqual([
      { note: noten[0]!, lernMinuten: 45 },
    ])
  })
  it('rechnet nur eigene noten und sortiert nach datum', () => {
    const aelter = note('m', 10, 'hue', notenGewicht('hue'), '2026-09-01')
    const neuer = note('m', 8, 'hue', notenGewicht('hue'), '2026-09-08')
    const fremd: Note = { ...note('m', 4, 'hue', notenGewicht('hue'), '2026-09-03'), user: 'koray' }
    const einheiten = [
      einheit('erijon', 'lernen', '2026-09-01', 15),
      einheit('erijon', 'lernen', '2026-09-08', 25),
    ]
    const ergebnis = lernMinutenVorNoten(zustand(einheiten), [neuer, fremd, aelter], 'erijon')
    expect(ergebnis.map((e) => [e.note.id, e.lernMinuten])).toEqual([[aelter.id, 15], [neuer.id, 40]])
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
  it('rechnet vier pruefungen à 15 punkte auf block ii 300', () => {
    const gk = { ...fach('gk'), pruefungsfach: 4 }
    const faecher = [fach('lk1', 'lk'), fach('lk2', 'lk'), fach('lk3', 'lk'), gk]
    const noten = faecher.map((f) => note(f.id, 15))
    expect(abiPrognose(faecher, noten, 'erijon')?.blockII).toBe(300)
  })
  it('nimmt den gewaehlten gk als vierte pruefung, nicht den gk-schnitt', () => {
    const gut = { ...fach('gut'), pruefungsfach: 4 }
    const faecher = [fach('lk1', 'lk'), fach('lk2', 'lk'), fach('lk3', 'lk'), gut, fach('schwach')]
    const noten = [note('lk1', 10), note('lk2', 10), note('lk3', 10), note('gut', 14), note('schwach', 2)]
    // ohne wahl stuende hier der gk-schnitt aus 14 und 2, also 8
    expect(abiPrognose(faecher, noten, 'erijon')?.blockII).toBe(Math.round((30 + 14) * 5))
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
  it('ohne bestehende note ist die 5 die untergrenze', () => {
    expect(brauchtFuerSchnitt([], fach('m', 'lk'))).toBe(5)
    expect(brauchtFuerSchnitt([], fach('m', 'gk'))).toBe(5)
  })
  it('findet die kleinste klausur, die den bestehenden schnitt haelt', () => {
    expect(brauchtFuerSchnitt([note('m', 8)], fach('m', 'gk'))).toBe(8)
    expect(brauchtFuerSchnitt([note('m', 4)], fach('m', 'gk'))).toBe(4)
  })
  it('beruecksichtigt den muendlichen topf beim halten des gesamtschnitts', () => {
    expect(brauchtFuerSchnitt([note('m', 12), note('m', 6, 'hue')], fach('m'))).toBe(12)
  })
})

describe('vergleich', () => {
  const stundenplan = (): Fach[] => {
    const bau = (user: 'erijon' | 'koray', liste: Array<[string, 'lk' | 'gk']>): Fach[] =>
      liste.map(([name, kursart], i) => ({ id: `${user}-${name}`, user, name, kursart, pruefungsfach: null, sortierung: i }))
    return [
      ...bau('erijon', [['bio', 'lk'], ['englisch', 'lk'], ['geschichte', 'lk'], ['mathe', 'gk'], ['deutsch', 'gk'], ['sozialkunde', 'gk'], ['ethik', 'gk'], ['sport', 'gk'], ['informatik', 'gk'], ['bildende kunst', 'gk']]),
      ...bau('koray', [['deutsch', 'lk'], ['physik', 'lk'], ['geschichte', 'lk'], ['mathe', 'gk'], ['englisch', 'gk'], ['sozialkunde', 'gk'], ['katholische religion', 'gk'], ['französisch', 'gk'], ['sport', 'gk'], ['bildende kunst', 'gk']]),
    ]
  }

  it('stellt nur kurse derselben art gegeneinander', () => {
    for (const zeile of vergleich(stundenplan()).zeilen) {
      expect(zeile.erijon.kursart).toBe(zeile.koray.kursart)
    }
  })
  it('paart ueber den platz im stundenplan, nicht ueber den namen', () => {
    const paare = vergleich(stundenplan()).zeilen.map((z) => [z.erijon.name, z.koray.name])
    expect(paare).toContainEqual(['bio', 'physik'])
    expect(paare).toContainEqual(['englisch', 'deutsch'])
    expect(paare).toContainEqual(['deutsch', 'englisch'])
    expect(paare).toContainEqual(['ethik', 'katholische religion'])
    expect(paare).toContainEqual(['geschichte', 'geschichte'])
  })
  it('nimmt jedes fach hoechstens in eine zeile', () => {
    const { zeilen, ohnePaar } = vergleich(stundenplan())
    const ids = [...zeilen.flatMap((z) => [z.erijon.id, z.koray.id]), ...ohnePaar.map((f) => f.id)]
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids.length).toBe(20)
  })
  it('laesst faecher ohne gegenstueck stehen, statt sie zu verrechnen', () => {
    expect(vergleich(stundenplan()).ohnePaar.map((f) => f.name)).toEqual(['informatik', 'französisch'])
  })
  it('ueberspringt ein paar, von dem nur eine seite existiert', () => {
    const nurErijon = stundenplan().filter((f) => f.user === 'erijon' || f.name !== 'physik')
    const { zeilen, ohnePaar } = vergleich(nurErijon)
    expect(zeilen.some((z) => z.erijon.name === 'bio')).toBe(false)
    expect(ohnePaar.map((f) => f.name)).toContain('bio')
  })
})
