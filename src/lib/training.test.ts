import { describe, expect, it } from 'vitest'
import {
  MINDESTMINUTEN,
  MINDESTMINUTEN_LESEN,
  dauerMinuten,
  gemesseneMinuten,
  messung,
  messungen,
  gemessen,
  offeneMessungen,
  sitzungen,
  tageMitSitzung,
  tagVon,
  zaehlt,
} from './training'
import {
  anzahlEinheiten,
  baueEinheit,
  hatTageswert,
  fuegeEinheitHinzu,
  istGesetzt,
  hatMoeglicheDoppelerfassung,
  messungsLaufstatus,
  quelle,
  setzeTick,
  messungsMinuten,
  mitAufenthalt,
  tagesWert,
  tageseinheiten,
  tageMitDaten,
  wocheBereich,
} from './tracker'
import { weekDays } from './dates'
import type { AreaId, Aufenthalt, UserId, Zustand } from './types'

const MITTWOCH = new Date(2026, 7, 26, 12)
const leer: Zustand = { einheiten: {}, gewichte: {}, aufenthalte: [] }

/** ortszeit, damit der tag genauso fällt wie im browser der beiden */
function zeit(tag: string, stunde: number, minute: number): string {
  const [j, mo, t] = tag.split('-').map(Number)
  return new Date(j!, mo! - 1, t!, stunde, minute).toISOString()
}

function besuch(
  tag: string,
  von: [number, number],
  dauer: number | null,
  rest: Partial<Aufenthalt> = {}
): Aufenthalt {
  return {
    user: 'erijon',
    bereich: 'gym',
    ort: 'gym nord',
    ankunft: zeit(tag, von[0]!, von[1]!),
    abgang: dauer === null ? null : zeit(tag, von[0]!, von[1]! + dauer),
    ...rest,
  }
}

/** eine sitzung aus einem fokus: dieselbe messung, nur ohne ort */
function fokus(
  tag: string,
  bereich: AreaId,
  von: [number, number],
  dauer: number | null,
  rest: Partial<Aufenthalt> = {}
): Aufenthalt {
  return besuch(tag, von, dauer, { bereich, ort: `fokus ${bereich}`, ...rest })
}

function mit(...aufenthalte: Aufenthalt[]): Zustand {
  return { ...leer, aufenthalte }
}

