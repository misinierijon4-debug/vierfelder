import { beforeEach, describe, expect, it } from 'vitest'
import { lokalesBackend } from './lokal'
import { tickKey } from './types'

/** localStorage gibt es im knoten nicht, und mehr als das braucht der prototyp nicht */
class Speicher {
  private daten = new Map<string, string>()
  getItem(k: string) {
    return this.daten.get(k) ?? null
  }
  setItem(k: string, v: string) {
    this.daten.set(k, v)
  }
  removeItem(k: string) {
    this.daten.delete(k)
  }
  clear() {
    this.daten.clear()
  }
}

const speicher = new Speicher()
;(globalThis as { localStorage?: unknown }).localStorage = speicher

describe('altbestand aus dem alten format', () => {
  beforeEach(() => {
    speicher.clear()
  })

  it('übernimmt ticks und werte verlustfrei in einheiten', async () => {
    speicher.setItem(
      'vierfelder.ticks.v2',
      JSON.stringify({
        'erijon|gym|2026-08-26': true,
        'erijon|lesen|2026-08-25': true,
        'koray|boxen|2026-08-26': true,
      })
    )
    speicher.setItem(
      'vierfelder.werte.v2',
      JSON.stringify({ erijon: { 'gym|2026-08-26': 93 }, koray: { 'boxen|2026-08-26': 40 } })
    )

    const { einheiten, einheitVonVerfuegbar } = await lokalesBackend().laden()

    const gym = einheiten[tickKey('erijon', 'gym', '2026-08-26')]!
    expect(gym).toHaveLength(1)
    expect(gym[0]!.wert).toBe(93)
    // kein wert gespeichert heißt kein wert erfunden
    expect(einheiten[tickKey('erijon', 'lesen', '2026-08-25')]![0]!.wert).toBeNull()
    // der haken des anderen geht nicht verloren
    expect(einheiten[tickKey('koray', 'boxen', '2026-08-26')]![0]!.wert).toBe(40)
    expect(einheitVonVerfuegbar).toBe(true)
  })

  it('läuft nur einmal und legt beim zweiten laden nichts doppelt an', async () => {
    speicher.setItem('vierfelder.ticks.v2', JSON.stringify({ 'erijon|gym|2026-08-26': true }))

    const backend = lokalesBackend()
    await backend.laden()
    const { einheiten } = await backend.laden()

    expect(einheiten[tickKey('erijon', 'gym', '2026-08-26')]).toHaveLength(1)
  })

  it('legt eine zweite einheit neben die übernommene, ohne sie zu ersetzen', async () => {
    speicher.setItem('vierfelder.ticks.v2', JSON.stringify({ 'erijon|gym|2026-08-26': true }))
    speicher.setItem('vierfelder.werte.v2', JSON.stringify({ erijon: { 'gym|2026-08-26': 65 } }))

    const backend = lokalesBackend()
    const erst = await backend.laden()
    const alt = erst.einheiten[tickKey('erijon', 'gym', '2026-08-26')]![0]!

    await backend.schreibeEinheit({
      id: 'zweite',
      user: 'erijon',
      area: 'gym',
      tag: '2026-08-26',
      wert: 28,
      erfasst: new Date(2026, 7, 26, 18, 30).toISOString(),
    })

    const { einheiten } = await backend.laden()
    const liste = einheiten[tickKey('erijon', 'gym', '2026-08-26')]!
    expect(liste).toHaveLength(2)
    expect(liste.map((e) => e.wert)).toEqual([65, 28])
    expect(liste[0]!.id).toBe(alt.id)
  })

  it('behaelt die erste wochenabrechnung unveraendert', async () => {
    const backend = lokalesBackend()
    const basis = {
      woche: '2020-01-06', sieger: 'erijon' as const, grund: 'punkte' as const,
      differenz: 2, belegErijon: 3, belegKoray: 1, wette: null, abgeschlossen: '2026-08-30T18:00:00Z',
    }
    await backend.schreibeAbrechnung(basis)
    await backend.schreibeAbrechnung({ ...basis, sieger: 'koray', differenz: -2 })

    const { abrechnungen } = await backend.laden()
    expect(abrechnungen.find((a) => a.woche === basis.woche)).toMatchObject({ sieger: 'erijon', differenz: 2 })
  })
})
