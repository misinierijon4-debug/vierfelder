import { describe, expect, it } from 'vitest'
import { phasenLadezustand } from './schlafLaden'
import type { Schlafnacht } from './types'

function nacht(phasen: Schlafnacht['phasen']): Schlafnacht {
  return {
    user: 'erijon',
    nacht: '2026-09-03',
    schlafMinuten: 480,
    einschlafzeit: '2026-09-02T21:30:00.000Z',
    aufwachzeit: '2026-09-03T05:30:00.000Z',
    bettStart: null,
    bettEnde: null,
    bettMinuten: null,
    tiefMinuten: 60,
    remMinuten: 90,
    kernMinuten: 330,
    unspezMinuten: 0,
    wachMinuten: 0,
    zielMinuten: 480,
    phasen,
    nachtwert: 80,
    scoreKonfidenz: 100,
  }
}

describe('Phasen-Ladezustand', () => {
  it('unterscheidet idle, loading und error solange noch nichts geladen ist', () => {
    const offen = nacht(null)
    expect(phasenLadezustand(offen)).toEqual({ status: 'idle' })
    expect(phasenLadezustand(offen, { status: 'loading' })).toEqual({ status: 'loading' })
    expect(phasenLadezustand(offen, { status: 'error', text: 'fehlgeschlagen' })).toEqual({
      status: 'error',
      text: 'fehlgeschlagen',
    })
  })

  it('unterscheidet erfolgreichen Leerzustand und geladenen Verlauf', () => {
    expect(phasenLadezustand(nacht([]))).toEqual({ status: 'empty' })
    expect(
      phasenLadezustand(nacht([{ art: 'kern', start: 0, dauer: 480 }]))
    ).toEqual({ status: 'loaded' })
  })

  it('laesst geladene Fachdaten einen veralteten Transportstatus ueberstimmen', () => {
    expect(phasenLadezustand(nacht([]), { status: 'loading' })).toEqual({ status: 'empty' })
    expect(
      phasenLadezustand(
        nacht([{ art: 'rem', start: 0, dauer: 30 }]),
        { status: 'error', text: 'alt' }
      )
    ).toEqual({ status: 'loaded' })
  })
})
