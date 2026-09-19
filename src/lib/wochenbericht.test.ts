import { describe, expect, it } from 'vitest'
import {
  alsDauer,
  alsDelta,
  baueWochenbericht,
  berichtsWochen,
  istWochenmontag,
  wochenMontag,
  wochenMarken,
} from './wochenbericht'
import type { Schlafnacht, Zustand } from './types'
import { tickKey } from './types'

function leererZustand(): Zustand {
  return { einheiten: {}, gewichte: {}, aufenthalte: [] }
}

function einheit(id: string, user: 'erijon' | 'koray', area: 'lernen' | 'gym' | 'boxen' | 'lesen', tag: string, wert: number | null) {
  return { id, user, area, tag, wert, erfasst: `${tag}T18:00:00.000Z` }
}

function nacht(user: 'erijon' | 'koray', abend: string, minuten: number, wert: number | null): Schlafnacht {
  return {
    user,
    nacht: abend,
    schlafMinuten: minuten,
    einschlafzeit: `${abend}T22:30:00.000Z`,
    aufwachzeit: null,
    bettStart: null,
    bettEnde: null,
    bettMinuten: null,
    tiefMinuten: 0,
    remMinuten: 0,
    kernMinuten: 0,
    unspezMinuten: 0,
    wachMinuten: 0,
    zielMinuten: 480,
    phasen: null,
    nachtwert: wert,
    scoreKonfidenz: null,
  }
}

// woche 14.–20.09.2026 ist eine montags-woche; die vorwoche beginnt am 07.09.
const WOCHE = '2026-09-14'