describe('aufenthalt', () => {
  it('rechnet die dauer aus ankunft und abgang', () => {
    expect(dauerMinuten(besuch('2026-08-26', [18, 0], 74))).toBe(74)
  })

  it('hat keine dauer, solange der abgang fehlt', () => {
    const offen = besuch('2026-08-26', [18, 0], null)
    expect(dauerMinuten(offen)).toBeNull()
    expect(zaehlt(offen)).toBe(false)
  })

  it('zeigt offene Fokuslaeufe unter und ueber der Schwelle, ohne sie fertig zu zaehlen', () => {
    const offen = fokus('2026-08-26', 'lernen', [18, 0], null, { id: 'offen-a' })
    const duplikat = { ...offen, id: 'offen-b' }
    const z = mit(offen, duplikat)
    const start = new Date(offen.ankunft).getTime()

    expect(offeneMessungen(
      z.aufenthalte,
      'erijon',
      'lernen',
      new Date(start + (MINDESTMINUTEN - 1) * 60_000)
    )).toEqual([{
      art: 'laeuft',
      ankunft: offen.ankunft,
      mindestdauerErreicht: false,
    }])
    expect(messungsLaufstatus(
      z,
      'erijon',
      'lernen',
      new Date(start + (MINDESTMINUTEN + 1) * 60_000)
    )).toMatchObject({
      seit: offen.ankunft,
      laufend: 1,
      mindestdauerErreicht: true,
      warnungen: [],
    })

    const zweiteQuelle = fokus('2026-08-26', 'lernen', [18, 5], null, {
      id: 'offen-c', ort: 'standort lernen',
    })
    expect(messungsLaufstatus(
      mit(offen, duplikat, zweiteQuelle),
      'erijon',
      'lernen',
      new Date(start + (MINDESTMINUTEN - 1) * 60_000)
    )).toMatchObject({ seit: offen.ankunft, laufend: 2, warnungen: [] })

    expect(istGesetzt(z, 'erijon', 'lernen', '2026-08-26')).toBe(false)
    expect(quelle(z, 'erijon', 'lernen', '2026-08-26')).toBeNull()
    expect(tageseinheiten(z, 'erijon', 'lernen', '2026-08-26')).toEqual([])
    expect(anzahlEinheiten(z, 'erijon', 'lernen', '2026-08-26')).toBe(0)
    expect(messungsMinuten(z, 'erijon', 'lernen', '2026-08-26')).toBe(0)
    expect(wocheBereich(z, 'erijon', 'lernen', weekDays(MITTWOCH))).toBe(0)
  })

  it('warnt bei ungueltigen, zukuenftigen und verwaisten offenen Starts', () => {
    const jetzt = new Date(zeit('2026-08-26', 18, 0))
    const z = mit(
      fokus('2026-08-26', 'lernen', [18, 0], null, {
        id: 'ungueltig', ankunft: 'kein zeitpunkt', ort: 'fokus ungueltig',
      }),
      fokus('2026-08-26', 'lernen', [18, 1], null, {
        id: 'zukunft', ort: 'fokus zukunft',
      }),
      fokus('2026-08-26', 'lernen', [5, 59], null, {
        id: 'verwaist', ort: 'fokus verwaist',
      })
    )

    expect(offeneMessungen(z.aufenthalte, 'erijon', 'lernen', jetzt)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ art: 'warnung', grund: 'start_ungueltig' }),
        expect.objectContaining({ art: 'warnung', grund: 'start_in_zukunft' }),
        expect.objectContaining({ art: 'warnung', grund: 'verwaist' }),
      ])
    )
    expect(messungsLaufstatus(z, 'erijon', 'lernen', jetzt)).toMatchObject({
      seit: null,
      laufend: 0,
      warnungen: ['start_ungueltig', 'start_in_zukunft', 'verwaist'],
    })
  })

  it('zählt einen zu kurzen besuch nicht', () => {
    expect(zaehlt(besuch('2026-08-26', [18, 0], MINDESTMINUTEN - 1))).toBe(false)
    expect(zaehlt(besuch('2026-08-26', [18, 0], MINDESTMINUTEN))).toBe(true)
  })

  it('lässt beim lesen zehn minuten reichen', () => {
    const kurz = fokus('2026-08-26', 'lesen', [21, 40], MINDESTMINUTEN_LESEN - 1)
    const lang = fokus('2026-08-26', 'lesen', [21, 40], MINDESTMINUTEN_LESEN)
    expect(zaehlt(kurz)).toBe(false)
    expect(zaehlt(lang)).toBe(true)
    // dieselbe dauer beim lernen ist noch keine einheit
    expect(zaehlt(fokus('2026-08-26', 'lernen', [16, 0], MINDESTMINUTEN_LESEN))).toBe(false)
  })

  it('gehört zu dem tag, an dem er begonnen hat', () => {
    // rein um 23:40, raus um 00:40 — das war das training am mittwoch
    expect(tagVon(besuch('2026-08-26', [23, 40], 60))).toBe('2026-08-26')
    expect(zaehlt(besuch('2026-08-26', [23, 40], 60))).toBe(true)
  })

  it('zählt am sonntag nur, was vor montag 0 uhr zu ende war', () => {
    // koray: sonntag 23:45 bis montag 00:20 — beim wochenschluss noch offen
    const ueberMitternacht = fokus('2026-09-20', 'boxen', [23, 45], 35, { user: 'koray' })
    expect(tagVon(ueberMitternacht)).toBe('2026-09-20')
    expect(zaehlt(ueberMitternacht)).toBe(false)
    expect(messung([ueberMitternacht], 'koray', 'boxen', '2026-09-20')).toBeNull()
    // sichtbar bleibt sie trotzdem, wie eine zu kurze
    expect(sitzungen([ueberMitternacht], 'koray', 'boxen', '2026-09-20')).toHaveLength(1)
    // 23:59 fertig zählt noch, genau 0 uhr schon nicht mehr
    expect(zaehlt(fokus('2026-09-20', 'boxen', [23, 29], 30))).toBe(true)
    expect(zaehlt(fokus('2026-09-20', 'boxen', [23, 30], 30))).toBe(false)
  })

  it('nimmt bei zwei besuchen am tag den längeren', () => {
    const z = mit(besuch('2026-08-26', [7, 0], 35), besuch('2026-08-26', [18, 0], 80))
    expect(gemesseneMinuten(z.aufenthalte, 'erijon', 'gym', '2026-08-26')).toBe(80)
    // trotzdem ein tick, kein zweiter
    expect(wocheBereich(z, 'erijon', 'gym', weekDays(MITTWOCH))).toBe(1)
  })

  it('trennt personen, bereiche und tage', () => {
    const z = mit(
      besuch('2026-08-26', [18, 0], 60),
      besuch('2026-08-25', [19, 0], 90, { bereich: 'boxen', ort: 'boxhalle' }),
      besuch('2026-08-26', [7, 0], 50, { user: 'koray', ort: 'gym sued' })
    )
    expect(messung(z.aufenthalte, 'erijon', 'gym', '2026-08-26')).not.toBeNull()
    expect(messung(z.aufenthalte, 'erijon', 'gym', '2026-08-25')).toBeNull()
    expect(messung(z.aufenthalte, 'koray', 'gym', '2026-08-26')).not.toBeNull()
    expect(messung(z.aufenthalte, 'erijon', 'boxen', '2026-08-25')).not.toBeNull()
    expect(messung(z.aufenthalte, 'koray', 'boxen', '2026-08-25')).toBeNull()
  })

  it('gibt es auch für lernen und lesen, wenn ein fokus lief', () => {
    const z = mit(fokus('2026-08-26', 'lernen', [16, 10], 95))
    expect(messung(z.aufenthalte, 'erijon', 'lernen', '2026-08-26')).not.toBeNull()
    // der fokus lernen belegt lernen und sonst nichts
    expect(messung(z.aufenthalte, 'erijon', 'lesen', '2026-08-26')).toBeNull()
    expect(messung(z.aufenthalte, 'erijon', 'gym', '2026-08-26')).toBeNull()
  })

  it('zählt standort und fokus für dieselbe stunde nur einmal', () => {
    // im gym den fokus eingeschaltet, während die standort-automation lief:
    // ein training, nicht zwei. die längere der beiden sitzungen bleibt.
    const z = mit(
      besuch('2026-08-26', [18, 0], 74),
      fokus('2026-08-26', 'gym', [18, 10], 55)
    )
    expect(messungen(z.aufenthalte, 'erijon', 'gym', '2026-08-26')).toHaveLength(1)
    expect(gemesseneMinuten(z.aufenthalte, 'erijon', 'gym', '2026-08-26')).toBe(74)
  })
})

