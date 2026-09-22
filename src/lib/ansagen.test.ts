import { describe, expect, it } from 'vitest'
import {
  ANSAGEN_JE_WOCHE,
  ansagePunkte,
  ansageStand,
  pruefeAnsage,
  verbleibendeAnsagen,
  wochenAnsagePunkte,
} from './ansagen'
import type { Ansage, AnsageEntwurf } from './ansagen'
import { setzeTick } from './tracker'
import type { Zustand } from './types'

// dienstag, 22.09.2026 mittags. die woche läuft von mo 21.09. bis so 27.09.
const DIENSTAG = new Date(2026, 8, 22, 12)

function leererZustand(): Zustand {
  return { einheiten: {}, gewichte: {}, aufenthalte: [] }
}

function entwurf(rest: Partial<AnsageEntwurf> = {}): AnsageEntwurf {
  return {
    von: 'erijon',
    an: 'koray',
    bereich: 'lesen',
    ab: '2026-09-23',
    bis: '2026-09-24',
    mindestTage: 1,
    nurGemessen: false,
    einsatz: false,
    ...rest,
  }
}

function ansage(rest: Partial<Ansage> = {}): Ansage {
  return { id: 'a1', erstelltAm: DIENSTAG.toISOString(), ...entwurf(), ...rest }
}

function gemessen(z: Zustand, tag: string): Zustand {
  return {
    ...z,
    aufenthalte: [
      ...z.aufenthalte,
      {
        user: 'koray',
        bereich: 'lesen',
        ort: 'fokus',
        ankunft: `${tag}T18:00:00+02:00`,
        abgang: `${tag}T18:30:00+02:00`,
      },
    ],
  }
}

describe('ansageStand', () => {
  it('läuft, solange noch tage offen sind', () => {
    const stand = ansageStand(leererZustand(), ansage(), new Date(2026, 8, 23, 9))
    expect(stand).toEqual({ status: 'laeuft', erreicht: 0, mindestTage: 1, offeneTage: 2 })
  })

  it('ist geschafft, sobald der letzte nötige tag erledigt ist', () => {
    const z = setzeTick(leererZustand(), 'koray', 'lesen', '2026-09-23', true)
    expect(ansageStand(z, ansage(), new Date(2026, 8, 23, 20)).status).toBe('geschafft')
  })

  it('ist verfehlt, sobald die übrigen tage nicht mehr reichen', () => {
    const a = ansage({ mindestTage: 2 })
    // am ersten tag nichts, der zweite läuft noch: zwei sind nicht mehr drin
    expect(ansageStand(leererZustand(), a, new Date(2026, 8, 24, 9)).status).toBe('verfehlt')
  })

  it('zählt heute noch als möglich', () => {
    expect(ansageStand(leererZustand(), ansage(), new Date(2026, 8, 24, 23)).status).toBe('laeuft')
    expect(ansageStand(leererZustand(), ansage(), new Date(2026, 8, 25, 0, 1)).status).toBe(
      'verfehlt'
    )
  })

  it('lässt mit beweispflicht nur gemessene tage zählen', () => {
    const a = ansage({ nurGemessen: true })
    const getippt = setzeTick(leererZustand(), 'koray', 'lesen', '2026-09-23', true)
    expect(ansageStand(getippt, a, new Date(2026, 8, 25)).status).toBe('verfehlt')
    expect(ansageStand(gemessen(getippt, '2026-09-24'), a, new Date(2026, 8, 25)).status).toBe(
      'geschafft'
    )
  })

  it('zählt nur die herausgeforderte person und nur den bereich', () => {
    let z = setzeTick(leererZustand(), 'erijon', 'lesen', '2026-09-23', true)
    z = setzeTick(z, 'koray', 'gym', '2026-09-23', true)
    expect(ansageStand(z, ansage(), new Date(2026, 8, 25)).status).toBe('verfehlt')
  })
})

