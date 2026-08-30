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
  tagesWert,
  tageseinheiten,
  wocheBereich,
} from './tracker'
import { weekDays } from './dates'
import type { Aufenthalt, Zustand } from './types'

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

  it('gibt es für lernen und lesen nicht', () => {
    const z = mit(besuch('2026-08-26', [18, 0], 60))
    expect(messung(z.aufenthalte, 'erijon', 'lernen', '2026-08-26')).toBeNull()
    expect(messung(z.aufenthalte, 'erijon', 'lesen', '2026-08-26')).toBeNull()
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

  it('unterscheidet nichts, wo es nichts zu messen gibt', () => {
    const z = setzeTick(leer, 'erijon', 'lernen', '2026-08-26', true)
    expect(quelle(z, 'erijon', 'lernen', '2026-08-26')).toBeNull()
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