describe('tick aus der messung', () => {
  it('setzt den tick ohne antippen', () => {
    const z = mit(besuch('2026-08-26', [18, 0], 60))
    expect(istGesetzt(z, 'erijon', 'gym', '2026-08-26')).toBe(true)
    expect(quelle(z, 'erijon', 'gym', '2026-08-26')).toBe('gemessen')
  })

  it('setzt ihn nicht, wenn der besuch zu kurz war', () => {
    const z = mit(besuch('2026-08-26', [18, 0], 5))
    expect(istGesetzt(z, 'erijon', 'gym', '2026-08-26')).toBe(false)
    expect(quelle(z, 'erijon', 'gym', '2026-08-26')).toBeNull()
  })

  it('zeigt eine kurze fokusmessung mit dauer, gibt dafuer aber keinen punkt', () => {
    const z = mit(fokus('2026-08-26', 'lernen', [16, 10], 12))

    expect(sitzungen(z.aufenthalte, 'erijon', 'lernen', '2026-08-26')).toHaveLength(1)
    expect(messungen(z.aufenthalte, 'erijon', 'lernen', '2026-08-26')).toHaveLength(0)
    expect(messungsMinuten(z, 'erijon', 'lernen', '2026-08-26')).toBe(12)
    expect(tageseinheiten(z, 'erijon', 'lernen', '2026-08-26')[0]).toMatchObject({
      wert: 12,
      herkunft: 'gemessen',
      zaehlt: false,
    })
    expect(istGesetzt(z, 'erijon', 'lernen', '2026-08-26')).toBe(false)
    expect(wocheBereich(z, 'erijon', 'lernen', weekDays(MITTWOCH))).toBe(0)
    expect(messungsLaufstatus(z, 'erijon', 'lernen', MITTWOCH)).toBeNull()
  })

  it('nennt einen antippten tick getippt', () => {
    const z = setzeTick(leer, 'erijon', 'boxen', '2026-08-26', true)
    expect(istGesetzt(z, 'erijon', 'boxen', '2026-08-26')).toBe(true)
    expect(quelle(z, 'erijon', 'boxen', '2026-08-26')).toBe('getippt')
  })

  it('nennt den Tag gemischt, wenn neben der Messung ein eigener Wert steht', () => {
    const z = fuegeEinheitHinzu(
      mit(besuch('2026-08-26', [18, 0], 60)),
      baueEinheit('erijon', 'gym', '2026-08-26', 30)
    )
    expect(quelle(z, 'erijon', 'gym', '2026-08-26')).toBe('gemischt')
    expect(anzahlEinheiten(z, 'erijon', 'gym', '2026-08-26')).toBe(2)
    expect(wocheBereich(z, 'erijon', 'gym', weekDays(MITTWOCH))).toBe(1)
  })

  it('zaehlt den blossen haken neben einer messung nicht als zweite einheit', () => {
    const z = setzeTick(mit(besuch('2026-08-26', [18, 0], 60)), 'erijon', 'gym', '2026-08-26', true)

    expect(quelle(z, 'erijon', 'gym', '2026-08-26')).toBe('gemessen')
    expect(anzahlEinheiten(z, 'erijon', 'gym', '2026-08-26')).toBe(1)
    expect(wocheBereich(z, 'erijon', 'gym', weekDays(MITTWOCH))).toBe(1)

    const liste = tageseinheiten(z, 'erijon', 'gym', '2026-08-26')
    expect(liste).toHaveLength(2)
    expect(liste.filter((e) => e.gedeckt)).toHaveLength(1)
  })

  it('deckt auch einen auf null heruntergezaehlten lesehaken neben dem fokus', () => {
    const z = fuegeEinheitHinzu(
      mit(fokus('2026-08-26', 'lesen', [9, 51], 32)),
      baueEinheit('erijon', 'lesen', '2026-08-26', 0)
    )

    expect(quelle(z, 'erijon', 'lesen', '2026-08-26')).toBe('gemessen')
    expect(anzahlEinheiten(z, 'erijon', 'lesen', '2026-08-26')).toBe(1)
    expect(hatTageswert(z, 'erijon', 'lesen', '2026-08-26')).toBe(false)
    expect(messungsMinuten(z, 'erijon', 'lesen', '2026-08-26')).toBe(32)
  })

  it('laesst einen haken fuer sich stehen, solange die messung zu kurz ist', () => {
    const z = setzeTick(mit(fokus('2026-08-26', 'lesen', [9, 51], 4)), 'erijon', 'lesen', '2026-08-26', true)

    expect(quelle(z, 'erijon', 'lesen', '2026-08-26')).toBe('getippt')
    expect(anzahlEinheiten(z, 'erijon', 'lesen', '2026-08-26')).toBe(2)
  })

  it('haelt einen haken mit eigener uhrzeit neben der messung getrennt', () => {
    const z = fuegeEinheitHinzu(
      mit(besuch('2026-08-26', [18, 0], 60)),
      baueEinheit('erijon', 'gym', '2026-08-26', null, MITTWOCH, zeit('2026-08-26', 7, 0))
    )

    expect(quelle(z, 'erijon', 'gym', '2026-08-26')).toBe('gemischt')
    expect(anzahlEinheiten(z, 'erijon', 'gym', '2026-08-26')).toBe(2)
  })

  it('nennt einen antippten lerntag getippt, seit es den fokus gibt', () => {
    const z = setzeTick(leer, 'erijon', 'lernen', '2026-08-26', true)
    expect(quelle(z, 'erijon', 'lernen', '2026-08-26')).toBe('getippt')
  })

  it('setzt lernen aus dem fokus, ohne antippen', () => {
    const z = mit(fokus('2026-08-26', 'lernen', [16, 10], 95))
    expect(istGesetzt(z, 'erijon', 'lernen', '2026-08-26')).toBe(true)
    expect(quelle(z, 'erijon', 'lernen', '2026-08-26')).toBe('gemessen')
  })

  it('nennt eine eingetippte gewichtszahl getippt', () => {
    const z: Zustand = { ...leer, gewichte: { 'erijon|2026-08-26': 81.4 } }
    expect(quelle(z, 'erijon', 'gewicht', '2026-08-26')).toBe('getippt')
  })

  it('nennt das gewicht nur gemessen, wenn die waage es geschrieben hat', () => {
    const z: Zustand = {
      ...leer,
      gewichte: { 'erijon|2026-08-26': 81.4 },
      gewichtQuellen: { 'erijon|2026-08-26': 'gemessen' },
    }
    expect(quelle(z, 'erijon', 'gewicht', '2026-08-26')).toBe('gemessen')
  })
})

