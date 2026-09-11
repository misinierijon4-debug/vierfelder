import { beforeEach, describe, expect, it, vi } from 'vitest'

const mock = vi.hoisted(() => ({
  getSession: vi.fn(),
  from: vi.fn(),
  upsert: vi.fn(),
  select: vi.fn(),
  maybeSingle: vi.fn(),
}))

vi.mock('./supabase', () => ({
  supabase: {
    auth: { getSession: mock.getSession },
    from: mock.from,
  },
}))

import { setzeGewichtAktiv, setzeGewichtErinnerungszeit } from './erinnerung'

const USER_ID = '11111111-1111-4111-8111-111111111111'

function bestaetigung(
  aenderung: Partial<{
    user_id: string
    gewicht_aktiv: boolean
    gewicht_zeit: string
    aktualisiert: string
  }> = {}
) {
  mock.upsert.mockImplementation((zeile) => {
    mock.maybeSingle.mockResolvedValue({
      data: {
        ...zeile,
        gewicht_zeit: zeile.gewicht_zeit ? `${zeile.gewicht_zeit}:00` : undefined,
        ...aenderung,
      },
      error: null,
    })
    return { select: mock.select }
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  mock.getSession.mockResolvedValue({
    data: { session: { user: { id: USER_ID }, access_token: 'nicht-ausgeben' } },
    error: null,
  })
  mock.from.mockReturnValue({ upsert: mock.upsert })
  mock.select.mockReturnValue({ maybeSingle: mock.maybeSingle })
  bestaetigung()
})

describe('erinnerungszeit bestaetigt speichern', () => {
  it('akzeptiert nur die exakt persistierte eigene einstellung', async () => {
    await expect(setzeGewichtErinnerungszeit('20:30')).resolves.toBeUndefined()

    expect(mock.from).toHaveBeenCalledWith('erinnerungs_einstellungen')
    expect(mock.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: USER_ID,
        gewicht_aktiv: true,
        gewicht_zeit: '20:30',
        aktualisiert: expect.any(String),
      }),
      { onConflict: 'user_id' }
    )
    expect(mock.select).toHaveBeenCalledWith(
      'user_id,gewicht_aktiv,gewicht_zeit,aktualisiert'
    )
  })

  it('wertet einen fehlerlosen rls-nulltreffer nicht als erfolg', async () => {
    mock.upsert.mockReturnValue({ select: mock.select })
    mock.maybeSingle.mockResolvedValue({ data: null, error: null })

    await expect(setzeGewichtErinnerungszeit('20:30')).rejects.toThrow(
      'konnte nicht bestätigt werden'
    )
  })

  it.each([
    ['fremder nutzer', { user_id: '22222222-2222-4222-8222-222222222222' }],
    ['inaktiv', { gewicht_aktiv: false }],
    ['andere uhrzeit', { gewicht_zeit: '20:31:00' }],
    ['abweichende sekunden', { gewicht_zeit: '20:30:01' }],
    ['anderer zeitpunkt', { aktualisiert: '2020-01-01T00:00:00.000Z' }],
  ])('weist eine abweichende bestätigung zurück: %s', async (_name, aenderung) => {
    bestaetigung(aenderung)

    await expect(setzeGewichtErinnerungszeit('20:30')).rejects.toThrow(
      'konnte nicht bestätigt werden'
    )
  })

  it('meldet einen sitzungsfehler als prüffehler statt als logout', async () => {
    mock.getSession.mockResolvedValue({
      data: { session: null },
      error: { message: 'network request failed' },
    })

    await expect(setzeGewichtErinnerungszeit('20:30')).rejects.toThrow(
      'anmeldung konnte nicht geprüft werden'
    )
    expect(mock.from).not.toHaveBeenCalled()
  })

  it('meldet einen datenbankfehler ohne ihn als erfolg zu behandeln', async () => {
    mock.upsert.mockReturnValue({ select: mock.select })
    mock.maybeSingle.mockResolvedValue({ data: null, error: { message: 'network request failed' } })

    await expect(setzeGewichtErinnerungszeit('20:30')).rejects.toThrow(
      'konnte nicht bestätigt werden'
    )
  })
})

describe('gewicht_aktiv bestaetigt speichern', () => {
  it('speichert das aktiv-flag bestätigt ab', async () => {
    await expect(setzeGewichtAktiv(false)).resolves.toBeUndefined()
    expect(mock.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: USER_ID,
        gewicht_aktiv: false,
        aktualisiert: expect.any(String),
      }),
      { onConflict: 'user_id' }
    )
  })

  it('verwirft abweichende Bestätigung', async () => {
    mock.upsert.mockImplementation((zeile) => {
      mock.maybeSingle.mockResolvedValue({
        data: { ...zeile, gewicht_aktiv: true },
        error: null,
      })
      return { select: mock.select }
    })
    await expect(setzeGewichtAktiv(false)).rejects.toThrow('konnte nicht bestätigt werden')
  })
})