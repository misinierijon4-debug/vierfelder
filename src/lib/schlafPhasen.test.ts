import { describe, expect, it } from 'vitest'
import {
  abendDatum,
  achse,
  analysiereSchlafnacht,
  duell,
  formatDauer,
  formatStunden,
  nachtMinute,
  nachtUhrzeit,
  hypnogramm,
  qualitaet,
  registrierteSchlafNutzer,
  stundenmarken,
  verlauf,
  wochenwerte,
} from './schlafPhasen'
import type { Phase, Schlafnacht, UserId } from './types'

/** baut ein iso-datum aus lokaler zeit — der test bleibt damit zeitzonenfest */
function iso(tag: string, hhmm: string): string {
  const [j, mo, t] = tag.split('-').map(Number)
  const [h, m] = hhmm.split(':').map(Number)
  return new Date(j!, mo! - 1, t!, h!, m!).toISOString()
}

const zyklus: Phase[] = [
  { art: 'kern', start: 0, dauer: 60 },
  { art: 'tief', start: 60, dauer: 60 },
  { art: 'wach', start: 120, dauer: 12 },
  { art: 'rem', start: 132, dauer: 120 },
  { art: 'kern', start: 252, dauer: 253 },
]

function nacht(over: Partial<Schlafnacht> & { user?: UserId } = {}): Schlafnacht {
  return {
    user: 'erijon',
    nacht: '2026-08-26',
    schlafMinuten: 493,
    einschlafzeit: iso('2026-08-25', '23:25'),
    aufwachzeit: iso('2026-08-26', '08:35'),
    bettStart: iso('2026-08-25', '23:10'),
    bettEnde: iso('2026-08-26', '08:40'),
    bettMinuten: 570,
    tiefMinuten: 60,
    remMinuten: 120,
    kernMinuten: 313,
    unspezMinuten: 0,
    wachMinuten: 12,
    zielMinuten: 540,
    phasen: zyklus,
    ...over,
  }
}

describe('formate', () => {
  it('schreibt dauern und uhrzeiten lesbar', () => {
    expect(formatDauer(473)).toBe('7h 53m')
    expect(formatDauer(480)).toBe('8h')
    expect(formatDauer(45)).toBe('45m')
    expect(formatDauer(0)).toBe('0m')
    expect(formatStunden(445)).toBe('7,4h')
    expect(nachtUhrzeit(1425)).toBe('23:45')
    expect(nachtUhrzeit(1440 + 30)).toBe('00:30')
  })

  it('legt den abend vor den morgen', () => {
    expect(nachtMinute(iso('2026-08-25', '23:30'))).toBe(23 * 60 + 30)
    expect(nachtMinute(iso('2026-08-26', '06:30'))).toBe(6 * 60 + 30 + 1440)
    // 00:15 liegt 30 minuten nach 23:45, nicht 23 stunden davor
    expect(
      nachtMinute(iso('2026-08-26', '00:15')) - nachtMinute(iso('2026-08-25', '23:45'))
    ).toBe(30)
  })
})

describe('welchem tag eine nacht gehoert', () => {
  it('benennt die nacht nach dem abend, nicht nach dem morgen', () => {
    // sleep cycle nennt die nacht vom 25. auf den 26. „dienstag, 25.“,
    // die datenbank speichert sie unter dem morgen (26.)
    expect(abendDatum(iso('2026-08-25', '23:25'))).toBe('2026-08-25')
    expect(abendDatum(iso('2026-08-26', '00:14'))).toBe('2026-08-25')
    expect(abendDatum(iso('2026-08-26', '21:00'))).toBe('2026-08-26')
  })

  it('kommt ueber monats- und jahresgrenzen', () => {
    expect(abendDatum(iso('2026-09-01', '00:30'))).toBe('2026-08-31')
    expect(abendDatum(iso('2027-01-01', '01:15'))).toBe('2026-12-31')
  })
})