describe('mehrere besuche an einem tag', () => {
  it('sind zwei einheiten und trotzdem ein tick', () => {
    const z = mit(besuch('2026-08-26', [7, 0], 65), besuch('2026-08-26', [18, 30], 28))

    expect(messungen(z.aufenthalte, 'erijon', 'gym', '2026-08-26')).toHaveLength(2)
    expect(anzahlEinheiten(z, 'erijon', 'gym', '2026-08-26')).toBe(2)
    expect(tagesWert(z, 'erijon', 'gym', '2026-08-26')).toBe(93)
    expect(wocheBereich(z, 'erijon', 'gym', weekDays(MITTWOCH))).toBe(1)
  })

  it('zeigt eine zu kurze stippvisite, markiert sie aber als nicht zählend', () => {
    const z = mit(besuch('2026-08-26', [7, 0], 65), besuch('2026-08-26', [18, 30], 5))
    const liste = tageseinheiten(z, 'erijon', 'gym', '2026-08-26')
    expect(anzahlEinheiten(z, 'erijon', 'gym', '2026-08-26')).toBe(2)
    expect(liste.map((e) => e.zaehlt)).toEqual([true, false])
  })

  it('mischt gemessene und getippte einheiten nach uhrzeit', () => {
    const gemessenerBesuch = besuch('2026-08-26', [18, 30], 28)
    let z = mit(gemessenerBesuch)
    z = fuegeEinheitHinzu(
      z,
      baueEinheit('erijon', 'gym', '2026-08-26', 65, new Date(2026, 7, 26, 7, 0))
    )

    const liste = tageseinheiten(z, 'erijon', 'gym', '2026-08-26')
    expect(liste.map((e) => e.herkunft)).toEqual(['getippt', 'gemessen'])
    expect(liste.map((e) => e.wert)).toEqual([65, 28])
  })

  it('warnt nur bei einer belegbaren zeitlichen Ueberschneidung', () => {
    let z = mit(besuch('2026-08-26', [18, 0], 60))
    z = fuegeEinheitHinzu(
      z,
      baueEinheit(
        'erijon',
        'gym',
        '2026-08-26',
        30,
        new Date('2026-08-26T20:00:00Z'),
        zeit('2026-08-26', 18, 30)
      )
    )

    expect(hatMoeglicheDoppelerfassung(z, 'erijon', 'gym', '2026-08-26')).toBe(true)
  })

  it('behauptet ohne Durchfuehrungszeit oder bei nur beruehrenden Intervallen keine Doppelerfassung', () => {
    let ohneZeit = mit(besuch('2026-08-26', [18, 0], 60))
    ohneZeit = fuegeEinheitHinzu(
      ohneZeit,
      baueEinheit(
        'erijon',
        'gym',
        '2026-08-26',
        30,
        new Date(zeit('2026-08-26', 18, 30))
      )
    )
    expect(hatMoeglicheDoppelerfassung(ohneZeit, 'erijon', 'gym', '2026-08-26')).toBe(false)

    let danach = mit(besuch('2026-08-26', [18, 0], 60))
    danach = fuegeEinheitHinzu(
      danach,
      baueEinheit(
        'erijon',
        'gym',
        '2026-08-26',
        30,
        new Date('2026-08-26T20:00:00Z'),
        zeit('2026-08-26', 19, 0)
      )
    )
    expect(hatMoeglicheDoppelerfassung(danach, 'erijon', 'gym', '2026-08-26')).toBe(false)
  })

  it('vergleicht Leseseiten nicht mit gemessenen Fokusminuten', () => {
    let z = mit(fokus('2026-08-26', 'lesen', [18, 0], 60))
    z = fuegeEinheitHinzu(
      z,
      baueEinheit(
        'erijon',
        'lesen',
        '2026-08-26',
        30,
        new Date('2026-08-26T20:00:00Z'),
        zeit('2026-08-26', 18, 30)
      )
    )

    expect(hatMoeglicheDoppelerfassung(z, 'erijon', 'lesen', '2026-08-26')).toBe(false)
  })
})

