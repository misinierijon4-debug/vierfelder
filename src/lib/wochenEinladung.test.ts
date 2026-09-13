import { beforeEach, describe, expect, it, vi } from 'vitest'

const mock = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock('./supabase', () => ({ supabase: { rpc: mock.rpc } }))

import {
  istFehlendesWochenEinladungSchema,
  ladeEniWochenEinladungen,
  oeffneEniWochenchat,
  schliesseEniWochenEinladung,
} from './wochenEinladung'

function zeile(wochenbeginn: string, geschlossen_am: string | null = null) {
  return {
    wochenbeginn,
    faellig_am: '2026-09-20T18:00:00+02:00',
    geschlossen_am,
    erstellt: `${wochenbeginn}T18:00:00+02:00`,
  }
}

beforeEach(() => vi.clearAllMocks())

describe('wochenEinladung', () => {
  it('liest offene, valide Reihen und sortiert den aeltesten Wochenmontag zuerst', async () => {
    mock.rpc.mockResolvedValue({
      data: [
        zeile('2026-09-21'),
        zeile('2026-09-07', '2026-09-20T20:00:00+02:00'),
        zeile('2026-09-14'),
        zeile('2026-02-30'),
      ],
      error: null,
    })

    await expect(ladeEniWochenEinladungen()).resolves.toEqual([
      zeile('2026-09-14'),
      zeile('2026-09-21'),
    ])
    expect(mock.rpc).toHaveBeenCalledWith('hole_eni_wochen_einladungen')
  })

  it('gibt bei noch fehlendem Schema eine leere Liste zurueck', async () => {
    const error = { code: 'PGRST202' }
    mock.rpc.mockResolvedValue({ data: null, error })

    await expect(ladeEniWochenEinladungen()).resolves.toEqual([])
    expect(istFehlendesWochenEinladungSchema(error)).toBe(true)
  })

  it('fordert das Schliessen fuer genau den Wochenmontag an und bestaetigt dieselbe Zeile', async () => {
    mock.rpc.mockResolvedValue({ data: [zeile('2026-09-14', '2026-09-20T20:01:00+02:00')], error: null })

    await expect(schliesseEniWochenEinladung('2026-09-14')).resolves.toEqual(
      zeile('2026-09-14', '2026-09-20T20:01:00+02:00'),
    )
    expect(mock.rpc).toHaveBeenCalledWith('schliesse_eni_wochen_einladung', {
      p_wochenbeginn: '2026-09-14',
    })
  })

  it('laesst einen Nulltreffer als offenen Fehlerfall zurueck', async () => {
    mock.rpc.mockResolvedValue({ data: [], error: null })
    await expect(schliesseEniWochenEinladung('2026-09-14')).resolves.toBeNull()
  })

  it('weist eine unbestaetigte oder fremde Schliesszeile zurueck', async () => {
    mock.rpc.mockResolvedValue({ data: [zeile('2026-09-21')], error: null })
    await expect(schliesseEniWochenEinladung('2026-09-14')).rejects.toThrow(/nicht bestätigt/i)
  })

  it('oeffnet den Wochenchat ueber die RPC und mappt den Datensatz', async () => {
    mock.rpc.mockResolvedValue({
      data: [{
        id: 'chat-123',
        titel: 'ENI-Wochenrueckblick 14.09.2026',
        zuletzt: '2026-09-20T20:00:00Z',
        wochenbeginn: '2026-09-14',
      }],
      error: null,
    })

    await expect(oeffneEniWochenchat('2026-09-14')).resolves.toEqual({
      id: 'chat-123',
      titel: 'ENI-Wochenrueckblick 14.09.2026',
      zuletzt: '2026-09-20T20:00:00Z',
      wochenbeginn: '2026-09-14',
    })
    expect(mock.rpc).toHaveBeenCalledWith('oeffne_eni_wochenchat', {
      p_wochenbeginn: '2026-09-14',
    })
  })
})
