import { describe, expect, it, vi } from 'vitest'
import type { Abrechnung } from './types'
import { istFehlendeVonSpalte, schreibeUndBestaetigeAbrechnung } from './supabase'

describe('supabase migrationskompatibilitaet', () => {
  it('erkennt fehlende von-spalten aus postgres und postgrest', () => {
    expect(istFehlendeVonSpalte('42703')).toBe(true)
    expect(istFehlendeVonSpalte('PGRST204')).toBe(true)
    expect(istFehlendeVonSpalte('PGRST205')).toBe(false)
    expect(istFehlendeVonSpalte()).toBe(false)
  })
})

const KANDIDAT: Abrechnung = {
  woche: '2026-08-31',
  sieger: 'koray',
  grund: 'punkte',
  differenz: -1,
  belegErijon: 5,
  belegKoray: 7,
  wette: 'verlierer kocht',
  abgeschlossen: '2026-09-06T16:00:00.000Z',
}

function abrechnungDb(
  data: Record<string, unknown> | null,
  selectError: unknown = null,
  insertError: unknown = null
) {
  const single = vi.fn(async () => ({ data, error: selectError }))
  const eq = vi.fn(() => ({ single }))
  const select = vi.fn(() => ({ eq }))
  const upsert = vi.fn(async () => ({ error: insertError }))
  const from = vi.fn(() => ({ upsert, select }))
  return { db: { from }, from, upsert, select, eq, single }
}

describe('kanonische Wochenabrechnung', () => {
  it('liest nach einem konfliktfreien Insert die tatsaechlich gespeicherte Zeile', async () => {
    const zeile = {
      woche: KANDIDAT.woche,
      sieger: 'erijon',
      grund: 'beleg',
      differenz: '0',
      beleg_erijon: '9',
      beleg_koray: '7',
      wette: 'erste wette',
      abgeschlossen: '2026-09-06T16:05:00.000Z',
    }
    const fake = abrechnungDb(zeile)

    const bestaetigt = await schreibeUndBestaetigeAbrechnung(
      fake.db as unknown as Parameters<typeof schreibeUndBestaetigeAbrechnung>[0],
      KANDIDAT
    )

    expect(fake.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ woche: KANDIDAT.woche, sieger: 'koray' }),
      { onConflict: 'woche', ignoreDuplicates: true }
    )
    expect(fake.eq).toHaveBeenCalledWith('woche', KANDIDAT.woche)
    expect(bestaetigt).toEqual({
      woche: KANDIDAT.woche,
      sieger: 'erijon',
      grund: 'beleg',
      differenz: 0,
      belegErijon: 9,
      belegKoray: 7,
      wette: 'erste wette',
      abgeschlossen: '2026-09-06T16:05:00.000Z',
    })
  })

  it('lehnt Insert-, Lesefehler und eine nicht bestaetigte Nullzeile ab', async () => {
    const insertFehler = { code: '42501' }
    const leseFehler = { code: 'PGRST116' }

    await expect(schreibeUndBestaetigeAbrechnung(
      abrechnungDb(null, null, insertFehler).db as unknown as Parameters<typeof schreibeUndBestaetigeAbrechnung>[0],
      KANDIDAT
    )).rejects.toBe(insertFehler)
    await expect(schreibeUndBestaetigeAbrechnung(
      abrechnungDb(null, leseFehler).db as unknown as Parameters<typeof schreibeUndBestaetigeAbrechnung>[0],
      KANDIDAT
    )).rejects.toBe(leseFehler)
    await expect(schreibeUndBestaetigeAbrechnung(
      abrechnungDb(null).db as unknown as Parameters<typeof schreibeUndBestaetigeAbrechnung>[0],
      KANDIDAT
    )).rejects.toThrow('wurde nicht bestaetigt')
  })
})