describe('analyse einer nacht', () => {
  it('nimmt die phasen der ansicht und rechnet effizienz gegen die bettzeit', () => {
    const a = analysiereSchlafnacht(nacht())
    expect(a.hatPhasenDaten).toBe(true)
    expect(a.hatZeitfensterDaten).toBe(true)
    expect(a.tiefMinuten).toBe(60)
    expect(a.remMinuten).toBe(120)
    expect(a.coreMinuten).toBe(313)
    expect(a.wachphasenAnzahl).toBe(1)
    expect(a.inBedBasis).toBe('bett')
    expect(a.inBedMinuten).toBe(570)
    expect(a.effizienz).toBe(86)
    expect(a.einschlafUhrzeit).toBe('23:25')
    expect(a.aufwachUhrzeit).toBe('08:35')
    // die anteile beziehen sich auf die erfasste schlafzeit, nicht auf die bettzeit
    expect(a.tiefProzent + a.remProzent + a.coreProzent).toBe(100)
  })

  it('erfindet ohne stadien nichts und haelt die dauer als einen block', () => {
    const a = analysiereSchlafnacht(
      nacht({ tiefMinuten: 0, remMinuten: 0, kernMinuten: 0, wachMinuten: 0, phasen: [] })
    )
    expect(a.hatPhasenDaten).toBe(false)
    expect(a.tiefProzent).toBe(0)
    expect(a.remProzent).toBe(0)
    // der schlaf bleibt ein block; links und rechts steht das wachliegen im bett
    expect(a.stuecke.filter((p) => p.art !== 'wach')).toEqual([
      { art: 'unspez', start: 0, dauer: 493 },
    ])
    expect(a.stuecke.filter((p) => p.art === 'wach')).toEqual([
      { art: 'wach', start: -15, dauer: 15 },
      { art: 'wach', start: 550, dauer: 5 },
    ])
  })

  it('zeigt nie mehr schlaf als bettzeit', () => {
    // so sah der glitch aus: 779 gespeicherte minuten in einem bett von 525
    const a = analysiereSchlafnacht(nacht({ schlafMinuten: 779, bettMinuten: 525 }))
    expect(a.inBedMinuten).toBeGreaterThanOrEqual(a.schlafMinuten)
    expect(a.effizienz).toBeLessThanOrEqual(100)
  })

  it('zaehlt das einschlafen zur wachzeit, wie sleep cycle', () => {
    const a = analysiereSchlafnacht(nacht())
    // 23:10 ins bett, 23:25 eingeschlafen
    expect(a.einschlafdauerMinuten).toBe(15)
    expect(a.imBettVonUhrzeit).toBe('23:10')
    expect(a.imBettBisUhrzeit).toBe('08:40')
    // 570 minuten im bett, davon 493 geschlafen: der rest ist wach
    expect(a.wachMinuten).toBe(77)
    expect(a.schlafMinuten + a.wachMinuten).toBe(a.inBedMinuten)
    expect(a.wachProzent).toBe(Math.round((77 / 570) * 100))
  })

  it('laesst die einschlafdauer leer, wenn keine bettzeit gemessen wurde', () => {
    const a = analysiereSchlafnacht(nacht({ bettStart: null, bettEnde: null, bettMinuten: null }))
    expect(a.einschlafdauerMinuten).toBeNull()
    expect(a.imBettVonUhrzeit).toBeNull()
    // ohne bettzeit bleibt nur, was health an wachsegmenten gemeldet hat
    expect(a.wachMinuten).toBe(12)
  })

  it('laesst die effizienz leer, wenn kein aufwachen gemessen wurde', () => {
    const a = analysiereSchlafnacht(nacht({ aufwachzeit: null, bettMinuten: null, bettEnde: null }))
    expect(a.effizienz).toBeNull()
    expect(a.inBedBasis).toBe('fenster')
    expect(a.aufwachUhrzeit).toBe('--:--')
  })
})

describe('qualitaet', () => {
  /** die vier naechte, an denen die kurve angepasst wurde: schlafminuten -> sleep cycle */
  const GEMESSEN: [number, number][] = [
    [274, 65],
    [391, 81],
    [467, 89],
    [479, 96],
  ]

  it('trifft die gemessenen naechte auf drei prozentpunkte', () => {
    for (const [minuten, sleepCycle] of GEMESSEN) {
      expect(Math.abs(qualitaet(minuten) - sleepCycle)).toBeLessThanOrEqual(3)
    }
  })

  it('bleibt zwischen null und hundert und steigt mit der dauer', () => {
    expect(qualitaet(0)).toBe(0)
    expect(qualitaet(-30)).toBe(0)
    // die kurve saettigt bei 530 minuten, danach bleibt sie oben stehen
    expect(qualitaet(530)).toBe(100)
    expect(qualitaet(900)).toBe(100)
    let vorher = -1
    for (let m = 0; m <= 600; m += 10) {
      const wert = qualitaet(m)
      expect(wert).toBeGreaterThanOrEqual(vorher)
      vorher = wert
    }
  })

  it('haengt an der schlafzeit, nicht an der bettzeit', () => {
    const kurz = analysiereSchlafnacht(nacht({ bettMinuten: 400 }))
    const lang = analysiereSchlafnacht(nacht({ bettMinuten: 700 }))
    expect(kurz.qualitaet).toBe(lang.qualitaet)
    expect(kurz.effizienz).not.toBe(lang.effizienz)
  })
})

