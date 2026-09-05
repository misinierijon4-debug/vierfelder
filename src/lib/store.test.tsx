/** @vitest-environment jsdom */

import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { StrictMode, useEffect } from 'react'
import type { PropsWithChildren } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Anfangszustand, Backend, BackendEreignis } from './backend'
import { phasenLadeKey } from './schlafLaden'
import { useTracker } from './store'
import type { Phase, Schlafnacht } from './types'

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

const PHASE: Phase = { art: 'kern', start: 0, dauer: 480 }
const SCHLAF_OFFEN: Schlafnacht = {
  user: 'erijon',
  nacht: '2026-09-03',
  schlafMinuten: 480,
  einschlafzeit: '2026-09-02T21:30:00.000Z',
  aufwachzeit: '2026-09-03T05:30:00.000Z',
  bettStart: null,
  bettEnde: null,
  bettMinuten: null,
  tiefMinuten: 0,
  remMinuten: 0,
  kernMinuten: 480,
  unspezMinuten: 0,
  wachMinuten: 0,
  zielMinuten: 480,
  phasen: null,
  nachtwert: 80,
  scoreKonfidenz: 100,
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
    schreibeAbrechnung: vi.fn(async (a) => a),
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
  belegErijon: 8,
  belegKoray: 6,
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

  it('uebernimmt nach einem Abschluss die kanonisch bestaetigte Serverzeile', async () => {
    const kanonisch = { ...ABRECHNUNG, sieger: 'koray' as const, differenz: -1 }
    const backend = backendMit(async () => ANFANG, {
      schreibeAbrechnung: vi.fn(async () => kanonisch),
    })
    const { result } = renderHook(() => useTracker(backend))
    await waitFor(() => expect(result.current.ladezustand).toBe('bereit'))

    act(() => {
      result.current.abrechnungHinzu(ABRECHNUNG)
      result.current.abrechnungHinzu(ABRECHNUNG)
    })
    expect(result.current.abrechnungen).toEqual([])
    expect(result.current.abrechnungStatus[ABRECHNUNG.woche]).toBe('speichern')
    expect(backend.schreibeAbrechnung).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(result.current.abrechnungen[0]).toEqual(kanonisch))
    expect(result.current.abrechnungStatus[ABRECHNUNG.woche]).toBeUndefined()
  })

  it('rollt ein waehrend des Schreibens empfangenes kanonisches Archiv nicht zurueck', async () => {
    const antwort = offen<typeof ABRECHNUNG>()
    const kanonisch = { ...ABRECHNUNG, sieger: 'koray' as const, differenz: -1 }
    let melde!: (e: BackendEreignis) => void
    const backend = backendMit(async () => ANFANG, {
      schreibeAbrechnung: vi.fn(() => antwort.promise),
      abonniere: vi.fn((cb) => {
        melde = cb
        return () => {}
      }),
    })
    const { result } = renderHook(() => useTracker(backend))
    await waitFor(() => expect(result.current.ladezustand).toBe('bereit'))

    act(() => result.current.abrechnungHinzu(ABRECHNUNG))
    act(() => melde({ typ: 'abrechnung', abrechnung: kanonisch }))
    await act(async () => {
      antwort.reject(new Error('antwort verloren'))
      await Promise.resolve()
    })

    expect(result.current.abrechnungen).toEqual([kanonisch])
    expect(result.current.abrechnungStatus[ABRECHNUNG.woche]).toBeUndefined()
    expect(result.current.fehler).toBeNull()
  })

  it('behaelt ein fremdes Realtime-Archiv, wenn der eigene Abschluss fehlschlaegt', async () => {
    const antwort = offen<typeof ABRECHNUNG>()
    const andereWoche = { ...ABRECHNUNG, woche: '2026-08-24' }
    let melde!: (e: BackendEreignis) => void
    const backend = backendMit(async () => ANFANG, {
      schreibeAbrechnung: vi.fn(() => antwort.promise),
      abonniere: vi.fn((cb) => {
        melde = cb
        return () => {}
      }),
    })
    const { result } = renderHook(() => useTracker(backend))
    await waitFor(() => expect(result.current.ladezustand).toBe('bereit'))

    act(() => result.current.abrechnungHinzu(ABRECHNUNG))
    act(() => melde({ typ: 'abrechnung', abrechnung: andereWoche }))
    await act(async () => {
      antwort.reject(new Error('server nicht erreichbar'))
      await Promise.resolve()
    })

    expect(result.current.abrechnungen).toEqual([andereWoche])
    expect(result.current.abrechnungStatus[ABRECHNUNG.woche]).toBe('fehler')
  })

  it('hebt einen Abschlussfehler auf, wenn spaeter das passende Realtime-Archiv kommt', async () => {
    const antwort = offen<typeof ABRECHNUNG>()
    let melde!: (e: BackendEreignis) => void
    const backend = backendMit(async () => ANFANG, {
      schreibeAbrechnung: vi.fn(() => antwort.promise),
      abonniere: vi.fn((cb) => {
        melde = cb
        return () => {}
      }),
    })
    const { result } = renderHook(() => useTracker(backend))
    await waitFor(() => expect(result.current.ladezustand).toBe('bereit'))

    act(() => result.current.abrechnungHinzu(ABRECHNUNG))
    await act(async () => {
      antwort.reject(new Error('antwort verloren'))
      await Promise.resolve()
    })
    expect(result.current.abrechnungStatus[ABRECHNUNG.woche]).toBe('fehler')

    act(() => melde({ typ: 'abrechnung', abrechnung: ABRECHNUNG }))

    expect(result.current.abrechnungen).toEqual([ABRECHNUNG])
    expect(result.current.abrechnungStatus[ABRECHNUNG.woche]).toBeUndefined()
  })

  it('meldet einen Abschlussfehler und laesst denselben Abschluss erneut zu', async () => {
    const schreibeAbrechnung = vi.fn<Backend['schreibeAbrechnung']>()
      .mockRejectedValueOnce(new Error('netz weg'))
      .mockResolvedValueOnce(ABRECHNUNG)
    const backend = backendMit(async () => ANFANG, { schreibeAbrechnung })
    const { result } = renderHook(() => useTracker(backend))
    await waitFor(() => expect(result.current.ladezustand).toBe('bereit'))

    act(() => result.current.abrechnungHinzu(ABRECHNUNG))
    await waitFor(() => expect(result.current.abrechnungStatus[ABRECHNUNG.woche]).toBe('fehler'))
    expect(result.current.fehler).toBe('wochenabschluss fehlgeschlagen.')

    act(() => result.current.abrechnungHinzu(ABRECHNUNG))
    await waitFor(() => expect(result.current.abrechnungen).toEqual([ABRECHNUNG]))
    expect(schreibeAbrechnung).toHaveBeenCalledTimes(2)
    expect(result.current.fehler).toBeNull()
  })

  it('schreibt eine bereits geladene Wochenabrechnung kein zweites Mal', async () => {
    const anfang = { ...ANFANG, abrechnungen: [ABRECHNUNG] }
    const backend = backendMit(async () => anfang)
    const { result } = renderHook(() => useTracker(backend))
    await waitFor(() => expect(result.current.ladezustand).toBe('bereit'))

    act(() => result.current.abrechnungHinzu({ ...ABRECHNUNG, sieger: 'koray', differenz: -2 }))

    expect(backend.schreibeAbrechnung).not.toHaveBeenCalled()
    expect(result.current.abrechnungen).toEqual([ABRECHNUNG])
  })

  it('entfernt Realtime-Zeilen allein anhand ihrer stabilen Primaerschluessel', async () => {
    const einheit = {
      id: 'einheit-1', user: 'erijon' as const, area: 'gym' as const,
      tag: '2026-09-04', wert: 60, erfasst: null,
    }
    const fach = {
      id: 'fach-1', user: 'erijon' as const, name: 'mathe', kursart: 'gk' as const,
      pruefungsfach: 4, sortierung: 0,
    }
    const note = {
      id: 'note-1', user: 'erijon' as const, fachId: fach.id, art: 'klausur' as const,
      punkte: 12, gewicht: 10, datum: '2026-09-04', titel: 'arbeit',
    }
    const anfang: Anfangszustand = {
      ...ANFANG,
      einheiten: { 'erijon|gym|2026-09-04': [einheit] },
      aufenthalte: [{
        id: '42', user: 'erijon', bereich: 'gym', ort: 'fitx',
        ankunft: '2026-09-04T16:00:00Z', abgang: '2026-09-04T17:00:00Z',
      }],
      wetten: { '2026-08-31': 'einsatz' },
      noten: { faecher: [fach], noten: [note] },
    }
    let melde!: (e: BackendEreignis) => void
    const backend = backendMit(async () => anfang, {
      abonniere: vi.fn((cb) => {
        melde = cb
        return () => {}
      }),
    })
    const { result } = renderHook(() => useTracker(backend))
    await waitFor(() => expect(result.current.ladezustand).toBe('bereit'))

    act(() => {
      melde({ typ: 'einheit', art: 'weg', id: einheit.id })
      melde({ typ: 'aufenthalt', art: 'weg', id: '42' })
      melde({ typ: 'note', art: 'weg', id: note.id })
      melde({ typ: 'wette', woche: '2026-08-31', text: null })
    })
    expect(result.current.zustand.einheiten).toEqual({})
    expect(result.current.zustand.aufenthalte).toEqual([])
    expect(result.current.notenstand.noten).toEqual([])
    expect(result.current.wetten).toEqual({})

    act(() => melde({ typ: 'fach', art: 'weg', id: fach.id }))
    expect(result.current.notenstand.faecher).toEqual([])
  })
})

