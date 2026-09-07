import { beforeEach, expect, it, vi } from 'vitest'
const m = vi.hoisted(() => ({ getSession: vi.fn(), upsert: vi.fn(), maybeSingle: vi.fn() }))
vi.mock('./supabase', () => ({ supabase: {
  auth: { getSession: m.getSession },
  from: () => ({ upsert: m.upsert }),
} }))
import { setzeAktivitaetsErinnerung } from './aktivitaetsErinnerung'

beforeEach(() => {
  vi.resetAllMocks()
  m.getSession.mockResolvedValue({ data: { session: { user: { id: 'me' } } }, error: null })
  m.upsert.mockImplementation(zeile => {
    m.maybeSingle.mockResolvedValue({ data: zeile, error: null })
    return { select: () => ({ maybeSingle: m.maybeSingle }) }
  })
})
it('aendert ausschliesslich die gewaehlte Erinnerung', async () => {
  await setzeAktivitaetsErinnerung('lesen', false)
  expect(m.upsert).toHaveBeenCalledWith({ user_id: 'me', lesen_aktiv: false, aktualisiert: expect.any(String) }, { onConflict: 'user_id' })
})
it('akzeptiert keinen RLS-Nulltreffer als gespeichert', async () => {
  m.upsert.mockReturnValue({ select: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) })
  await expect(setzeAktivitaetsErinnerung('lernen', false)).rejects.toThrow('nicht bestätigt')
})
