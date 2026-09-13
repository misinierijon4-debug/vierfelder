import { beforeEach, expect, it, vi } from 'vitest'
const m = vi.hoisted(() => ({
  getSession: vi.fn(),
  upsert: vi.fn(),
  select: vi.fn(),
  maybeSingle: vi.fn(),
}))
vi.mock('./supabase', () => ({ supabase: {
  auth: { getSession: m.getSession },
  from: () => ({ upsert: m.upsert, select: m.select }),
} }))
import {
  ladeAktivitaetsErinnerungen,
  setzeAktivitaetsErinnerung,
} from './aktivitaetsErinnerung'

beforeEach(() => {
  vi.resetAllMocks()
  m.getSession.mockResolvedValue({ data: { session: { user: { id: 'me' } } }, error: null })
  m.upsert.mockImplementation(zeile => {
    m.maybeSingle.mockResolvedValue({ data: zeile, error: null })
    return { select: () => ({ maybeSingle: m.maybeSingle }) }
  })
  m.select.mockReturnValue({ maybeSingle: m.maybeSingle })
})
it('aendert ausschliesslich die gewaehlte Erinnerung', async () => {
  await setzeAktivitaetsErinnerung('lesen', false)
  expect(m.upsert).toHaveBeenCalledWith({ user_id: 'me', lesen_aktiv: false, aktualisiert: expect.any(String) }, { onConflict: 'user_id' })
})

it('schreibt die neuen Partner- und Wochenrueckblick-Flags mit exakter Bestaetigung', async () => {
  await setzeAktivitaetsErinnerung('partner', false)
  expect(m.upsert).toHaveBeenCalledWith(
    { user_id: 'me', partner_aktiv: false, aktualisiert: expect.any(String) },
    { onConflict: 'user_id' },
  )
})

it('faellt bei fehlenden neuen Spalten auf den alten Einstellungen-Vertrag zurueck', async () => {
  m.select.mockImplementation((spalten: string) => ({
    maybeSingle: spalten.includes('partner_aktiv')
      ? async () => ({ data: null, error: { code: '42703' } })
      : async () => ({
          data: { lernen_aktiv: false, lesen_aktiv: true, wochenblick_aktiv: false },
          error: null,
        }),
  }))

  await expect(ladeAktivitaetsErinnerungen()).resolves.toEqual({
    lernen_aktiv: false,
    lesen_aktiv: true,
    wochenblick_aktiv: false,
    partner_aktiv: true,
    wochenrueckblick_aktiv: true,
  })
})
it('akzeptiert keinen RLS-Nulltreffer als gespeichert', async () => {
  m.upsert.mockReturnValue({ select: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) })
  await expect(setzeAktivitaetsErinnerung('lernen', false)).rejects.toThrow('nicht bestätigt')
})