describe('useTracker Schlafverlaeufe', () => {
  const key = phasenLadeKey(SCHLAF_OFFEN.user, SCHLAF_OFFEN.nacht)

  it('dedupliziert zwei Consumer und fuehrt loading in loaded ueber', async () => {
    const antwort = offen<Phase[]>()
    const ladePhasen = vi.fn<Backend['ladePhasen']>(() => antwort.promise)
    const backend = backendMit(async () => ({ ...ANFANG, schlaf: [SCHLAF_OFFEN] }), {
      ladePhasen,
    })
    const { result } = renderHook(() => useTracker(backend))
    await waitFor(() => expect(result.current.ladezustand).toBe('bereit'))

    let cleanupA: (() => void) | void
    let cleanupB: (() => void) | void
    act(() => {
      cleanupA = result.current.phasenNachladen(SCHLAF_OFFEN.user, SCHLAF_OFFEN.nacht)
      cleanupB = result.current.phasenNachladen(SCHLAF_OFFEN.user, SCHLAF_OFFEN.nacht)
    })

    expect(ladePhasen).toHaveBeenCalledTimes(1)
    expect(ladePhasen.mock.calls[0]?.[2]).toBeInstanceOf(AbortSignal)
    expect(result.current.phasenLadezustaende[key]).toEqual({ status: 'loading' })

    await act(async () => {
      antwort.resolve([PHASE])
      await antwort.promise
    })
    await waitFor(() => {
      expect(result.current.phasenLadezustaende[key]).toEqual({ status: 'loaded' })
    })
    expect(result.current.schlaf[0]?.phasen).toEqual([PHASE])

    act(() => {
      cleanupA?.()
      cleanupB?.()
    })
  })

  it('zeigt einen Fehler ohne Auto-Schleife und laesst erst den Retry erneut laden', async () => {
    const ladePhasen = vi
      .fn<Backend['ladePhasen']>()
      .mockRejectedValueOnce(new Error('internes ziel mit token'))
      .mockResolvedValueOnce([])
    const backend = backendMit(async () => ({ ...ANFANG, schlaf: [SCHLAF_OFFEN] }), {
      ladePhasen,
    })
    const { result } = renderHook(() => useTracker(backend))
    await waitFor(() => expect(result.current.ladezustand).toBe('bereit'))

    act(() => {
      result.current.phasenNachladen(SCHLAF_OFFEN.user, SCHLAF_OFFEN.nacht)
    })
    await waitFor(() => {
      expect(result.current.phasenLadezustaende[key]).toEqual({
        status: 'error',
        text: 'verlauf konnte nicht geladen werden.',
      })
    })
    expect(result.current.schlaf[0]?.phasen).toBeNull()
    expect(result.current.fehler).toBeNull()

    act(() => {
      result.current.phasenNachladen(SCHLAF_OFFEN.user, SCHLAF_OFFEN.nacht)
    })
    expect(ladePhasen).toHaveBeenCalledTimes(1)

    act(() => result.current.phasenNeuLaden(SCHLAF_OFFEN.user, SCHLAF_OFFEN.nacht))
    expect(result.current.phasenLadezustaende[key]).toEqual({ status: 'loading' })
    await waitFor(() => {
      expect(result.current.phasenLadezustaende[key]).toEqual({ status: 'empty' })
    })
    expect(ladePhasen).toHaveBeenCalledTimes(2)
    expect(result.current.schlaf[0]?.phasen).toEqual([])
  })

  it('bricht beim Backendwechsel ab und ignoriert die spaete alte Antwort', async () => {
    const alteAntwort = offen<Phase[]>()
    const ladeAlt = vi.fn((_user: unknown, _nacht: unknown, _signal: AbortSignal) => alteAntwort.promise)
    const erstes = backendMit(async () => ({ ...ANFANG, schlaf: [SCHLAF_OFFEN] }), {
      ladePhasen: ladeAlt,
    })
    const neueNacht = { ...SCHLAF_OFFEN, phasen: [] }
    const zweites = backendMit(async () => ({ ...ANFANG, me: 'koray', schlaf: [neueNacht] }))
    const { result, rerender } = renderHook(
      ({ backend }) => useTracker(backend),
      { initialProps: { backend: erstes as Backend } }
    )
    await waitFor(() => expect(result.current.ladezustand).toBe('bereit'))

    act(() => {
      result.current.phasenNachladen(SCHLAF_OFFEN.user, SCHLAF_OFFEN.nacht)
    })
    const signal = ladeAlt.mock.calls[0]?.[2]
    expect(signal?.aborted).toBe(false)

    rerender({ backend: zweites })
    await waitFor(() => expect(result.current.me).toBe('koray'))
    expect(signal?.aborted).toBe(true)

    await act(async () => {
      alteAntwort.resolve([PHASE])
      await alteAntwort.promise
    })

    expect(result.current.schlaf).toEqual([neueNacht])
    expect(result.current.phasenLadezustaende[key]).toEqual({ status: 'empty' })
  })

  it('laedt nach einer Realtime-Invalidierung derselben sichtbaren Nacht frisch', async () => {
    const ersteAntwort = offen<Phase[]>()
    const zweiteAntwort = offen<Phase[]>()
    const ladePhasen = vi
      .fn<Backend['ladePhasen']>()
      .mockImplementationOnce(() => ersteAntwort.promise)
      .mockImplementationOnce(() => zweiteAntwort.promise)
    let melde!: (e: BackendEreignis) => void
    const backend = backendMit(async () => ({ ...ANFANG, schlaf: [SCHLAF_OFFEN] }), {
      ladePhasen,
      abonniere: vi.fn((cb) => {
        melde = cb
        return () => {}
      }),
    })
    const { result } = renderHook(() => useTracker(backend))
    await waitFor(() => expect(result.current.ladezustand).toBe('bereit'))

    act(() => {
      result.current.phasenNachladen(SCHLAF_OFFEN.user, SCHLAF_OFFEN.nacht)
    })
    const altesSignal = ladePhasen.mock.calls[0]![2]

    await act(async () => {
      melde({
        typ: 'schlaf',
        art: 'wert',
        nacht: { ...SCHLAF_OFFEN, schlafMinuten: 481, phasen: null },
      })
      await Promise.resolve()
    })

    expect(altesSignal.aborted).toBe(true)
    expect(ladePhasen).toHaveBeenCalledTimes(2)
    expect(result.current.phasenLadezustaende[key]).toEqual({ status: 'loading' })

    await act(async () => {
      ersteAntwort.resolve([{ art: 'tief', start: 0, dauer: 1 }])
      await ersteAntwort.promise
    })
    expect(result.current.schlaf[0]?.phasen).toBeNull()

    await act(async () => {
      zweiteAntwort.resolve([PHASE])
      await zweiteAntwort.promise
    })
    await waitFor(() => expect(result.current.schlaf[0]?.phasen).toEqual([PHASE]))
  })

  it('entfernt eine per Realtime geloeschte Nacht samt Pending-Abruf', async () => {
    const antwort = offen<Phase[]>()
    const ladePhasen = vi.fn<Backend['ladePhasen']>(() => antwort.promise)
    let melde!: (e: BackendEreignis) => void
    const backend = backendMit(async () => ({ ...ANFANG, schlaf: [SCHLAF_OFFEN] }), {
      ladePhasen,
      abonniere: vi.fn((cb) => {
        melde = cb
        return () => {}
      }),
    })
    const { result } = renderHook(() => useTracker(backend))
    await waitFor(() => expect(result.current.ladezustand).toBe('bereit'))

    act(() => {
      result.current.phasenNachladen(SCHLAF_OFFEN.user, SCHLAF_OFFEN.nacht)
    })
    const signal = ladePhasen.mock.calls[0]![2]
    act(() => {
      melde({
        typ: 'schlaf',
        art: 'weg',
        user: SCHLAF_OFFEN.user,
        nacht: SCHLAF_OFFEN.nacht,
      })
    })

    expect(signal.aborted).toBe(true)
    expect(result.current.schlaf).toEqual([])
    expect(result.current.phasenLadezustaende[key]).toBeUndefined()

    await act(async () => {
      antwort.resolve([PHASE])
      await antwort.promise
    })
    expect(result.current.schlaf).toEqual([])
  })

  it('bricht einen laufenden Verlaufabruf beim Unmount ab', async () => {
    const antwort = offen<Phase[]>()
    const ladePhasen = vi.fn<Backend['ladePhasen']>(() => antwort.promise)
    const backend = backendMit(async () => ({ ...ANFANG, schlaf: [SCHLAF_OFFEN] }), {
      ladePhasen,
    })
    const { result, unmount } = renderHook(() => useTracker(backend))
    await waitFor(() => expect(result.current.ladezustand).toBe('bereit'))

    act(() => {
      result.current.phasenNeuLaden(SCHLAF_OFFEN.user, SCHLAF_OFFEN.nacht)
    })
    const signal = ladePhasen.mock.calls[0]![2]
    expect(signal.aborted).toBe(false)

    unmount()
    expect(signal.aborted).toBe(true)
  })

  it('teilt den Abruf auch durch StrictMode-Effect-Cleanup hindurch', async () => {
    const antwort = offen<Phase[]>()
    const ladePhasen = vi.fn<Backend['ladePhasen']>(() => antwort.promise)
    const backend = backendMit(async () => ({ ...ANFANG, schlaf: [SCHLAF_OFFEN] }), {
      ladePhasen,
    })
    const wrapper = ({ children }: PropsWithChildren) => <StrictMode>{children}</StrictMode>
    const { result } = renderHook(() => {
      const tracker = useTracker(backend)
      const status = tracker.phasenLadezustaende[key]?.status
      useEffect(() => {
        if (tracker.ladezustand !== 'bereit' || tracker.schlaf[0]?.phasen !== null) return
        return tracker.phasenNachladen(SCHLAF_OFFEN.user, SCHLAF_OFFEN.nacht)
      }, [status, tracker.ladezustand, tracker.phasenNachladen, tracker.schlaf])
      return tracker
    }, { wrapper })

    await waitFor(() => {
      expect(result.current.phasenLadezustaende[key]).toEqual({ status: 'loading' })
    })
    expect(ladePhasen).toHaveBeenCalledTimes(1)
    expect(ladePhasen.mock.calls[0]![2].aborted).toBe(false)

    await act(async () => {
      antwort.resolve([PHASE])
      await antwort.promise
    })
    await waitFor(() => {
      expect(result.current.phasenLadezustaende[key]).toEqual({ status: 'loaded' })
    })
  })
})
