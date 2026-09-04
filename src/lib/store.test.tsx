/** @vitest-environment jsdom */

import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Anfangszustand, Backend } from './backend'
import { useTracker } from './store'

afterEach(cleanup)

const ANFANG: Anfangszustand = {
  me: 'erijon',
  einheiten: {},
  gewichte: {},
  gewichtQuellen: {},
  schlaf: [],
  aufenthalte: [],
  wetten: {},
  abrechnungen: [],
  noten: { faecher: [], noten: [] },
  einheitVonVerfuegbar: true,
  altbestand: false,
}

function offen<T>() {
  let resolve!: (wert: T) => void
  let reject!: (grund?: unknown) => void
  const promise = new Promise<T>((fertig, fehlgeschlagen) => {
    resolve = fertig
    reject = fehlgeschlagen
  })
  return { promise, resolve, reject }
}

function backendMit(laden: Backend['laden'], overrides: Partial<Backend> = {}): Backend {
  return {
    art: 'supabase',
    laden,
    schreibeEinheit: vi.fn(async () => {}),
    schreibeEinheitWert: vi.fn(async () => {}),
    schreibeEinheitVon: vi.fn(async () => {}),
    loescheEinheit: vi.fn(async () => {}),
    loescheTag: vi.fn(async () => {}),
    schreibeGewicht: vi.fn(async () => {}),
    schreibeWette: vi.fn(async () => {}),
    schreibeAbrechnung: vi.fn(async () => {}),
    setzePruefungsfach: vi.fn(async () => {}),
    schreibeNote: vi.fn(async () => {}),
    loescheNote: vi.fn(async () => {}),
    ladePhasen: vi.fn(async () => []),
    abonniere: vi.fn(() => () => {}),
    ...overrides,
  }
}

const ABRECHNUNG = {
  woche: '2026-08-31',
  sieger: 'erijon' as const,
  grund: 'punkte' as const,
  differenz: 2,
  belegErijon: 80,
  belegKoray: 60,
  wette: null,
  abgeschlossen: '2026-09-06T16:00:00.000Z',
}

describe('useTracker Schreibbereitschaft', () => {
  it('veraendert und schreibt vor dem abgeschlossenen Erstladen nichts', () => {
    const pending = offen<Anfangszustand>()
    const backend = backendMit(() => pending.promise)
    const { result } = renderHook(() => useTracker(backend))

    act(() => {
      result.current.toggle('lernen', '2026-09-04')
      result.current.einheitHinzu('gym', '2026-09-04')
      result.current.setzeGewicht('2026-09-04', 81.2)
      result.current.setzeWette('2026-08-31', 'verlierer kocht')
      result.current.abrechnungHinzu(ABRECHNUNG)
    })

    expect(result.current.ladezustand).toBe('laden')
    expect(result.current.zustand.einheiten).toEqual({})
    expect(result.current.zustand.gewichte).toEqual({})
    expect(result.current.wetten).toEqual({})
    expect(result.current.abrechnungen).toEqual([])
    expect(backend.schreibeEinheit).not.toHaveBeenCalled()
    expect(backend.schreibeGewicht).not.toHaveBeenCalled()
    expect(backend.schreibeWette).not.toHaveBeenCalled()
    expect(backend.schreibeAbrechnung).not.toHaveBeenCalled()
  })

  it('sperrt beim Backendwechsel sofort bis der neue Zustand geladen ist', async () => {
    const erstes = backendMit(async () => ANFANG)
    const zweitesLaden = offen<Anfangszustand>()
    const zweites = backendMit(() => zweitesLaden.promise)
    const { result, rerender } = renderHook(
      ({ backend }) => useTracker(backend),
      { initialProps: { backend: erstes as Backend } }
    )

    await waitFor(() => expect(result.current.ladezustand).toBe('bereit'))
    const alterToggle = result.current.toggle
    rerender({ backend: zweites })
    await waitFor(() => expect(result.current.ladezustand).toBe('laden'))

    act(() => {
      alterToggle('lernen', '2026-09-04')
      result.current.toggle('lernen', '2026-09-04')
    })

    expect(result.current.zustand.einheiten).toEqual({})
    expect(erstes.schreibeEinheit).not.toHaveBeenCalled()
    expect(zweites.schreibeEinheit).not.toHaveBeenCalled()

    act(() => zweitesLaden.resolve(ANFANG))
    await waitFor(() => expect(result.current.ladezustand).toBe('bereit'))

    act(() => {
      alterToggle('lernen', '2026-09-04')
      result.current.toggle('lernen', '2026-09-04')
    })

    expect(erstes.schreibeEinheit).not.toHaveBeenCalled()
    await waitFor(() => expect(zweites.schreibeEinheit).toHaveBeenCalledTimes(1))
  })

  it('bleibt nach einem endgueltigen Ladefehler schreibgesperrt', async () => {
    const backend = backendMit(async () => {
      throw new Error('kein profil fuer dieses konto')
    })
    const { result } = renderHook(() => useTracker(backend))

    await waitFor(() => expect(result.current.ladezustand).toBe('fehler'))
    act(() => {
      result.current.toggle('lernen', '2026-09-04')
      result.current.setzeGewicht('2026-09-04', 81.2)
      result.current.setzeWette('2026-08-31', 'verlierer kocht')
      result.current.abrechnungHinzu(ABRECHNUNG)
    })

    expect(result.current.zustand.einheiten).toEqual({})
    expect(result.current.zustand.gewichte).toEqual({})
    expect(result.current.wetten).toEqual({})
    expect(result.current.abrechnungen).toEqual([])
  })

  it('laesst eine spaete Fehlantwort nicht in ein neues Konto zurueckrollen', async () => {
    const alteAntwort = offen<void>()
    const erstes = backendMit(async () => ANFANG, {
      schreibeGewicht: vi.fn(() => alteAntwort.promise),
    })
    const zweiterAnfang: Anfangszustand = {
      ...ANFANG,
      me: 'koray',
      gewichte: { 'koray|2026-09-04': 90 },
    }
    const zweites = backendMit(async () => zweiterAnfang)
    const { result, rerender } = renderHook(
      ({ backend }) => useTracker(backend),
      { initialProps: { backend: erstes } }
    )

    await waitFor(() => expect(result.current.ladezustand).toBe('bereit'))
    act(() => result.current.setzeGewicht('2026-09-04', 81.2))
    expect(result.current.zustand.gewichte['erijon|2026-09-04']).toBe(81.2)

    rerender({ backend: zweites })
    await waitFor(() => expect(result.current.me).toBe('koray'))
    expect(result.current.zustand.gewichte).toEqual({ 'koray|2026-09-04': 90 })

    await act(async () => {
      alteAntwort.reject(new Error('alte Verbindung abgebrochen'))
      await Promise.resolve()
    })

    expect(result.current.zustand.gewichte).toEqual({ 'koray|2026-09-04': 90 })
    expect(result.current.fehler).toBeNull()
  })

  it('blockiert gespeicherte Schreibcallbacks auch nach dem Unmount', async () => {
    const backend = backendMit(async () => ANFANG)
    const { result, unmount } = renderHook(() => useTracker(backend))

    await waitFor(() => expect(result.current.ladezustand).toBe('bereit'))
    const altesSetzeGewicht = result.current.setzeGewicht
    unmount()
    altesSetzeGewicht('2026-09-04', 81.2)

    expect(backend.schreibeGewicht).not.toHaveBeenCalled()
  })
})
