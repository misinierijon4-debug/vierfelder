import { describe, expect, it } from 'vitest'
import {
  abendDatum,
  achse,
  achsenUhrzeit,
  analysiereSchlafnacht,
  duell,
  formatDauer,
  formatStunden,
  nachtMinute,
  nachtUhrzeit,
  qualitaet,
  PHASEN_SCHWELLE,
  registrierteSchlafNutzer,
  stundenmarken,
  verlauf,
  wochenwerte,
} from './schlafPhasen'
import type { NachtPhasenAnalyse } from './schlafPhasen'
import type { Phase, PhasenArt, Schlafnacht, UserId } from './types'

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
    nachtwert: 74,
    scoreKonfidenz: 100,
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

  it('haengt als ersatzkurve an der schlafzeit, nicht an der bettzeit', () => {
    const kurz = analysiereSchlafnacht(nacht({ nachtwert: null, bettMinuten: 400 }))
    const lang = analysiereSchlafnacht(nacht({ nachtwert: null, bettMinuten: 700 }))
    expect(kurz.qualitaet).toBe(lang.qualitaet)
    expect(kurz.effizienz).not.toBe(lang.effizienz)
  })
})

describe('zeitumstellung', () => {
  /**
   * Berlin stellt am letzten Sonntag im Oktober 03:00 auf 02:00 (die Nacht hat
   * 25 Stunden) und am letzten Sonntag im Maerz 02:00 auf 03:00 (23 Stunden).
   * Beides sind Naechte, in denen die Uhrzeitdifferenz nicht die Dauer ist.
   */
  const ueberDieUmstellung = (over: Partial<Schlafnacht>): Schlafnacht =>
    nacht({
      bettStart: null,
      bettEnde: null,
      bettMinuten: null,
      tiefMinuten: 90,
      remMinuten: 110,
      kernMinuten: 320,
      unspezMinuten: 0,
      wachMinuten: 20,
      phasen: [],
      ...over,
    })

  it('zaehlt die lange oktobernacht mit ihren echten neun stunden', () => {
    const a = analysiereSchlafnacht(
      ueberDieUmstellung({
        nacht: '2026-10-25',
        schlafMinuten: 520,
        einschlafzeit: '2026-10-24T21:00:00.000Z', // 23:00 MESZ
        aufwachzeit: '2026-10-25T06:00:00.000Z', // 07:00 MEZ
      })
    )

    expect(a.aufwachMinute - a.einschlafMinute).toBe(540)
    expect(a.inBedMinuten).toBe(540)
    // aus der uhrzeitdifferenz waeren es 480 minuten und damit glatte 100%
    expect(a.effizienz).toBe(96)
    expect(a.aufwachUhrzeit).toBe('07:00')
  })

  it('zaehlt die kurze maerznacht mit ihren echten sieben stunden', () => {
    const a = analysiereSchlafnacht(
      ueberDieUmstellung({
        nacht: '2026-03-29',
        schlafMinuten: 400,
        einschlafzeit: '2026-03-28T22:00:00.000Z', // 23:00 MEZ
        aufwachzeit: '2026-03-29T05:00:00.000Z', // 07:00 MESZ
      })
    )

    expect(a.aufwachMinute - a.einschlafMinute).toBe(420)
    expect(a.inBedMinuten).toBe(420)
    // aus der uhrzeitdifferenz waeren es 480 minuten und nur 83%
    expect(a.effizienz).toBe(95)
  })

  it('beschriftet die achse mit der uhr, nicht mit der gezaehlten minute', () => {
    const a = analysiereSchlafnacht(
      ueberDieUmstellung({
        nacht: '2026-10-25',
        schlafMinuten: 520,
        einschlafzeit: '2026-10-24T21:00:00.000Z',
        aufwachzeit: '2026-10-25T06:00:00.000Z',
      })
    )

    expect(achsenUhrzeit(a, a.einschlafMinute)).toBe('23:00')
    // 540 echte minuten nach 23:00 ist sieben uhr, nicht acht
    expect(achsenUhrzeit(a, a.aufwachMinute)).toBe('07:00')
  })

  it('misst einschlafen und nachliegen ueber die umstellung hinweg', () => {
    const a = analysiereSchlafnacht(
      ueberDieUmstellung({
        nacht: '2026-10-25',
        schlafMinuten: 520,
        einschlafzeit: '2026-10-24T21:00:00.000Z', // 23:00 MESZ
        aufwachzeit: '2026-10-25T06:00:00.000Z', // 07:00 MEZ
        bettStart: '2026-10-24T20:45:00.000Z', // 22:45 MESZ
        bettEnde: '2026-10-25T06:10:00.000Z', // 07:10 MEZ
        bettMinuten: 565,
      })
    )

    expect(a.einschlafdauerMinuten).toBe(15)
    expect(a.bettBis! - a.aufwachMinute).toBe(10)
  })
})

