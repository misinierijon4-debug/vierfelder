// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { lokalesBerichtArchiv, useWochenberichtArchiv } from './wochenberichtArchiv'
import type { Zustand } from './types'
const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }))
vi.mock('./supabase', () => ({ supabase: { functions: { invoke } } }))
const zustand: Zustand = { einheiten: {}, gewichte: { 'erijon|2026-09-14': 70 }, aufenthalte: [] }
const archiv = (woche = '2026-09-14') => ({ woche, daten: { zustand, naechte: [] }, quelle: 'montag', texte: null, eingefroren: '2026-09-20T22:00:00Z' })
afterEach(() => { cleanup(); localStorage.clear(); vi.resetAllMocks() })

describe('berichtarchiv', () => {
  it('behaelt lokal die erste vollstaendige Momentaufnahme', () => {
    const erstes = lokalesBerichtArchiv('2026-09-14', zustand, [], localStorage)
    const zweites = lokalesBerichtArchiv('2026-09-14', { ...zustand, gewichte: {} }, [], localStorage)
    expect(zweites).toEqual(erstes)
    expect(zweites.daten.zustand.gewichte['erijon|2026-09-14']).toBe(70)
  })
  it('archiviert weder laufende Wochen noch einen unvollstaendigen Ladezustand', () => {
    const { result, rerender } = renderHook(({ bereit, woche }) => useWochenberichtArchiv(woche, zustand, [], '2026-09-21', false, bereit), { initialProps: { bereit: false, woche: '2026-09-14' } })
    expect(invoke).not.toHaveBeenCalled()
    rerender({ bereit: true, woche: '2026-09-21' })
    expect(result.current.status).toBe('offen')
    expect(invoke).not.toHaveBeenCalled()
  })
  it('behaelt eingefrorene Zahlen auch bei Modellfehlern', async () => {
    invoke.mockResolvedValueOnce({ data: archiv(), error: null }).mockResolvedValueOnce({ data: null, error: new Error('offline') })
    const { result } = renderHook(() => useWochenberichtArchiv('2026-09-14', { ...zustand, gewichte: {} }, [], '2026-09-21', false, true))
    await waitFor(() => expect(result.current.status).toBe('fehlt'))
    expect(result.current.bericht?.punkte.erijon).toBe(1)
    expect(result.current.hinweis).toBe('am montag eingefroren')
  })
  it('verwirft verspaetete Antworten nach dem Wochenwechsel', async () => {
    let antwort!: (value: unknown) => void
    invoke.mockImplementationOnce(() => new Promise(resolve => { antwort = resolve }))
    const { result, rerender } = renderHook(({ woche }) => useWochenberichtArchiv(woche, zustand, [], '2026-09-21', false, true), { initialProps: { woche: '2026-09-14' } })
    rerender({ woche: '2026-09-21' })
    await act(async () => antwort({ data: archiv(), error: null }))
    expect(result.current.bericht).toBeNull()
    expect(result.current.texte).toBeNull()
    expect(result.current.status).toBe('offen')
    expect(invoke).toHaveBeenCalledTimes(1)
  })
})
