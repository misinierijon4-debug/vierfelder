/** @vitest-environment jsdom */

import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { StrictMode, useEffect } from 'react'
import type { PropsWithChildren } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Anfangszustand, Backend, BackendEreignis } from './backend'
import { hatNeustartBlocker } from './pwaBlocker'
import { phasenLadeKey } from './schlafLaden'
import { useTracker } from './store'
import { UnbestaetigteMutation } from './supabase'
import type { Einheit, Fach, Note, Phase, Schlafnacht } from './types'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

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

const LIVE_EINHEIT: Einheit = {
  id: 'live-einheit-1',
  user: 'koray',
  area: 'gym',
  tag: '2026-09-05',
  wert: 60,
  erfasst: '2026-09-05T15:00:00.000Z',
  von: null,
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
    setzePruefungsfach: vi.fn(async (fachId: string) => fachId),
    schreibeNote: vi.fn(async (note) => note.id),
    loescheNote: vi.fn(async (id: string) => id),
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

  it('blockiert bekannte Offline-Eingaben ohne sichere Warteschlange sichtbar', async () => {
    const backend = backendMit(async () => ANFANG)
    const online = vi.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(false)
    const { result } = renderHook(() => useTracker(backend))
    await waitFor(() => expect(result.current.ladezustand).toBe('bereit'))

    act(() => {
      result.current.toggle('lernen', '2026-09-04')
      result.current.setzeGewicht('2026-09-04', 81.2)
    })

    expect(backend.schreibeEinheit).not.toHaveBeenCalled()
    expect(backend.schreibeGewicht).not.toHaveBeenCalled()
    expect(result.current.zustand.einheiten).toEqual({})
    expect(result.current.fehler).toBe('offline: eingaben sind ohne sichere warteschlange gesperrt.')
    online.mockRestore()
  })

  it('laesst einen endgueltigen Ladefehler ausdruecklich erneut versuchen', async () => {
    const zweiterVersuch = offen<Anfangszustand>()
    const laden = vi.fn<Backend['laden']>()
      .mockRejectedValueOnce(new Error('kein profil fuer dieses konto'))
      .mockImplementationOnce(() => zweiterVersuch.promise)
    const backend = backendMit(laden)
    const { result } = renderHook(() => useTracker(backend))

    await waitFor(() => expect(result.current.ladezustand).toBe('fehler'))
    act(() => result.current.ladenNeu())
    await waitFor(() => expect(result.current.ladezustand).toBe('laden'))

    act(() => result.current.toggle('lernen', '2026-09-04'))
    expect(backend.schreibeEinheit).not.toHaveBeenCalled()

    act(() => zweiterVersuch.resolve(ANFANG))
    await waitFor(() => expect(result.current.ladezustand).toBe('bereit'))
    expect(laden).toHaveBeenCalledTimes(2)
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

const FACH_ALT: Fach = {
  id: '40000000-0000-4000-8000-000000000001',
  user: 'erijon',
  name: 'mathe',
  kursart: 'gk',
  pruefungsfach: 4,
  sortierung: 0,
}
const FACH_NEU: Fach = {
  id: '40000000-0000-4000-8000-000000000002',
  user: 'erijon',
  name: 'deutsch',
  kursart: 'gk',
  pruefungsfach: null,
  sortierung: 1,
}
const FACH_DRITTES: Fach = {
  id: '40000000-0000-4000-8000-000000000003',
  user: 'erijon',
  name: 'sozialkunde',
  kursart: 'gk',
  pruefungsfach: null,
  sortierung: 2,
}
const NOTE_REMOTE: Note = {
  id: '50000000-0000-4000-8000-000000000001',
  user: 'erijon',
  fachId: FACH_ALT.id,
  art: 'epo',
  punkte: 11,
  gewicht: 2,
  datum: '2026-09-05',
  titel: 'remote',
}

describe('useTracker atomare Notenmutationen', () => {
  const anfangMitFaecher: Anfangszustand = {
    ...ANFANG,
    noten: { faecher: [FACH_ALT, FACH_NEU, FACH_DRITTES], noten: [] },
  }

  it('wechselt das Pruefungsfach mit genau einem bestaetigten RPC-Aufruf', async () => {
    const setzePruefungsfach = vi.fn(async (id: string) => id)
    const backend = backendMit(async () => anfangMitFaecher, { setzePruefungsfach })
    const { result } = renderHook(() => useTracker(backend))
    await waitFor(() => expect(result.current.ladezustand).toBe('bereit'))

    act(() => result.current.setzePruefungsfach(FACH_NEU.id))

    expect(result.current.notenstand.faecher.filter((fach) => fach.pruefungsfach === 4))
      .toEqual([expect.objectContaining({ id: FACH_NEU.id })])
    await waitFor(() => expect(setzePruefungsfach).toHaveBeenCalledOnce())
    expect(setzePruefungsfach).toHaveBeenCalledWith(FACH_NEU.id, FACH_ALT.id)
  })

  it('ordnet schnelle Folgewechsel ueber denselben fachlichen Schluessel', async () => {
    const erster = offen<string>()
    const setzePruefungsfach = vi.fn<Backend['setzePruefungsfach']>()
      .mockImplementationOnce(() => erster.promise)
      .mockImplementationOnce(async (id) => id)
    const backend = backendMit(async () => anfangMitFaecher, { setzePruefungsfach })
    const { result } = renderHook(() => useTracker(backend))
    await waitFor(() => expect(result.current.ladezustand).toBe('bereit'))

    act(() => {
      result.current.setzePruefungsfach(FACH_NEU.id)
      result.current.setzePruefungsfach(FACH_DRITTES.id)
    })
    await waitFor(() => expect(setzePruefungsfach).toHaveBeenCalledTimes(1))

    act(() => erster.resolve(FACH_NEU.id))
    await waitFor(() => expect(setzePruefungsfach).toHaveBeenCalledTimes(2))
    expect(setzePruefungsfach).toHaveBeenNthCalledWith(2, FACH_DRITTES.id, FACH_NEU.id)
    expect(result.current.notenstand.faecher.filter((fach) => fach.pruefungsfach === 4))
      .toEqual([expect.objectContaining({ id: FACH_DRITTES.id })])
  })

  it('laesst bei unbestaetigtem Noten-Insert ein Realtime-Ereignis bis zum Abgleich stehen', async () => {
    const schreiben = offen<string>()
    const zweiterStand = offen<Anfangszustand>()
    const laden = vi.fn<Backend['laden']>()
      .mockResolvedValueOnce(anfangMitFaecher)
      .mockImplementationOnce(() => zweiterStand.promise)
    let live: ((e: BackendEreignis) => void) | null = null
    const backend = backendMit(laden, {
      schreibeNote: vi.fn(() => schreiben.promise),
      abonniere: vi.fn((cb) => {
        live = cb
        return () => {}
      }),
    })
    const { result } = renderHook(() => useTracker(backend))
    await waitFor(() => expect(result.current.ladezustand).toBe('bereit'))

    let lokal: Note | null = null
    act(() => {
      lokal = result.current.noteHinzu(FACH_ALT.id, 12, 'klausur', '2026-09-06')
      live?.({ typ: 'note', art: 'neu', note: NOTE_REMOTE })
    })
    await act(async () => {
      schreiben.reject(new Error('antwort verloren'))
      await Promise.resolve()
    })

    await waitFor(() => expect(laden).toHaveBeenCalledTimes(2))
    expect(result.current.notenstand.noten.map((note) => note.id)).toEqual(
      expect.arrayContaining([lokal!.id, NOTE_REMOTE.id])
    )

    act(() => zweiterStand.resolve({
      ...anfangMitFaecher,
      noten: { ...anfangMitFaecher.noten, noten: [NOTE_REMOTE] },
    }))
    await waitFor(() => expect(result.current.notenstand.noten).toEqual([NOTE_REMOTE]))
  })

  it('ignoriert Sport als viertes Pruefungsfach', async () => {
    const sport: Fach = { ...FACH_NEU, id: 'sport-id', name: 'sport' }
    const setzePruefungsfach = vi.fn(async (id: string) => id)
    const backend = backendMit(async () => ({
      ...anfangMitFaecher,
      noten: { faecher: [...anfangMitFaecher.noten.faecher, sport], noten: [] },
    }), { setzePruefungsfach })
    const { result } = renderHook(() => useTracker(backend))
    await waitFor(() => expect(result.current.ladezustand).toBe('bereit'))

    act(() => result.current.setzePruefungsfach(sport.id))
    expect(setzePruefungsfach).not.toHaveBeenCalled()
    expect(result.current.notenstand.faecher.find((fach) => fach.id === sport.id)?.pruefungsfach)
      .toBeNull()
  })
})

describe('useTracker kanonischer Abgleich nach Mutationsfehlern', () => {
  it('laedt nach lokalem Schreibfehler den kanonischen Speicher statt eines alten React-Snapshots', async () => {
    const laden = vi.fn(async () => ANFANG)
    const backend = backendMit(laden, {
      art: 'lokal',
      schreibeEinheit: vi.fn(async () => {
        throw new Error('lokaler speicher voll')
      }),
    })
    const { result } = renderHook(() => useTracker(backend))
    await waitFor(() => expect(result.current.ladezustand).toBe('bereit'))

    act(() => result.current.einheitHinzu('lernen', '2026-09-06'))

    await waitFor(() => expect(result.current.fehler).toBe('nicht gespeichert. tippe nochmal.'))
    await waitFor(() => expect(laden).toHaveBeenCalledTimes(2))
    expect(result.current.zustand.einheiten).toEqual({})
  })

  it('rollt ein Realtime-Ereignis bei unbestaetigtem Tracker-Insert nicht zurueck', async () => {
    const schreiben = offen<void>()
    const zweiterStand = offen<Anfangszustand>()
    const laden = vi.fn<Backend['laden']>()
      .mockResolvedValueOnce(ANFANG)
      .mockImplementationOnce(() => zweiterStand.promise)
    let melde!: (e: BackendEreignis) => void
    const backend = backendMit(laden, {
      schreibeEinheit: vi.fn(() => schreiben.promise),
      abonniere: vi.fn((cb) => {
        melde = cb
        return () => {}
      }),
    })
    const { result } = renderHook(() => useTracker(backend))
    await waitFor(() => expect(result.current.ladezustand).toBe('bereit'))

    let lokal: Einheit | null = null
    act(() => {
      lokal = result.current.einheitHinzu('lernen', '2026-09-06')
      melde({ typ: 'einheit', art: 'neu', einheit: LIVE_EINHEIT })
    })
    await act(async () => {
      schreiben.reject(new UnbestaetigteMutation('einheit nicht bestaetigt'))
      await Promise.resolve()
    })

    await waitFor(() => expect(laden).toHaveBeenCalledTimes(2))
    expect(Object.values(result.current.zustand.einheiten).flat().map((einheit) => einheit.id))
      .toEqual(expect.arrayContaining([lokal!.id, LIVE_EINHEIT.id]))
    expect(result.current.fehler).toBe('einheit nicht bestätigt. stand wird abgeglichen.')

    act(() => zweiterStand.resolve({
      ...ANFANG,
      einheiten: { 'koray|gym|2026-09-05': [LIVE_EINHEIT] },
    }))
    await waitFor(() => {
      expect(Object.values(result.current.zustand.einheiten).flat()).toEqual([LIVE_EINHEIT])
    })
  })

  it('bewahrt fremdes Realtime-Gewicht bis zum starken Abgleich', async () => {
    const schreiben = offen<void>()
    const zweiterStand = offen<Anfangszustand>()
    const laden = vi.fn<Backend['laden']>()
      .mockResolvedValueOnce(ANFANG)
      .mockImplementationOnce(() => zweiterStand.promise)
    let melde!: (e: BackendEreignis) => void
    const backend = backendMit(laden, {
      schreibeGewicht: vi.fn(() => schreiben.promise),
      abonniere: vi.fn((cb) => {
        melde = cb
        return () => {}
      }),
    })
    const { result } = renderHook(() => useTracker(backend))
    await waitFor(() => expect(result.current.ladezustand).toBe('bereit'))

    act(() => {
      result.current.setzeGewicht('2026-09-06', 81.4)
      melde({ typ: 'gewicht', user: 'koray', tag: '2026-09-06', kg: 90.2 })
    })
    await act(async () => {
      schreiben.reject(new Error('antwort verloren'))
      await Promise.resolve()
    })

    await waitFor(() => expect(laden).toHaveBeenCalledTimes(2))
    expect(result.current.zustand.gewichte).toEqual({
      'erijon|2026-09-06': 81.4,
      'koray|2026-09-06': 90.2,
    })
    expect(result.current.fehler).toContain('stand wird abgeglichen')

    act(() => zweiterStand.resolve({
      ...ANFANG,
      gewichte: { 'koray|2026-09-06': 90.2 },
    }))
    await waitFor(() => expect(result.current.zustand.gewichte).toEqual({
      'koray|2026-09-06': 90.2,
    }))
  })

  it('bewahrt eine fremde Realtime-Wette bis zum starken Abgleich', async () => {
    const schreiben = offen<void>()
    const zweiterStand = offen<Anfangszustand>()
    const laden = vi.fn<Backend['laden']>()
      .mockResolvedValueOnce(ANFANG)
      .mockImplementationOnce(() => zweiterStand.promise)
    let melde!: (e: BackendEreignis) => void
    const backend = backendMit(laden, {
      schreibeWette: vi.fn(() => schreiben.promise),
      abonniere: vi.fn((cb) => {
        melde = cb
        return () => {}
      }),
    })
    const { result } = renderHook(() => useTracker(backend))
    await waitFor(() => expect(result.current.ladezustand).toBe('bereit'))

    act(() => {
      result.current.setzeWette('2026-09-07', 'eigene wette')
      melde({ typ: 'wette', woche: '2026-08-31', text: 'fremde wette' })
    })
    await act(async () => {
      schreiben.reject(new UnbestaetigteMutation('wette nicht bestaetigt'))
      await Promise.resolve()
    })

    await waitFor(() => expect(laden).toHaveBeenCalledTimes(2))
    expect(result.current.wetten).toEqual({
      '2026-08-31': 'fremde wette',
      '2026-09-07': 'eigene wette',
    })

    act(() => zweiterStand.resolve({
      ...ANFANG,
      wetten: { '2026-08-31': 'fremde wette' },
    }))
    await waitFor(() => expect(result.current.wetten).toEqual({
      '2026-08-31': 'fremde wette',
    }))
  })

  it('laesst einen fehlgeschlagenen alten Wert nicht ueber eine neuere Eingabe rollen', async () => {
    const erster = offen<void>()
    const einheit: Einheit = {
      id: 'lokale-folge', user: 'erijon', area: 'lernen', tag: '2026-09-06',
      wert: 60, erfasst: null,
    }
    const schreiben = vi.fn<Backend['schreibeEinheitWert']>()
      .mockImplementationOnce(() => erster.promise)
      .mockResolvedValueOnce(undefined)
    const backend = backendMit(async () => ({
      ...ANFANG,
      einheiten: { 'erijon|lernen|2026-09-06': [einheit] },
    }), { art: 'lokal', schreibeEinheitWert: schreiben })
    const { result } = renderHook(() => useTracker(backend))
    await waitFor(() => expect(result.current.ladezustand).toBe('bereit'))

    act(() => {
      result.current.wertSetzen(einheit.id, 61)
      result.current.wertSetzen(einheit.id, 62)
    })
    await waitFor(() => expect(schreiben).toHaveBeenCalledTimes(1))

    await act(async () => {
      erster.reject(new Error('erster write fehlgeschlagen'))
      await Promise.resolve()
    })
    await waitFor(() => expect(schreiben).toHaveBeenCalledTimes(2))

    expect(schreiben).toHaveBeenNthCalledWith(2, expect.objectContaining({ wert: 61 }), 62)
    expect(Object.values(result.current.zustand.einheiten).flat()[0]?.wert).toBe(62)
    expect(result.current.fehler).toBeNull()
  })

  it('ordnet schnelle lokale Gewichte und Wetten und behaelt jeweils den neuesten Stand', async () => {
    const erstesGewicht = offen<void>()
    const ersteWette = offen<void>()
    const schreibeGewicht = vi.fn<Backend['schreibeGewicht']>()
      .mockImplementationOnce(() => erstesGewicht.promise)
      .mockResolvedValueOnce(undefined)
    const schreibeWette = vi.fn<Backend['schreibeWette']>()
      .mockImplementationOnce(() => ersteWette.promise)
      .mockResolvedValueOnce(undefined)
    const backend = backendMit(async () => ({
      ...ANFANG,
      wetten: { '2026-09-07': 'alt' },
    }), { art: 'lokal', schreibeGewicht, schreibeWette })
    const { result } = renderHook(() => useTracker(backend))
    await waitFor(() => expect(result.current.ladezustand).toBe('bereit'))

    act(() => {
      result.current.setzeGewicht('2026-09-06', 81.2)
      result.current.setzeGewicht('2026-09-06', 81.3)
      result.current.setzeWette('2026-09-07', 'erstes neues')
      result.current.setzeWette('2026-09-07', 'letztes neues')
    })
    await waitFor(() => {
      expect(schreibeGewicht).toHaveBeenCalledTimes(1)
      expect(schreibeWette).toHaveBeenCalledTimes(1)
    })

    await act(async () => {
      erstesGewicht.reject(new Error('erstes gewicht fehlgeschlagen'))
      ersteWette.reject(new Error('erste wette fehlgeschlagen'))
      await Promise.resolve()
    })
    await waitFor(() => {
      expect(schreibeGewicht).toHaveBeenCalledTimes(2)
      expect(schreibeWette).toHaveBeenCalledTimes(2)
    })

    expect(schreibeGewicht).toHaveBeenNthCalledWith(2, '2026-09-06', 81.3)
    expect(schreibeWette).toHaveBeenNthCalledWith(2, '2026-09-07', 'letztes neues')
    expect(result.current.zustand.gewichte['erijon|2026-09-06']).toBe(81.3)
    expect(result.current.wetten['2026-09-07']).toBe('letztes neues')
    expect(result.current.fehler).toBeNull()
  })

  it('faellt nach zwei lokalen Wertfehlern auf den bestaetigten Speicherstand zurueck', async () => {
    const einheit: Einheit = {
      id: 'beide-fehler', user: 'erijon', area: 'lernen', tag: '2026-09-06',
      wert: 60, erfasst: null,
    }
    const kanonisch = {
      ...ANFANG,
      einheiten: { 'erijon|lernen|2026-09-06': [einheit] },
    }
    const laden = vi.fn(async () => kanonisch)
    const schreibeEinheitWert = vi.fn<Backend['schreibeEinheitWert']>()
      .mockRejectedValueOnce(new Error('erster write fehlgeschlagen'))
      .mockRejectedValueOnce(new Error('zweiter write fehlgeschlagen'))
    const backend = backendMit(laden, { art: 'lokal', schreibeEinheitWert })
    const { result } = renderHook(() => useTracker(backend))
    await waitFor(() => expect(result.current.ladezustand).toBe('bereit'))

    act(() => {
      result.current.wertSetzen(einheit.id, 61)
      result.current.wertSetzen(einheit.id, 62)
    })

    await waitFor(() => expect(schreibeEinheitWert).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(laden.mock.calls.length).toBeGreaterThanOrEqual(2))
    await waitFor(() => {
      expect(Object.values(result.current.zustand.einheiten).flat()[0]?.wert).toBe(60)
    })
  })

  it('uebernimmt nach gleichem fehlgeschlagenem und danach erfolgreichem Wert den kanonischen Erfolg', async () => {
    const einheit: Einheit = {
      id: 'gleich-dann-erfolg', user: 'erijon', area: 'lernen', tag: '2026-09-06',
      wert: 60, erfasst: null,
    }
    let kanonisch: Anfangszustand = {
      ...ANFANG,
      einheiten: { 'erijon|lernen|2026-09-06': [einheit] },
    }
    const laden = vi.fn(async () => kanonisch)
    const schreibeEinheitWert = vi.fn<Backend['schreibeEinheitWert']>()
      .mockRejectedValueOnce(new Error('erster write fehlgeschlagen'))
      .mockImplementationOnce(async (_alt, wert) => {
        kanonisch = {
          ...kanonisch,
          einheiten: {
            'erijon|lernen|2026-09-06': [{ ...einheit, wert }],
          },
        }
      })
    const backend = backendMit(laden, { art: 'lokal', schreibeEinheitWert })
    const { result } = renderHook(() => useTracker(backend))
    await waitFor(() => expect(result.current.ladezustand).toBe('bereit'))

    act(() => {
      result.current.wertSetzen(einheit.id, 61)
      result.current.wertSetzen(einheit.id, 61)
    })

    await waitFor(() => expect(schreibeEinheitWert).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(laden.mock.calls.length).toBeGreaterThanOrEqual(2))
    await waitFor(() => {
      expect(Object.values(result.current.zustand.einheiten).flat()[0]?.wert).toBe(61)
    })
  })

  it('setzt auch Gewicht und Wette nach zwei lokalen Fehlern auf die bestaetigte Basis', async () => {
    const kanonisch: Anfangszustand = {
      ...ANFANG,
      gewichte: { 'erijon|2026-09-06': 80 },
      wetten: { '2026-09-07': 'alt' },
    }
    const laden = vi.fn(async () => kanonisch)
    const schreibeGewicht = vi.fn<Backend['schreibeGewicht']>()
      .mockRejectedValue(new Error('gewicht fehlgeschlagen'))
    const schreibeWette = vi.fn<Backend['schreibeWette']>()
      .mockRejectedValue(new Error('wette fehlgeschlagen'))
    const backend = backendMit(laden, {
      art: 'lokal',
      schreibeGewicht,
      schreibeWette,
    })
    const { result } = renderHook(() => useTracker(backend))
    await waitFor(() => expect(result.current.ladezustand).toBe('bereit'))

    act(() => {
      result.current.setzeGewicht('2026-09-06', 81.2)
      result.current.setzeGewicht('2026-09-06', 81.3)
      result.current.setzeWette('2026-09-07', 'neu eins')
      result.current.setzeWette('2026-09-07', 'neu zwei')
    })

    await waitFor(() => expect(schreibeGewicht).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(schreibeWette).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(laden.mock.calls.length).toBeGreaterThanOrEqual(2))
    await waitFor(() => {
      expect(result.current.zustand.gewichte['erijon|2026-09-06']).toBe(80)
      expect(result.current.wetten['2026-09-07']).toBe('alt')
    })
  })
})

describe('useTracker PWA-Neustartschutz', () => {
  it('blockiert waehrend einer pending Mutation und gibt nach Erfolg frei', async () => {
    const antwort = offen<void>()
    const backend = backendMit(async () => ANFANG, {
      schreibeGewicht: vi.fn(() => antwort.promise),
    })
    const { result } = renderHook(() => useTracker(backend))
    await waitFor(() => expect(result.current.ladezustand).toBe('bereit'))

    act(() => result.current.setzeGewicht('2026-09-05', 81.2))
    expect(hatNeustartBlocker()).toBe(true)

    await act(async () => {
      antwort.resolve()
      await antwort.promise
    })
    await waitFor(() => expect(hatNeustartBlocker()).toBe(false))
  })

  it('gibt den Neustartblocker auch nach einer Fehlantwort frei', async () => {
    const antwort = offen<void>()
    const backend = backendMit(async () => ANFANG, {
      schreibeGewicht: vi.fn(() => antwort.promise),
    })
    const { result } = renderHook(() => useTracker(backend))
    await waitFor(() => expect(result.current.ladezustand).toBe('bereit'))

    act(() => result.current.setzeGewicht('2026-09-05', 81.2))
    expect(hatNeustartBlocker()).toBe(true)

    await act(async () => {
      antwort.reject(new Error('netz weg'))
      await Promise.resolve()
    })
    await waitFor(() => expect(hatNeustartBlocker()).toBe(false))
  })

  it('bleibt bei parallelen Mutationen bis zum letzten Abschluss blockiert', async () => {
    const erste = offen<void>()
    const zweite = offen<void>()
    const schreibeGewicht = vi.fn<Backend['schreibeGewicht']>()
      .mockImplementationOnce(() => erste.promise)
      .mockImplementationOnce(() => zweite.promise)
    const backend = backendMit(async () => ANFANG, { schreibeGewicht })
    const { result } = renderHook(() => useTracker(backend))
    await waitFor(() => expect(result.current.ladezustand).toBe('bereit'))

    act(() => {
      result.current.setzeGewicht('2026-09-05', 81.2)
      result.current.setzeGewicht('2026-09-06', 81.1)
    })
    expect(hatNeustartBlocker()).toBe(true)

    await act(async () => {
      erste.resolve()
      await erste.promise
    })
    expect(hatNeustartBlocker()).toBe(true)

    await act(async () => {
      zweite.resolve()
      await zweite.promise
    })
    await waitFor(() => expect(hatNeustartBlocker()).toBe(false))
  })

  it('loest den laufbezogenen Blocker beim Backendwechsel', async () => {
    const antwort = offen<void>()
    const erstes = backendMit(async () => ANFANG, {
      schreibeGewicht: vi.fn(() => antwort.promise),
    })
    const zweites = backendMit(async () => ({ ...ANFANG, me: 'koray' }))
    const { result, rerender } = renderHook(
      ({ backend }) => useTracker(backend),
      { initialProps: { backend: erstes as Backend } }
    )
    await waitFor(() => expect(result.current.ladezustand).toBe('bereit'))

    act(() => result.current.setzeGewicht('2026-09-05', 81.2))
    expect(hatNeustartBlocker()).toBe(true)

    rerender({ backend: zweites })
    await waitFor(() => expect(result.current.me).toBe('koray'))
    expect(hatNeustartBlocker()).toBe(false)
  })
})

describe('useTracker Realtime-Lifecycle', () => {
  it('puffert Ereignisse, die vor dem ersten Snapshot eintreffen', async () => {
    const ersterSnapshot = offen<Anfangszustand>()
    let melde!: (e: BackendEreignis) => void
    const backend = backendMit(() => ersterSnapshot.promise, {
      abonniere: vi.fn((cb) => {
        melde = cb
        return () => {}
      }),
    })
    const { result } = renderHook(() => useTracker(backend))

    // Auch ein UPDATE muss die Initialluecke heilen koennen, falls sein INSERT
    // vor dem Replication-Listener lag.
    act(() => melde({ typ: 'einheit', art: 'wert', einheit: LIVE_EINHEIT }))
    act(() => ersterSnapshot.resolve(ANFANG))

    await waitFor(() => expect(result.current.ladezustand).toBe('bereit'))
    expect(result.current.zustand.einheiten['koray|gym|2026-09-05']).toEqual([
      LIVE_EINHEIT,
    ])
  })

  it('schliesst die Initial-Snapshot-Luecke schon beim SUBSCRIBED-Fallback', async () => {
    let melde!: (e: BackendEreignis) => void
    const nachgeladenerStand: Anfangszustand = {
      ...ANFANG,
      gewichte: { 'koray|2026-09-05': 91.4 },
    }
    const laden = vi.fn<Backend['laden']>()
      .mockResolvedValueOnce(ANFANG)
      .mockResolvedValueOnce(nachgeladenerStand)
    const backend = backendMit(laden, {
      abonniere: vi.fn((cb) => {
        melde = cb
        return () => {}
      }),
    })
    const { result } = renderHook(() => useTracker(backend))
    await waitFor(() => expect(result.current.ladezustand).toBe('bereit'))

    act(() => melde({ typ: 'verbindung', status: 'transportbereit' }))

    await waitFor(() => expect(laden).toHaveBeenCalledTimes(2))
    await waitFor(() => {
      expect(result.current.zustand.gewichte['koray|2026-09-05']).toBe(91.4)
    })
    // Ohne replication_ready-Systemevent ist nur der Snapshot bestaetigt,
    // nicht die lueckenlose weitere Zustellung.
    expect(result.current.synchronisationszustand).toBe('veraltet')
  })

  it('replayt Ereignisse waehrend des Kontrollsnapshots in Empfangsreihenfolge', async () => {
    const kontrollSnapshot = offen<Anfangszustand>()
    let melde!: (e: BackendEreignis) => void
    const laden = vi.fn<Backend['laden']>()
      .mockResolvedValueOnce(ANFANG)
      .mockImplementationOnce(() => kontrollSnapshot.promise)
    const backend = backendMit(laden, {
      abonniere: vi.fn((cb) => {
        melde = cb
        return () => {}
      }),
    })
    const { result } = renderHook(() => useTracker(backend))
    await waitFor(() => expect(result.current.ladezustand).toBe('bereit'))

    act(() => melde({ typ: 'verbindung', status: 'bereit' }))
    await waitFor(() => expect(laden).toHaveBeenCalledTimes(2))
    act(() => {
      melde({ typ: 'gewicht', user: 'koray', tag: '2026-09-05', kg: 91 })
      melde({ typ: 'gewicht', user: 'koray', tag: '2026-09-05', kg: 92 })
    })
    act(() => kontrollSnapshot.resolve({
      ...ANFANG,
      gewichte: { 'koray|2026-09-05': 90 },
    }))

    await waitFor(() => {
      expect(result.current.zustand.gewichte['koray|2026-09-05']).toBe(92)
    })
    expect(result.current.synchronisationszustand).toBe('aktuell')
  })

  it('behaelt bei Kanalfehlern Daten und gleicht nach Reconnect vollstaendig ab', async () => {
    let melde!: (e: BackendEreignis) => void
    const ersterStand: Anfangszustand = {
      ...ANFANG,
      gewichte: { 'erijon|2026-09-05': 81 },
    }
    const neuerStand: Anfangszustand = {
      ...ANFANG,
      gewichte: { 'erijon|2026-09-05': 80.5 },
    }
    const laden = vi.fn<Backend['laden']>()
      .mockResolvedValueOnce(ersterStand)
      .mockResolvedValueOnce(neuerStand)
    const backend = backendMit(laden, {
      abonniere: vi.fn((cb) => {
        melde = cb
        return () => {}
      }),
    })
    const { result } = renderHook(() => useTracker(backend))
    await waitFor(() => expect(result.current.ladezustand).toBe('bereit'))

    act(() => melde({
      typ: 'verbindung',
      status: 'veraltet',
      grund: 'channel_error',
    }))
    expect(result.current.zustand.gewichte['erijon|2026-09-05']).toBe(81)
    expect(result.current.synchronisationszustand).toBe('veraltet')

    act(() => melde({ typ: 'verbindung', status: 'bereit' }))
    await waitFor(() => {
      expect(result.current.zustand.gewichte['erijon|2026-09-05']).toBe(80.5)
    })
    expect(result.current.synchronisationszustand).toBe('aktuell')
  })

  it('behaelt bei fehlgeschlagenem Snapshot den Stand und replayt den Eventpuffer', async () => {
    const kontrollSnapshot = offen<Anfangszustand>()
    let melde!: (e: BackendEreignis) => void
    const laden = vi.fn<Backend['laden']>()
      .mockResolvedValueOnce({
        ...ANFANG,
        gewichte: { 'koray|2026-09-05': 90 },
      })
      .mockImplementationOnce(() => kontrollSnapshot.promise)
    const backend = backendMit(laden, {
      abonniere: vi.fn((cb) => {
        melde = cb
        return () => {}
      }),
    })
    const { result } = renderHook(() => useTracker(backend))
    await waitFor(() => expect(result.current.ladezustand).toBe('bereit'))

    act(() => melde({ typ: 'verbindung', status: 'bereit' }))
    await waitFor(() => expect(laden).toHaveBeenCalledTimes(2))
    act(() => melde({ typ: 'gewicht', user: 'koray', tag: '2026-09-05', kg: 92 }))
    act(() => kontrollSnapshot.reject(new Error('netz weg')))

    await waitFor(() => expect(result.current.synchronisationszustand).toBe('veraltet'))
    expect(result.current.zustand.gewichte['koray|2026-09-05']).toBe(92)
  })

  it('wartet vor dem Resync auf lokale Mutationen und sperrt neue Writes', async () => {
    const gewichtAntwort = offen<void>()
    let melde!: (e: BackendEreignis) => void
    const laden = vi.fn<Backend['laden']>()
      .mockResolvedValueOnce(ANFANG)
      .mockResolvedValueOnce({
        ...ANFANG,
        gewichte: { 'erijon|2026-09-05': 81.2 },
      })
    const schreibeGewicht = vi.fn(() => gewichtAntwort.promise)
    const schreibeWette = vi.fn(async () => {})
    const backend = backendMit(laden, {
      schreibeGewicht,
      schreibeWette,
      abonniere: vi.fn((cb) => {
        melde = cb
        return () => {}
      }),
    })
    const { result } = renderHook(() => useTracker(backend))
    await waitFor(() => expect(result.current.ladezustand).toBe('bereit'))

    act(() => result.current.setzeGewicht('2026-09-05', 81.2))
    act(() => melde({ typ: 'verbindung', status: 'bereit' }))
    await act(async () => Promise.resolve())
    expect(laden).toHaveBeenCalledTimes(1)
    expect(result.current.zustand.gewichte['erijon|2026-09-05']).toBe(81.2)

    act(() => result.current.setzeWette('2026-09-01', 'kein write im abgleich'))
    expect(schreibeWette).not.toHaveBeenCalled()

    await act(async () => {
      gewichtAntwort.resolve()
      await gewichtAntwort.promise
    })
    await waitFor(() => expect(laden).toHaveBeenCalledTimes(2))
    await waitFor(() => {
      expect(result.current.synchronisationszustand).toBe('aktuell')
    })
  })

  it('ueberschreibt auch nach dem Wartezeitlimit keine offene optimistische Mutation', async () => {
    const gewichtAntwort = offen<void>()
    let melde!: (e: BackendEreignis) => void
    const laden = vi.fn<Backend['laden']>()
      .mockResolvedValueOnce(ANFANG)
      .mockResolvedValueOnce({
        ...ANFANG,
        gewichte: { 'erijon|2026-09-05': 81.2 },
      })
    const backend = backendMit(laden, {
      schreibeGewicht: vi.fn(() => gewichtAntwort.promise),
      abonniere: vi.fn((cb) => {
        melde = cb
        return () => {}
      }),
    })
    const { result } = renderHook(() => useTracker(backend))
    await waitFor(() => expect(result.current.ladezustand).toBe('bereit'))

    vi.useFakeTimers()
    act(() => result.current.setzeGewicht('2026-09-05', 81.2))
    act(() => melde({ typ: 'verbindung', status: 'bereit' }))
    act(() => melde({ typ: 'gewicht', user: 'erijon', tag: '2026-09-05', kg: 70 }))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_001)
    })

    expect(laden).toHaveBeenCalledTimes(1)
    expect(result.current.zustand.gewichte['erijon|2026-09-05']).toBe(81.2)
    expect(result.current.synchronisationszustand).toBe('veraltet')

    vi.useRealTimers()
    await act(async () => {
      gewichtAntwort.resolve()
      await gewichtAntwort.promise
    })
    await waitFor(() => expect(laden).toHaveBeenCalledTimes(2))
    await waitFor(() => {
      expect(result.current.zustand.gewichte['erijon|2026-09-05']).toBe(81.2)
    })
    expect(result.current.synchronisationszustand).toBe('aktuell')
  })

  it('ignoriert spaete Snapshots und Events eines alten Backend-Laufs und raeumt ihn auf', async () => {
    const alterSnapshot = offen<Anfangszustand>()
    let meldeAlt!: (e: BackendEreignis) => void
    const abmeldenAlt = vi.fn()
    const erstesLaden = vi.fn<Backend['laden']>()
      .mockResolvedValueOnce(ANFANG)
      .mockImplementationOnce(() => alterSnapshot.promise)
    const erstes = backendMit(erstesLaden, {
      abonniere: vi.fn((cb) => {
        meldeAlt = cb
        return abmeldenAlt
      }),
    })
    const zweiterStand: Anfangszustand = {
      ...ANFANG,
      me: 'koray',
      gewichte: { 'koray|2026-09-05': 90 },
    }
    const zweites = backendMit(async () => zweiterStand)
    const { result, rerender } = renderHook(
      ({ backend }) => useTracker(backend),
      { initialProps: { backend: erstes as Backend } }
    )
    await waitFor(() => expect(result.current.ladezustand).toBe('bereit'))
    act(() => meldeAlt({ typ: 'verbindung', status: 'bereit' }))
    await waitFor(() => expect(erstesLaden).toHaveBeenCalledTimes(2))

    rerender({ backend: zweites })
    await waitFor(() => expect(result.current.me).toBe('koray'))
    expect(abmeldenAlt).toHaveBeenCalledTimes(1)

    act(() => meldeAlt({ typ: 'einheit', art: 'neu', einheit: LIVE_EINHEIT }))
    act(() => alterSnapshot.resolve({
      ...ANFANG,
      gewichte: { 'erijon|2026-09-05': 70 },
    }))
    await act(async () => Promise.resolve())

    expect(result.current.me).toBe('koray')
    expect(result.current.zustand.gewichte).toEqual({ 'koray|2026-09-05': 90 })
    expect(result.current.zustand.einheiten).toEqual({})
  })

  it('verwirft einen Snapshot aus einer getrennten Epoche und fuehrt genau einen Folgeabgleich aus', async () => {
    const alterSnapshot = offen<Anfangszustand>()
    let melde!: (e: BackendEreignis) => void
    const endstand: Anfangszustand = {
      ...ANFANG,
      gewichte: { 'koray|2026-09-05': 93 },
    }
    const laden = vi.fn<Backend['laden']>()
      .mockResolvedValueOnce(ANFANG)
      .mockImplementationOnce(() => alterSnapshot.promise)
      .mockResolvedValueOnce(endstand)
    const backend = backendMit(laden, {
      abonniere: vi.fn((cb) => {
        melde = cb
        return () => {}
      }),
    })
    const { result } = renderHook(() => useTracker(backend))
    await waitFor(() => expect(result.current.ladezustand).toBe('bereit'))
    act(() => melde({ typ: 'verbindung', status: 'bereit' }))
    await waitFor(() => expect(laden).toHaveBeenCalledTimes(2))

    act(() => melde({ typ: 'verbindung', status: 'veraltet', grund: 'closed' }))
    act(() => melde({ typ: 'verbindung', status: 'transportbereit' }))
    act(() => melde({ typ: 'verbindung', status: 'bereit' }))
    act(() => alterSnapshot.resolve({
      ...ANFANG,
      gewichte: { 'koray|2026-09-05': 60 },
    }))

    await waitFor(() => expect(laden).toHaveBeenCalledTimes(3))
    await waitFor(() => {
      expect(result.current.zustand.gewichte['koray|2026-09-05']).toBe(93)
    })
    expect(laden).toHaveBeenCalledTimes(3)
    expect(result.current.synchronisationszustand).toBe('aktuell')
  })

  it('drosselt einen Online-Eventsturm auf einen unmittelbaren Kontrollabgleich', async () => {
    const kontrollSnapshot = offen<Anfangszustand>()
    const laden = vi.fn<Backend['laden']>()
      .mockResolvedValueOnce(ANFANG)
      .mockImplementationOnce(() => kontrollSnapshot.promise)
    const backend = backendMit(laden)
    const { result } = renderHook(() => useTracker(backend))
    await waitFor(() => expect(result.current.ladezustand).toBe('bereit'))

    act(() => {
      window.dispatchEvent(new Event('online'))
      window.dispatchEvent(new Event('online'))
      window.dispatchEvent(new Event('online'))
    })
    await waitFor(() => expect(laden).toHaveBeenCalledTimes(2))

    act(() => kontrollSnapshot.resolve(ANFANG))
    await waitFor(() => expect(result.current.synchronisationszustand).toBe('veraltet'))
    expect(laden).toHaveBeenCalledTimes(2)
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