describe('woche und duell', () => {
  const meine = [
    nacht({ nacht: '2026-08-24', einschlafzeit: iso('2026-08-23', '23:00'), schlafMinuten: 420 }),
    nacht({ nacht: '2026-08-25', einschlafzeit: iso('2026-08-24', '23:20'), schlafMinuten: 480 }),
    nacht({ nacht: '2026-08-26', einschlafzeit: iso('2026-08-25', '23:40'), schlafMinuten: 450 }),
  ]
  const seine = [
    nacht({ user: 'koray', nacht: '2026-08-25', einschlafzeit: iso('2026-08-25', '00:30'), schlafMinuten: 400 }),
    nacht({ user: 'koray', nacht: '2026-08-26', einschlafzeit: iso('2026-08-26', '01:30'), schlafMinuten: 380 }),
  ]

  it('mittelt die dauer und misst die streuung um den eigenen median', () => {
    const w = wochenwerte('erijon', [...meine, ...seine])
    expect(w.naechte).toBe(3)
    expect(w.schlafSchnitt).toBe(450)
    expect(w.einschlafMedian).toBe(23 * 60 + 20)
    expect(w.streuung).toBeCloseTo(40 / 3, 5)
  })

  it('kuert pro disziplin einen sieger, aber nicht ohne daten', () => {
    const alle = [...meine, ...seine]
    const zeilen = duell(wochenwerte('erijon', alle), wochenwerte('koray', alle))
    const imBett = zeilen.find((z) => z.id === 'imbett')!
    expect(imBett.sieger).toBe('erijon')
    expect(imBett.text.erijon).toBe('23:20')
    expect(imBett.text.koray).toBe('01:00')
    expect(zeilen.find((z) => z.id === 'schnitt')!.sieger).toBe('erijon')

    const ohne = duell(wochenwerte('erijon', meine), wochenwerte('koray', []))
    expect(ohne.every((z) => z.sieger === null)).toBe(true)
  })

  it('unterscheidet verbundene Nutzer von noch nicht eingerichteten', () => {
    const registrierte = registrierteSchlafNutzer(meine)
    expect(registrierte.has('erijon')).toBe(true)
    expect(registrierte.has('koray')).toBe(false)

    expect(registrierteSchlafNutzer([...meine, ...seine]).has('koray')).toBe(true)
  })
})

describe('achse', () => {
  it('deckt mindestens 21 bis 09 uhr ab und waechst mit den daten', () => {
    const spaet = analysiereSchlafnacht(
      nacht({
        einschlafzeit: iso('2026-08-26', '02:10'),
        aufwachzeit: iso('2026-08-26', '11:20'),
        bettStart: null,
        bettEnde: null,
        bettMinuten: null,
      })
    )
    expect(achse([])).toEqual({ von: 1260, bis: 1980 })
    expect(achse([spaet]).bis).toBe(1440 + 12 * 60)
    expect(stundenmarken(1260, 1980)).toEqual([1260, 1440, 1620, 1800, 1980])
  })
})