describe('naechte um mitternacht', () => {
  it('legt 00:15 neben 23:45, nicht dreiundzwanzig stunden davor', () => {
    const spaet = analysiereSchlafnacht(
      nacht({
        einschlafzeit: iso('2026-08-26', '00:15'),
        aufwachzeit: iso('2026-08-26', '07:15'),
        bettStart: null,
        bettEnde: null,
        bettMinuten: null,
      })
    )
    const frueh = analysiereSchlafnacht(
      nacht({
        einschlafzeit: iso('2026-08-25', '23:45'),
        aufwachzeit: iso('2026-08-26', '06:45'),
        bettStart: null,
        bettEnde: null,
        bettMinuten: null,
      })
    )

    expect(spaet.einschlafMinute - frueh.einschlafMinute).toBe(30)
    expect(spaet.aufwachMinute).toBeGreaterThan(spaet.einschlafMinute)
  })

  it('traegt eine nacht nach dem abend, an dem sie begonnen hat', () => {
    expect(abendDatum(iso('2026-08-26', '00:15'))).toBe('2026-08-25')
    expect(abendDatum(iso('2026-08-25', '23:45'))).toBe('2026-08-25')
  })
})

describe('verlauf einer nacht, der noch nicht geladen ist', () => {
  it('trennt "noch nicht geladen" von "ohne stadien gemessen"', () => {
    const offen = analysiereSchlafnacht(nacht({ phasen: null }))
    const ohneStadien = analysiereSchlafnacht(nacht({ phasen: [] }))

    expect(offen.verlaufGeladen).toBe(false)
    expect(ohneStadien.verlaufGeladen).toBe(true)
  })

  it('erfindet ohne verlauf keine wachphasen', () => {
    const offen = analysiereSchlafnacht(nacht({ phasen: null }))
    expect(offen.wachphasenAnzahl).toBe(0)
  })

  it('laesst die kennzahlen einer nacht ohne verlauf unangetastet', () => {
    // die minuten je stadium kommen aus den summen der ansicht, nicht aus dem
    // verlauf — eine nacht ohne verlauf zeigt sie deshalb vollstaendig
    const mit = analysiereSchlafnacht(nacht())
    const ohne = analysiereSchlafnacht(nacht({ phasen: null }))

    expect(ohne.tiefMinuten).toBe(mit.tiefMinuten)
    expect(ohne.remMinuten).toBe(mit.remMinuten)
    expect(ohne.qualitaet).toBe(mit.qualitaet)
    expect(ohne.effizienz).toBe(mit.effizienz)
  })
})