describe('lesen: gemessen in minuten, gezählt in seiten', () => {
  it('lässt die minuten aus der seitensumme heraus', () => {
    let z = mit(fokus('2026-08-26', 'lesen', [21, 40], 35))
    z = fuegeEinheitHinzu(
      z,
      baueEinheit('erijon', 'lesen', '2026-08-26', 24, new Date(2026, 7, 26, 22, 20))
    )

    // 24 seiten sind der wert des bereichs, 35 minuten sind der beleg
    expect(tagesWert(z, 'erijon', 'lesen', '2026-08-26')).toBe(24)
    expect(messungsMinuten(z, 'erijon', 'lesen', '2026-08-26')).toBe(35)

    const liste = tageseinheiten(z, 'erijon', 'lesen', '2026-08-26')
    expect(liste.map((e) => e.einheit)).toEqual(['min', 'seiten'])
  })

  it('setzt den tick auch ohne eine einzige seite', () => {
    const z = mit(fokus('2026-08-26', 'lesen', [21, 40], 35))
    expect(istGesetzt(z, 'erijon', 'lesen', '2026-08-26')).toBe(true)
    expect(tagesWert(z, 'erijon', 'lesen', '2026-08-26')).toBe(0)
    // 0 seiten wären eine behauptung: gezählt wurde nie, gemessen schon
    expect(hatTageswert(z, 'erijon', 'lesen', '2026-08-26')).toBe(false)
    expect(messungsMinuten(z, 'erijon', 'lesen', '2026-08-26')).toBe(35)
  })

  it('nennt die gemessenen minuten beim gym einen tageswert', () => {
    const z = mit(besuch('2026-08-26', [18, 0], 74))
    expect(hatTageswert(z, 'erijon', 'gym', '2026-08-26')).toBe(true)
  })

  it('rechnet beim gym weiter alles in minuten', () => {
    let z = mit(besuch('2026-08-26', [18, 0], 74))
    z = fuegeEinheitHinzu(
      z,
      baueEinheit('erijon', 'gym', '2026-08-26', 30, new Date(2026, 7, 26, 7, 0))
    )
    expect(tagesWert(z, 'erijon', 'gym', '2026-08-26')).toBe(104)
    expect(messungsMinuten(z, 'erijon', 'gym', '2026-08-26')).toBe(74)
  })
})