describe('verlauf', () => {
  it('legt die phasen absolut auf die nacht und fasst gleiche zusammen', () => {
    const a = analysiereSchlafnacht(nacht())
    const v = verlauf(a).linie

    // 23:10 hingelegt, 23:25 eingeschlafen: das wachliegen steht vorn
    expect(v[0]).toEqual({ art: 'wach', von: 23 * 60 + 10, bis: 23 * 60 + 25 })
    expect(v.map((s) => s.art)).toEqual(['wach', 'kern', 'tief', 'wach', 'rem', 'kern', 'wach'])
    // luecklos innerhalb der gemessenen phasen
    expect(v[1]!.von).toBe(v[0]!.bis)
    expect(v[2]!.von).toBe(v[1]!.bis)
  })

  it('macht aus unspez und kern eine einzige linie', () => {
    const a = analysiereSchlafnacht(
      nacht({
        bettStart: null,
        bettEnde: null,
        bettMinuten: null,
        phasen: [
          { art: 'kern', start: 0, dauer: 60 },
          { art: 'unspez', start: 60, dauer: 60 },
          { art: 'tief', start: 120, dauer: 30 },
        ],
      })
    )
    const v = verlauf(a).linie
    expect(v.map((s) => s.art)).toEqual(['kern', 'tief'])
    expect(v[0]!.bis - v[0]!.von).toBe(120)
  })

  it('nimmt kurze unruhe aus der linie und verteilt ihre zeit an die nachbarn', () => {
    const a = analysiereSchlafnacht(
      nacht({
        bettStart: null,
        bettEnde: null,
        bettMinuten: null,
        phasen: [
          { art: 'kern', start: 0, dauer: 60 },
          { art: 'wach', start: 60, dauer: 2 },
          { art: 'tief', start: 62, dauer: 60 },
          { art: 'wach', start: 122, dauer: 20 },
          { art: 'kern', start: 142, dauer: 60 },
        ],
      })
    )
    const { linie, unruhen } = verlauf(a)

    // die zwei minuten sind keine wachphase, die zwanzig minuten schon
    expect(linie.map((s) => s.art)).toEqual(['kern', 'tief', 'wach', 'kern'])
    expect(unruhen).toHaveLength(1)
    expect(unruhen[0]!.bis - unruhen[0]!.von).toBe(2)
    // die linie reisst nicht: beide nachbarn treffen sich in der mitte
    expect(linie[0]!.bis).toBe(linie[1]!.von)
    expect(linie[0]!.bis - linie[0]!.von).toBe(61)
    // und die zaehlung nennt nur das echte aufwachen
    expect(a.wachphasenAnzahl).toBe(1)
  })
})

describe('hypnogramm', () => {
  const masse = { breite: 100, oben: 0, unten: 100, radius: 4 }

  it('zeichnet je phase ein stueck auf ihrer tiefe', () => {
    const kurve = hypnogramm(
      [
        { art: 'wach', von: 0, bis: 50 },
        { art: 'tief', von: 50, bis: 100 },
      ],
      0,
      100,
      masse
    )

    expect(kurve.map((k) => k.art)).toEqual(['wach', 'tief'])
    // wach liegt oben, tief unten
    expect(kurve[0]!.d.startsWith('M 0 0')).toBe(true)
    expect(kurve[1]!.d.endsWith('L 100 100')).toBe(true)
    // beide haelften des uebergangs treffen sich in der mitte der grenze
    expect(kurve[0]!.d).toContain('50 50')
    expect(kurve[1]!.d.startsWith('M 50 50')).toBe(true)
  })

  it('kuerzt den uebergang an kurzen phasen, statt sie zu ueberrennen', () => {
    const kurve = hypnogramm(
      [
        { art: 'kern', von: 0, bis: 49 },
        { art: 'wach', von: 49, bis: 50 },
        { art: 'kern', von: 50, bis: 100 },
      ],
      0,
      100,
      masse
    )

    // die wachphase ist eine einheit breit, der uebergang darf nur eine halbe sein
    expect(kurve[1]!.d).toBe('M 49 30 C 49.13 15 49.25 0 49.5 0 L 49.5 0 C 49.75 0 49.88 15 50 30')
  })

  it('laesst eine luecke ohne messung offen', () => {
    const kurve = hypnogramm(
      [
        { art: 'kern', von: 0, bis: 20 },
        { art: 'kern', von: 60, bis: 100 },
      ],
      0,
      100,
      masse
    )

    // kein uebergang ueber die luecke: beide stuecke enden flach auf ihrer hoehe
    expect(kurve[0]!.d).toBe('M 0 60 L 20 60')
    expect(kurve[1]!.d).toBe('M 60 60 L 100 60')
  })

  it('bleibt ohne phasen und ohne spanne leer', () => {
    expect(hypnogramm([], 0, 100, masse)).toEqual([])
    expect(hypnogramm([{ art: 'kern', von: 0, bis: 1 }], 100, 100, masse)).toEqual([])
  })
})