describe('wochenbericht', () => {
  it('zaehlt geplante Zukunftsdaten weder in Summen noch Diagrammen', () => {
    const z = leererZustand()
    z.einheiten[tickKey('erijon', 'lernen', '2026-09-20')] = [einheit('plan', 'erijon', 'lernen', '2026-09-20', 60)]
    z.gewichte['koray|2026-09-20'] = 75
    const b = baueWochenbericht(WOCHE, z, [nacht('erijon', '2026-09-20', 480, 80)], '2026-09-16')
    expect(b.punkte).toEqual({ erijon: 0, koray: 0 })
    expect(b.felder.every(f => f.minuten.erijon === 0 && !f.tage.erijon.some(Boolean))).toBe(true)
    expect(b.schlaf.person.erijon.naechte).toBe(0)
    expect(b.gewicht.koray.punkte).toEqual([])
    expect(b.verlauf.at(-1)?.summe).toEqual(b.punkte)
    expect(wochenMarken(z, [], '2026-09-16').get(WOCHE)).toBeUndefined()
  })
  it('ordnet Aufenthalte am lokalen Montag statt am UTC-Sonntag ein', () => {
    const z = leererZustand()
    z.aufenthalte.push({ user: 'koray', bereich: 'lesen', ort: 'fokus',
      ankunft: '2026-09-13T22:15:00Z', abgang: '2026-09-13T22:45:00Z' })
    expect([...berichtsWochen(z, [], '2026-09-14')]).toEqual([WOCHE])
    expect(wochenMarken(z, [], '2026-09-14').get(WOCHE)?.punkte.koray).toBe(1)
  })
  it('zählt einen punkt je person, feld und tag — mehrere einheiten am selben tag nicht doppelt', () => {
    const z = leererZustand()
    z.einheiten[tickKey('erijon', 'boxen', '2026-09-14')] = [
      einheit('a', 'erijon', 'boxen', '2026-09-14', 60),
      einheit('b', 'erijon', 'boxen', '2026-09-14', 45),
    ]
    z.einheiten[tickKey('erijon', 'boxen', '2026-09-15')] = [
      einheit('c', 'erijon', 'boxen', '2026-09-15', 30),
    ]
    z.gewichte['erijon|2026-09-14'] = 69.5

    const bericht = baueWochenbericht(WOCHE, z, [], '2026-09-28')
    expect(bericht.punkte.erijon).toBe(3)
    expect(bericht.punkte.koray).toBe(0)
    expect(bericht.punktTage.erijon).toBe(2)
    expect(bericht.sieger).toBe('erijon')

    const boxen = bericht.felder.find((f) => f.feld === 'boxen')!
    expect(boxen.punkte.erijon).toBe(2)
    expect(boxen.minuten.erijon).toBe(135)
    expect(boxen.tage.erijon).toEqual([true, true, false, false, false, false, false])
  })

  it('trennt beim lesen seiten und gemessene minuten', () => {
    const z = leererZustand()
    z.einheiten[tickKey('koray', 'lesen', '2026-09-16')] = [
      einheit('d', 'koray', 'lesen', '2026-09-16', 42),
    ]
    z.aufenthalte.push({
      id: 'm1',
      user: 'koray',
      bereich: 'lesen',
      ort: 'fokus lesen',
      ankunft: '2026-09-17T19:00:00.000Z',
      abgang: '2026-09-17T19:35:00.000Z',
    })

    const bericht = baueWochenbericht(WOCHE, z, [], '2026-09-28')
    const lesen = bericht.felder.find((f) => f.feld === 'lesen')!
    expect(lesen.seiten?.koray).toBe(42)
    expect(lesen.minuten.koray).toBe(35)
    expect(lesen.punkte.koray).toBe(2)
  })

  it('vergleicht schlafdauer und nachtwert mit der vorwoche', () => {
    const naechte = [
      nacht('erijon', '2026-09-14', 480, 80),
      nacht('erijon', '2026-09-15', 540, 78),
      // vorwoche: kürzer und schlechter
      nacht('erijon', '2026-09-07', 420, 70),
      nacht('erijon', '2026-09-08', 420, 72),
    ]

    const bericht = baueWochenbericht(WOCHE, leererZustand(), naechte, '2026-09-28')
    const e = bericht.schlaf.person.erijon
    expect(e.naechte).toBe(2)
    expect(e.minuten.wert).toBe(510)
    expect(e.minuten.vorwoche).toBe(420)
    expect(e.minuten.delta).toBe(90)
    expect(e.wert.wert).toBe(79)
    expect(e.wert.delta).toBe(8)
    // ohne daten bleibt der trend leer statt auf null zu fallen
    expect(bericht.schlaf.person.koray.minuten.delta).toBeNull()
  })

  it('lässt nächte ohne nachtwert aus dem qualitätsschnitt, nicht aus der dauer', () => {
    const naechte = [nacht('koray', '2026-09-14', 360, null), nacht('koray', '2026-09-15', 480, 60)]
    const bericht = baueWochenbericht(WOCHE, leererZustand(), naechte, '2026-09-28')
    expect(bericht.schlaf.person.koray.minuten.wert).toBe(420)
    expect(bericht.schlaf.person.koray.wert.wert).toBe(60)
  })

  it('hält die laufende woche offen: der verlauf endet heute statt auf null zu fallen', () => {
    const z = leererZustand()
    z.einheiten[tickKey('erijon', 'gym', '2026-09-14')] = [
      einheit('e', 'erijon', 'gym', '2026-09-14', 60),
    ]

    const laufend = baueWochenbericht(WOCHE, z, [], '2026-09-16')
    expect(laufend.endgueltig).toBe(false)
    expect(laufend.standTag).toBe('2026-09-16')
    expect(laufend.verlauf.map((p) => p.gezaehlt)).toEqual([
      true, true, true, false, false, false, false,
    ])
    expect(laufend.verlauf[2]!.summe.erijon).toBe(1)
    expect(laufend.verlauf[6]!.summe.erijon).toBe(1)

    // am montag danach friert der bericht ein
    const fertig = baueWochenbericht(WOCHE, z, [], '2026-09-21')
    expect(fertig.endgueltig).toBe(true)
    expect(fertig.verlauf.every((p) => p.gezaehlt)).toBe(true)
  })

  it('sortiert die felder nach gemeinsamer stärke und bleibt bei gleichstand in app-reihenfolge', () => {
    const z = leererZustand()
    for (const tag of ['2026-09-14', '2026-09-15', '2026-09-16']) {
      z.einheiten[tickKey('erijon', 'boxen', tag)] = [einheit(`b${tag}`, 'erijon', 'boxen', tag, 30)]
    }
    z.einheiten[tickKey('koray', 'lernen', '2026-09-14')] = [
      einheit('l1', 'koray', 'lernen', '2026-09-14', 30),
    ]

    const bericht = baueWochenbericht(WOCHE, z, [], '2026-09-28')
    expect(bericht.felder[0]!.feld).toBe('boxen')
    expect(bericht.felder.map((f) => f.feld)).toHaveLength(5)
    // die drei leeren felder behalten die reihenfolge der app: gym vor lesen vor gewicht
    expect(bericht.felder.slice(2).map((f) => f.feld)).toEqual(['gym', 'lesen', 'gewicht'])
  })

  it('nimmt beim gewicht schnitt und veränderung über die woche', () => {
    const z = leererZustand()
    z.gewichte['erijon|2026-09-14'] = 69.7
    z.gewichte['erijon|2026-09-17'] = 69.5
    z.gewichte['erijon|2026-09-20'] = 69.2

    const bericht = baueWochenbericht(WOCHE, z, [], '2026-09-28')
    const g = bericht.gewicht.erijon
    expect(g.punkte).toHaveLength(3)
    expect(g.schnitt).toBeCloseTo(69.466, 2)
    expect(g.delta).toBeCloseTo(-0.5, 5)
    // eine einzelne messung ergibt keine veränderung
    expect(bericht.gewicht.koray.delta).toBeNull()
  })

  it('kennt die wochen, für die es einen bericht gibt — und keine aus der zukunft', () => {
    const z = leererZustand()
    z.einheiten[tickKey('erijon', 'gym', '2026-09-16')] = [
      einheit('f', 'erijon', 'gym', '2026-09-16', 60),
    ]
    z.gewichte['koray|2026-09-09'] = 74.6
    z.einheiten[tickKey('erijon', 'gym', '2026-12-24')] = [
      einheit('g', 'erijon', 'gym', '2026-12-24', 60),
    ]

    const wochen = berichtsWochen(z, [nacht('koray', '2026-09-01', 420, 70)], '2026-09-19')
    expect([...wochen].sort()).toEqual(['2026-08-31', '2026-09-07', '2026-09-14'])
  })

  it('erkennt wochenmontage und findet den montag zu einem tag', () => {
    expect(istWochenmontag('2026-09-14')).toBe(true)
    expect(istWochenmontag('2026-09-15')).toBe(false)
    expect(istWochenmontag('2026-02-31')).toBe(false)
    expect(istWochenmontag('quatsch')).toBe(false)
    expect(wochenMontag('2026-09-20')).toBe('2026-09-14')
  })

  it('formatiert dauer und differenz so, wie die anzeige sie braucht', () => {
    expect(alsDauer(520)).toBe('8:40')
    expect(alsDauer(60)).toBe('1:00')
    expect(alsDauer(null)).toBe('—')
    expect(alsDelta(57, 'm')).toBe('+57m')
    expect(alsDelta(-6)).toBe('−6')
    expect(alsDelta(0)).toBe('±0')
    expect(alsDelta(null)).toBe('')
  })
})
