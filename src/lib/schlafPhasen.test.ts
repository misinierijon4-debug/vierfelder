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
  registrierteSchlafNutzer,
  stundenmarken,
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
    expect(a.stuecke).toEqual([{ art: 'unspez', start: 0, dauer: 493 }])
  })

  it('laesst die effizienz leer, wenn kein aufwachen gemessen wurde', () => {
    const a = analysiereSchlafnacht(nacht({ aufwachzeit: null, bettMinuten: null, bettEnde: null }))
    expect(a.effizienz).toBeNull()
    expect(a.inBedBasis).toBe('fenster')
    expect(a.aufwachUhrzeit).toBe('--:--')
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
