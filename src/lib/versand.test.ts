import { afterEach, describe, expect, it, vi } from 'vitest'
import { versende } from '../../supabase/functions/_shared/versand'

const SCHLUESSEL = {
  oeffentlich: 'nicht benoetigt',
  privat: 'nicht benoetigt',
  kontakt: 'mailto:test@example.com',
}

describe('gemeinsamer erinnerungsversand', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('entfernt einen unzulässigen alt-endpunkt ohne netzwerkzugriff', async () => {
    const endpoint = 'https://127.0.0.1/interner-dienst'
    const endpunkteLoeschen = vi.fn(async () => ({ data: [{ endpoint }], error: null }))
    const endpunkteWaehlen = vi.fn((_spalte: string, _werte: string[]) => ({
      select: endpunkteLoeschen,
    }))
    const reservierungLoeschen = vi.fn(async () => ({ error: null }))
    const from = vi.fn((tabelle: string) => {
      if (tabelle === 'push_abos') {
        return {
          select: () => ({
            eq: async () => ({
              data: [{ endpoint, p256dh: 'egal', auth: 'egal', geraet: 'test' }],
              error: null,
            }),
          }),
          delete: () => ({ in: endpunkteWaehlen }),
        }
      }
      if (tabelle === 'erinnerungs_versand') {
        return {
          insert: async () => ({ error: null }),
          delete: () => ({ match: reservierungLoeschen }),
        }
      }
      throw new Error(`unerwartete tabelle ${tabelle}`)
    })
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const ergebnis = await versende(
      { from } as never,
      'gewicht',
      '2026-09-04',
      ['user-1'],
      { titel: 'zweikampf', text: 'probe', tag: 'probe', url: './' },
      SCHLUESSEL
    )

    expect(ergebnis).toEqual({ gesendet: 0, uebersprungen: 0, entfernt: 1, fehler: 1 })
    expect(endpunkteWaehlen).toHaveBeenCalledWith('endpoint', [endpoint])
    expect(endpunkteLoeschen).toHaveBeenCalledWith('endpoint')
    expect(reservierungLoeschen).toHaveBeenCalledWith({
      user_id: 'user-1',
      art: 'gewicht',
      tag: '2026-09-04',
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('behauptet keine löschung, wenn die datenbank null zeilen bestätigt', async () => {
    const endpoint = 'https://localhost/intern'
    const endpunkteLoeschen = vi.fn(async () => ({ data: [], error: null }))
    const from = vi.fn((tabelle: string) => {
      if (tabelle === 'push_abos') {
        return {
          select: () => ({
            eq: async () => ({
              data: [{ endpoint, p256dh: 'egal', auth: 'egal' }],
              error: null,
            }),
          }),
          delete: () => ({
            in: () => ({ select: endpunkteLoeschen }),
          }),
        }
      }
      return {
        insert: async () => ({ error: null }),
        delete: () => ({ match: async () => ({ error: null }) }),
      }
    })
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    const ergebnis = await versende(
      { from } as never,
      'schlaf',
      '2026-09-04',
      ['user-1'],
      { titel: 'zweikampf', text: 'probe', tag: 'probe', url: './' },
      SCHLUESSEL
    )

    expect(ergebnis.entfernt).toBe(0)
    expect(ergebnis.fehler).toBe(2)
    expect(error).toHaveBeenCalledWith(
      'schlaf-erinnerung: alte abos konnten nicht vollständig entfernt werden'
    )
  })
})