describe('nachtwert', () => {
  it('nimmt den gerechneten wert der datenbank, nicht die ersatzkurve', () => {
    const a = analysiereSchlafnacht(nacht({ nachtwert: 47, scoreKonfidenz: 100 }))
    expect(a.qualitaet).toBe(47)
    expect(a.qualitaetKonfidenz).toBe(100)
    // die kurve saehe hier nur die dauer und gaebe eine andere zahl
    expect(a.qualitaet).not.toBe(qualitaet(a.schlafMinuten))
  })

  it('faellt ohne datenbank auf die kurve zurueck, ohne konfidenz zu behaupten', () => {
    const a = analysiereSchlafnacht(nacht({ nachtwert: null, scoreKonfidenz: null }))
    expect(a.qualitaet).toBe(qualitaet(a.schlafMinuten))
    expect(a.qualitaetKonfidenz).toBeNull()
  })

  it('behauptet keine konfidenz fuer einen geschaetzten wert', () => {
    // scoreKonfidenz gehoert zum gerechneten wert. ohne ihn ist sie bedeutungslos
    const a = analysiereSchlafnacht(nacht({ nachtwert: null, scoreKonfidenz: 100 }))
    expect(a.qualitaetKonfidenz).toBeNull()
  })

  it('rechnet fuer erijon und koray dieselbe nacht gleich', () => {
    const meins = analysiereSchlafnacht(nacht({ user: 'erijon' }))
    const seins = analysiereSchlafnacht(nacht({ user: 'koray' }))
    const ohnePerson = ({ user: _user, ...rest }: NachtPhasenAnalyse) => rest
    expect(ohnePerson(seins)).toEqual(ohnePerson(meins))
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

  it('laesst ein kurzes stadium wortlos im nachbarn aufgehen', () => {
    const a = analysiereSchlafnacht(
      nacht({
        bettStart: null,
        bettEnde: null,
        bettMinuten: null,
        phasen: [
          { art: 'kern', start: 0, dauer: 60 },
          { art: 'tief', start: 60, dauer: 3 },
          { art: 'kern', start: 63, dauer: 60 },
        ],
      })
    )
    const { linie, unruhen } = verlauf(a)

    // drei minuten tiefschlaf sind kein abschnitt der nacht: die beiden
    // kernstuecke werden eine linie, und einen strich gibt es nur fuer wach
    expect(linie.map((s) => s.art)).toEqual(['kern'])
    expect(linie[0]!.bis - linie[0]!.von).toBe(123)
    expect(unruhen).toHaveLength(0)
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

describe('eine sehr zerrissene nacht auf dem ganzen weg', () => {
  /**
   * Vom Rohsegment bis zum Pfad, an der Obergrenze der Datenbank von 300
   * Segmenten. Eine echte Nacht bringt rund sechzig — dieser Fall ist der
   * schlimmste, den ein Import ueberhaupt erzeugen kann.
   */
  const zerrisseneNacht = (anzahl: number): Schlafnacht => {
    const arten: PhasenArt[] = ['kern', 'tief', 'wach', 'rem']
    const phasen: Phase[] = []
    let t = 0
    for (let i = 0; i < anzahl; i++) {
      const dauer = i % 4 === 2 ? 1 + (i % 3) : 4 + (i % 7)
      phasen.push({ art: arten[i % 4]!, start: t, dauer })
      t += dauer
    }
    const start = '2026-08-25T21:00:00.000Z'
    return nacht({
      schlafMinuten: t - 40,
      einschlafzeit: start,
      aufwachzeit: new Date(Date.parse(start) + t * 60000).toISOString(),
      bettStart: null,
      bettEnde: null,
      bettMinuten: null,
      wachMinuten: 40,
      phasen,
    })
  }

  it('fasst kurze stuecke zusammen, statt jedes zu zeichnen', () => {
    const a = analysiereSchlafnacht(zerrisseneNacht(300))
    const { linie, unruhen } = verlauf(a)

    // was gezeichnet wird, ist weniger als das, was ankam
    expect(linie.length).toBeLessThan(300)
    // und kein stueck der linie ist kuerzer als die schwelle
    for (const s of linie) expect(s.bis - s.von).toBeGreaterThanOrEqual(PHASEN_SCHWELLE)
    // kurzes wachwerden bleibt als strich sichtbar, nicht als ausschlag
    expect(unruhen.length).toBeGreaterThan(0)
    for (const u of unruhen) expect(u.art).toBe('wach')
  })

  it('laesst keine zeit verschwinden und keine luecke entstehen', () => {
    const a = analysiereSchlafnacht(zerrisseneNacht(300))
    const { linie } = verlauf(a)

    // die linie spannt dieselbe zeit wie die nacht, ohne loch dazwischen
    expect(linie[0]!.von).toBeCloseTo(a.einschlafMinute, 6)
    expect(linie[linie.length - 1]!.bis).toBeCloseTo(a.aufwachMinute, 6)
    for (let i = 0; i < linie.length - 1; i++) {
      expect(linie[i + 1]!.von).toBeCloseTo(linie[i]!.bis, 6)
    }
  })

  it('rechnet den ganzen weg in wenigen millisekunden', () => {
    const n = zerrisseneNacht(300)
    const start = performance.now()
    for (let i = 0; i < 20; i++) verlauf(analysiereSchlafnacht(n))
    expect((performance.now() - start) / 20).toBeLessThan(50)
  })
})

