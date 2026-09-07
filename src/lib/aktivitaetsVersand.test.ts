import type { sende } from '../../supabase/functions/_shared/webpush'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { versendeAktivitaeten } from '../../supabase/functions/_shared/aktivitaetsVersand'

const kandidat = { user_id: 'test', art: 'lesen', tag: '2026-09-07', nachricht: 'lesen?' }
const key = { oeffentlich: '', privat: '', kontakt: '' }
let rpc: ReturnType<typeof vi.fn>
let senden: ReturnType<typeof vi.fn<typeof sende>>
let update: ReturnType<typeof vi.fn>
type VersandDb = Parameters<typeof versendeAktivitaeten>[0]
let db: VersandDb
const jetzt = () => new Date('2026-09-07T19:00:00Z')

beforeEach(() => {
  rpc = vi.fn().mockImplementation(async (name: string) => ({ data: name === 'reserviere_aktivitaetsversand' ? true : [kandidat], error: null }))
  senden = vi.fn().mockResolvedValue({ status: 201, weg: false, fehler: null })
  update = vi.fn().mockReturnValue({ match: () => ({ select: () => ({ maybeSingle: async () => ({ data: { art: 'lesen' }, error: null }) }) }) })
  db = { rpc, from: () => ({
    select: () => ({ eq: async () => ({ data: [{ endpoint: 'https://web.push.apple.com/test', p256dh: '', auth: '' }], error: null }) }),
    update,
  }) } as unknown as VersandDb
})

describe('aktivitaeten ohne doppelte oder veraltete Pushs', () => {
  it('sendet frisch gelesenen Text mit TTL 0', async () => {
    rpc.mockResolvedValueOnce({ data: [kandidat] }).mockResolvedValueOnce({ data: true })
      .mockResolvedValueOnce({ data: [{ ...kandidat, nachricht: 'aktuell' }] })
    expect(await versendeAktivitaeten(db, key, { senden, jetzt })).toEqual({ gesendet: 1, fehler: 0, uebersprungen: 0 })
    expect(senden).toHaveBeenCalledWith(expect.anything(), expect.stringContaining('aktuell'), key, 0)
  })
  it('unterdrueckt einen parallelen zweiten Aufruf ohne Reservierung', async () => {
    rpc.mockResolvedValueOnce({ data: [kandidat] }).mockResolvedValueOnce({ data: false })
    await versendeAktivitaeten(db, key, { senden, jetzt })
    expect(senden).not.toHaveBeenCalled()
  })
  it('sendet nicht, wenn inzwischen erledigt, ausgeschaltet oder eine Sitzung gestartet wurde', async () => {
    rpc.mockResolvedValueOnce({ data: [kandidat] }).mockResolvedValueOnce({ data: true }).mockResolvedValueOnce({ data: [] })
    await versendeAktivitaeten(db, key, { senden, jetzt })
    expect(senden).not.toHaveBeenCalled()
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ zustand: 'uebersprungen' }))
  })
  it('bricht bei Datenbankfehler vor Versand ab', async () => {
    rpc.mockResolvedValueOnce({ data: [kandidat] }).mockResolvedValueOnce({ data: true })
      .mockResolvedValueOnce({ error: { message: 'offline' } })
    const result = await versendeAktivitaeten(db, key, { senden, jetzt })
    expect(result.fehler).toBe(1)
    expect(senden).not.toHaveBeenCalled()
  })
  it('sendet auch bei veraltetem Kandidaten nach 22 Uhr nicht', async () => {
    await versendeAktivitaeten(db, key, { senden, jetzt: () => new Date('2026-09-07T20:00:00Z') })
    expect(senden).not.toHaveBeenCalled()
  })
  it('bewahrt eine unklare Providerantwort ohne Freigabe zum Wiederholen', async () => {
    senden.mockRejectedValue(new Error('timeout'))
    await versendeAktivitaeten(db, key, { senden, jetzt })
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ zustand: 'unbestaetigt' }))
    expect(rpc.mock.calls.filter(([name]) => name === 'reserviere_aktivitaetsversand')).toHaveLength(1)
  })
})
