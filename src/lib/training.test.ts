import { describe, expect, it } from 'vitest'
import {
  MINDESTMINUTEN,
  dauerMinuten,
  gemesseneMinuten,
  messung,
  messungen,
  tagVon,
  zaehlt,
} from './training'
import {
  anzahlEinheiten,
  baueEinheit,
  fuegeEinheitHinzu,
  istGesetzt,
  quelle,
  setzeTick,
  messungsMinuten,
  tagesWert,
  tageseinheiten,
  wocheBereich,
} from './tracker'
import { weekDays } from './dates'
import type { AreaId, Aufenthalt, Zustand } from './types'

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
  dauer: number,
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

  it('zählt einen zu kurzen besuch nicht', () => {
    expect(zaehlt(besuch('2026-08-26', [18, 0], MINDESTMINUTEN - 1))).toBe(false)
    expect(zaehlt(besuch('2026-08-26', [18, 0], MINDESTMINUTEN))).toBe(true)
  })

  it('gehört zu dem tag, an dem er begonnen hat', () => {
    // rein um 23:40, raus um 00:40 — das war das training am mittwoch
    expect(tagVon(besuch('2026-08-26', [23, 40], 60))).toBe('2026-08-26')
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

  it('nennt einen antippten tick getippt', () => {
    const z = setzeTick(leer, 'erijon', 'boxen', '2026-08-26', true)
    expect(istGesetzt(z, 'erijon', 'boxen', '2026-08-26')).toBe(true)
    expect(quelle(z, 'erijon', 'boxen', '2026-08-26')).toBe('getippt')
  })

  it('lässt die messung gewinnen, wenn beides da ist', () => {
    const z = setzeTick(mit(besuch('2026-08-26', [18, 0], 60)), 'erijon', 'gym', '2026-08-26', true)
    expect(quelle(z, 'erijon', 'gym', '2026-08-26')).toBe('gemessen')
    expect(wocheBereich(z, 'erijon', 'gym', weekDays(MITTWOCH))).toBe(1)
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

  it('nennt das gewicht gemessen', () => {
    const z: Zustand = { ...leer, gewichte: { 'erijon|2026-08-26': 81.4 } }
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

  it('zählt eine zu kurze stippvisite nicht als einheit', () => {
    const z = mit(besuch('2026-08-26', [7, 0], 65), besuch('2026-08-26', [18, 30], 5))
    expect(anzahlEinheiten(z, 'erijon', 'gym', '2026-08-26')).toBe(1)
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