/**
 * die rechnung ohne index, wie sie bis september stand: je frage einmal durch
 * alle aufenthalte. sie ist hier das mass, an dem sich der index messen muss.
 */
function sitzungenOhneIndex(alle: Aufenthalt[], u: UserId, f: AreaId, tag: string): Aufenthalt[] {
  const sortiert = alle
    .filter((a) => a.user === u && a.bereich === f && dauerMinuten(a) !== null && tagVon(a) === tag)
    .sort((x, y) => (x.ankunft < y.ankunft ? -1 : x.ankunft > y.ankunft ? 1 : 0))
  const behalten: Aufenthalt[] = []
  for (const a of sortiert) {
    const letzte = behalten[behalten.length - 1]
    if (letzte && new Date(a.ankunft).getTime() < new Date(letzte.abgang!).getTime()) {
      if (dauerMinuten(a)! > dauerMinuten(letzte)!) behalten[behalten.length - 1] = a
      continue
    }
    behalten.push(a)
  }
  return behalten
}

describe('sitzungsindex', () => {
  const TAGE = ['2026-08-25', '2026-08-26', '2026-08-27']
  const USERS: UserId[] = ['erijon', 'koray']
  const BEREICHE: AreaId[] = ['lernen', 'gym', 'boxen', 'lesen']

  /** viele sitzungen mit allem, was schiefgehen kann: offen, verdreht, doppelt, über mitternacht */
  function bestand(): Aufenthalt[] {
    let saat = 7
    const zufall = () => {
      saat = (saat * 1103515245 + 12345) % 2147483648
      return saat / 2147483648
    }
    const alle: Aufenthalt[] = []
    for (let i = 0; i < 400; i++) {
      const tag = TAGE[Math.floor(zufall() * TAGE.length)]!
      const stunde = Math.floor(zufall() * 24)
      const minute = Math.floor(zufall() * 4) * 15
      const art = zufall()
      const dauer = art < 0.1 ? null : art < 0.15 ? -20 : Math.floor(zufall() * 120)
      alle.push({
        id: `s${i}`,
        user: USERS[Math.floor(zufall() * USERS.length)]!,
        bereich: BEREICHE[Math.floor(zufall() * BEREICHE.length)]!,
        ort: `ort ${i}`,
        ankunft: zeit(tag, stunde, minute),
        abgang: dauer === null ? null : zeit(tag, stunde, minute + dauer),
      })
    }
    return alle
  }

  it('findet dieselben sitzungen, messungen und dieselbe messung wie die suche durch alle', () => {
    const alle = bestand()
    for (const u of USERS) {
      for (const f of BEREICHE) {
        for (const tag of ['2026-08-24', ...TAGE, '2026-08-28']) {
          const erwartet = sitzungenOhneIndex(alle, u, f, tag)
          const gefunden = sitzungen(alle, u, f, tag)
          expect(gefunden).toHaveLength(erwartet.length)
          gefunden.forEach((a, i) => expect(a).toBe(erwartet[i]))

          const zaehlende = erwartet.filter(zaehlt)
          const gezaehlt = messungen(alle, u, f, tag)
          expect(gezaehlt).toHaveLength(zaehlende.length)
          gezaehlt.forEach((a, i) => expect(a).toBe(zaehlende[i]))

          const laengste = zaehlende.reduce<Aufenthalt | null>(
            (beste, a) => (beste === null || dauerMinuten(a)! > dauerMinuten(beste)! ? a : beste),
            null
          )
          expect(messung(alle, u, f, tag)).toBe(laengste)
        }
      }
    }
  })

  it('liest eine liste neu, die an ort und stelle gewachsen ist', () => {
    const liste = [besuch('2026-08-26', [7, 0], 60)]
    expect(messungen(liste, 'erijon', 'gym', '2026-08-26')).toHaveLength(1)

    liste.push(besuch('2026-08-26', [18, 0], 45))
    expect(messungen(liste, 'erijon', 'gym', '2026-08-26')).toHaveLength(2)
  })

  it('rechnet eine neue liste neu und laesst der alten ihren stand', () => {
    const alt = [besuch('2026-08-26', [7, 0], 60, { id: 'a' })]
    // die automation kürzt die sitzung nachträglich unter die schwelle
    const neu = mitAufenthalt(alt, { ...alt[0]!, abgang: zeit('2026-08-26', 7, 10) })

    expect(gemessen(alt, 'erijon', 'gym', '2026-08-26')).toBe(true)
    expect(gemessen(neu, 'erijon', 'gym', '2026-08-26')).toBe(false)
    expect(gemessen(alt, 'erijon', 'gym', '2026-08-26')).toBe(true)
  })

  it('merkt sich den tag einer sitzung nur, solange ihre ankunft gleich bleibt', () => {
    const a = besuch('2026-08-26', [23, 40], 50)
    expect(tagVon(a)).toBe('2026-08-26')
    a.ankunft = zeit('2026-08-27', 0, 10)
    expect(tagVon(a)).toBe('2026-08-27')
  })

  it('gibt kopien heraus, damit kein aufrufer den index veraendert', () => {
    const liste = [besuch('2026-08-26', [7, 0], 60)]
    sitzungen(liste, 'erijon', 'gym', '2026-08-26').pop()
    messungen(liste, 'erijon', 'gym', '2026-08-26').pop()

    expect(sitzungen(liste, 'erijon', 'gym', '2026-08-26')).toHaveLength(1)
    expect(messungen(liste, 'erijon', 'gym', '2026-08-26')).toHaveLength(1)
  })

  it('kennt je person die tage mit abgeschlossener sitzung, auch unter der schwelle', () => {
    const liste = [
      besuch('2026-08-25', [7, 0], 60),
      besuch('2026-08-25', [18, 0], 60, { bereich: 'boxen' }),
      // zu kurz für einen punkt, aber eine abgeschlossene sitzung
      fokus('2026-08-26', 'lernen', [9, 0], 5),
      // läuft noch: kein tag mit daten
      besuch('2026-08-27', [7, 0], null),
      besuch('2026-08-27', [8, 0], 60, { user: 'koray' }),
    ]

    expect(tageMitSitzung(liste, 'erijon').sort()).toEqual(['2026-08-25', '2026-08-25', '2026-08-26'])
    expect(tageMitDaten(mit(...liste), 'erijon')).toEqual(['2026-08-25', '2026-08-26'])
    expect(tageMitDaten(mit(...liste), 'koray')).toEqual(['2026-08-27'])
  })
})