describe('ansagePunkte', () => {
  it('gibt beim schaffen der herausgeforderten person einen punkt', () => {
    expect(ansagePunkte('geschafft', ansage({ einsatz: true }))).toEqual({ erijon: 0, koray: 1 })
  })

  it('gibt beim verfehlen der herausfordernden person einen punkt', () => {
    expect(ansagePunkte('verfehlt', ansage())).toEqual({ erijon: 1, koray: 0 })
  })

  it('zieht mit einsatz der anderen person einen punkt ab', () => {
    expect(ansagePunkte('verfehlt', ansage({ einsatz: true }))).toEqual({ erijon: 1, koray: -1 })
  })

  it('bringt nichts, solange die ansage läuft', () => {
    expect(ansagePunkte('laeuft', ansage({ einsatz: true }))).toEqual({ erijon: 0, koray: 0 })
  })
})

describe('wochenAnsagePunkte', () => {
  it('summiert die entschiedenen ansagen der woche', () => {
    const z = setzeTick(leererZustand(), 'erijon', 'gym', '2026-09-23', true)
    const ansagen = [
      ansage({ id: 'a', einsatz: true }),
      ansage({ id: 'b', von: 'koray', an: 'erijon', bereich: 'gym' }),
      ansage({ id: 'c', ab: '2026-09-28', bis: '2026-09-29' }),
    ]
    expect(wochenAnsagePunkte(z, ansagen, '2026-09-21', new Date(2026, 8, 26))).toEqual({
      erijon: 2,
      koray: -1,
    })
  })
})

describe('verbleibendeAnsagen', () => {
  it('zählt nur die eigenen ansagen der laufenden woche', () => {
    const ansagen = [
      ansage({ id: 'a' }),
      ansage({ id: 'b', von: 'koray', an: 'erijon' }),
      ansage({ id: 'c', erstelltAm: new Date(2026, 8, 14, 12).toISOString() }),
    ]
    expect(verbleibendeAnsagen(ansagen, 'erijon', DIENSTAG)).toBe(ANSAGEN_JE_WOCHE - 1)
    expect(verbleibendeAnsagen([], 'erijon', DIENSTAG)).toBe(ANSAGEN_JE_WOCHE)
  })
})

describe('pruefeAnsage', () => {
  const z = leererZustand()

  it('lässt eine gültige ansage durch', () => {
    expect(pruefeAnsage(z, [], entwurf(), DIENSTAG)).toBeNull()
  })

  it('verbietet ansagen an sich selbst', () => {
    expect(pruefeAnsage(z, [], entwurf({ an: 'erijon' }), DIENSTAG)).toBe('selbst')
  })

  it('verbietet mehr ansagen als das kontingent', () => {
    const ansagen = Array.from({ length: ANSAGEN_JE_WOCHE }, (_, i) =>
      ansage({ id: `a${i}`, bereich: i % 2 ? 'gym' : 'boxen' })
    )
    expect(pruefeAnsage(z, ansagen, entwurf(), DIENSTAG)).toBe('keineAnsagenMehr')
  })

  it('beginnt frühestens morgen', () => {
    expect(pruefeAnsage(z, [], entwurf({ ab: '2026-09-22' }), DIENSTAG)).toBe('zuFrueh')
  })

  it('bleibt in derselben woche', () => {
    expect(pruefeAnsage(z, [], entwurf({ bis: '2026-09-28' }), DIENSTAG)).toBe('andereWoche')
  })

  it('verlangt einen zeitraum mit mindestens einem tag', () => {
    expect(pruefeAnsage(z, [], entwurf({ bis: '2026-09-22' }), DIENSTAG)).toBe('zeitraum')
  })

  it('verlangt nicht mehr tage, als der zeitraum hat', () => {
    expect(pruefeAnsage(z, [], entwurf({ mindestTage: 3 }), DIENSTAG)).toBe('mindestTage')
    expect(pruefeAnsage(z, [], entwurf({ mindestTage: 0 }), DIENSTAG)).toBe('mindestTage')
  })

  it('erlaubt je person und bereich nur eine laufende ansage', () => {
    const laufend = [ansage()]
    expect(pruefeAnsage(z, laufend, entwurf(), DIENSTAG)).toBe('schonOffen')
    expect(pruefeAnsage(z, laufend, entwurf({ bereich: 'gym' }), DIENSTAG)).toBeNull()
  })
})
