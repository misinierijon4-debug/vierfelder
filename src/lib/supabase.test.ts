import { describe, expect, it, vi } from 'vitest'
import type { Abrechnung, Phase } from './types'
import {
  finalisiereUndBestaetigeAbrechnung,
  istFehlendeVonSpalte,
  phasenAusAnsicht,
  realtimeBigintId,
  realtimeLoeschId,
  realtimeTextId,
} from './supabase'

describe('supabase migrationskompatibilitaet', () => {
  it('erkennt fehlende von-spalten aus postgres und postgrest', () => {
    expect(istFehlendeVonSpalte('42703')).toBe(true)
    expect(istFehlendeVonSpalte('PGRST204')).toBe(true)
    expect(istFehlendeVonSpalte('PGRST205')).toBe(false)
    expect(istFehlendeVonSpalte()).toBe(false)
  })

  it('liest Realtime-Deletes ausschliesslich aus dem Primaerschluessel', () => {
    expect(realtimeTextId({ id: 'uuid-1' })).toBe('uuid-1')
    expect(realtimeTextId({ id: 1, user_id: 'nicht-noetig' })).toBeNull()
    expect(realtimeTextId({ user_id: 'nur-vollzeilenfeld' })).toBeNull()

    expect(realtimeBigintId({ id: 42 })).toBe('42')
    expect(realtimeBigintId({ id: '9007199254740993' })).toBe('9007199254740993')
    expect(realtimeBigintId({ id: Number.MAX_SAFE_INTEGER + 1 })).toBeNull()
    expect(realtimeBigintId({ id: '0' })).toBeNull()

    expect(realtimeLoeschId({ eventType: 'DELETE', old: { id: 'uuid-1' } })).toBe('uuid-1')
    expect(realtimeLoeschId(
      { eventType: 'DELETE', old: { id: '9007199254740993' } },
      'bigint'
    )).toBe('9007199254740993')
    expect(realtimeLoeschId({ eventType: 'UPDATE', old: { id: 'uuid-1' } })).toBeNull()
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

function abrechnungDb(data: Record<string, unknown> | null, error: unknown = null) {
  const rpc = vi.fn(async () => ({ data, error }))
  return { db: { rpc }, rpc }
}

describe('kanonische Wochenabrechnung', () => {
  it('sendet nur den wochenmontag und übernimmt die serverzeile', async () => {
    const zeile = {
      woche: KANDIDAT.woche,
      sieger: 'erijon',
      grund: 'beleg',
      differenz: '0',
      beleg_erijon: '9',
      beleg_koray: '7',
      wette: 'erste wette',
      abgeschlossen: '2026-09-06T16:05:00.000Z',
      berechnung_version: 1,
      archiv_quelle: 'server_planmaessig',
      punkte_erijon: 12,
      punkte_koray: 12,
    }
    const fake = abrechnungDb(zeile)

    const bestaetigt = await finalisiereUndBestaetigeAbrechnung(
      fake.db as unknown as Parameters<typeof finalisiereUndBestaetigeAbrechnung>[0],
      KANDIDAT.woche
    )

    expect(fake.rpc).toHaveBeenCalledWith('finalisiere_wochenabrechnung', {
      p_woche: KANDIDAT.woche,
    })
    expect(JSON.stringify(fake.rpc.mock.calls)).not.toContain(KANDIDAT.sieger)
    expect(JSON.stringify(fake.rpc.mock.calls)).not.toContain(KANDIDAT.wette)
    expect(bestaetigt).toEqual({
      woche: KANDIDAT.woche,
      sieger: 'erijon',
      grund: 'beleg',
      differenz: 0,
      belegErijon: 9,
      belegKoray: 7,
      wette: 'erste wette',
      abgeschlossen: '2026-09-06T16:05:00.000Z',
      berechnungVersion: 1,
      archivQuelle: 'server_planmaessig',
      punkteErijon: 12,
      punkteKoray: 12,
    })
  })

  it('lehnt RPC-Fehler und eine nicht bestaetigte Nullzeile ab', async () => {
    const rpcFehler = { code: '42501' }
    await expect(finalisiereUndBestaetigeAbrechnung(
      abrechnungDb(null, rpcFehler).db as unknown as Parameters<typeof finalisiereUndBestaetigeAbrechnung>[0],
      KANDIDAT.woche
    )).rejects.toBe(rpcFehler)
    await expect(finalisiereUndBestaetigeAbrechnung(
      abrechnungDb(null).db as unknown as Parameters<typeof finalisiereUndBestaetigeAbrechnung>[0],
      KANDIDAT.woche
    )).rejects.toThrow('wurde nicht bestaetigt')
  })

  it('uebernimmt eine explizit als legacy gekennzeichnete Archivzeile', async () => {
    const zeile = {
      woche: KANDIDAT.woche,
      sieger: KANDIDAT.sieger,
      grund: KANDIDAT.grund,
      differenz: KANDIDAT.differenz,
      beleg_erijon: KANDIDAT.belegErijon,
      beleg_koray: KANDIDAT.belegKoray,
      wette: KANDIDAT.wette,
      abgeschlossen: KANDIDAT.abgeschlossen,
      berechnung_version: 0,
      archiv_quelle: 'legacy_client',
      punkte_erijon: null,
      punkte_koray: null,
    }
    const fake = abrechnungDb(zeile)
    const bestaetigt = await finalisiereUndBestaetigeAbrechnung(
      fake.db as unknown as Parameters<typeof finalisiereUndBestaetigeAbrechnung>[0],
      KANDIDAT.woche
    )
    expect(bestaetigt).toMatchObject({
      berechnungVersion: 0,
      archivQuelle: 'legacy_client',
      punkteErijon: null,
      punkteKoray: null,
    })
  })

  it.each([
    [{}, 'andere woche'],
    [{
      woche: '2026-08-24',
      sieger: 'erijon',
      grund: 'punkte',
      differenz: 1,
      beleg_erijon: 0,
      beleg_koray: 0,
      wette: null,
      abgeschlossen: KANDIDAT.abgeschlossen,
      berechnung_version: 1,
      archiv_quelle: 'server_nachgeholt',
      punkte_erijon: 1,
      punkte_koray: 0,
    }, 'andere woche'],
    [{
      woche: KANDIDAT.woche,
      sieger: 'koray',
      grund: 'punkte',
      differenz: 1,
      beleg_erijon: 0,
      beleg_koray: 0,
      wette: null,
      abgeschlossen: KANDIDAT.abgeschlossen,
      berechnung_version: 1,
      archiv_quelle: 'server_nachgeholt',
      punkte_erijon: 1,
      punkte_koray: 0,
    }, 'widerspruechliche entscheidung'],
    [{
      woche: KANDIDAT.woche,
      sieger: 'erijon',
      grund: 'punkte',
      differenz: 2,
      beleg_erijon: 0,
      beleg_koray: 0,
      wette: null,
      abgeschlossen: KANDIDAT.abgeschlossen,
      berechnung_version: 1,
      archiv_quelle: 'server_nachgeholt',
      punkte_erijon: 1,
      punkte_koray: 0,
    }, 'auditwerten'],
  ] as const)('lehnt eine nicht bestaetigende RPC-Zeile ab: %s', async (zeile, text) => {
    await expect(finalisiereUndBestaetigeAbrechnung(
      abrechnungDb(zeile as unknown as Record<string, unknown>).db as unknown as Parameters<typeof finalisiereUndBestaetigeAbrechnung>[0],
      KANDIDAT.woche
    )).rejects.toThrow(text)
  })

  it('unterscheidet eine echte leere Phasenliste von einer fehlenden Zeile', () => {
    const phase: Phase = { art: 'kern', start: 0, dauer: 45 }
    expect(phasenAusAnsicht({ phasen: [] }, null)).toEqual([])
    expect(phasenAusAnsicht({ phasen: [phase] }, null)).toEqual([phase])
    expect(() => phasenAusAnsicht(null, null)).toThrow('schlafnacht wurde nicht gefunden')
  })

  it.each([{}, { phasen: null }, { phasen: 'kaputt' }])(
    'deutet eine ungueltige Phasenantwort %j nicht als Health-Leerzustand',
    (data) => {
      expect(() => phasenAusAnsicht(data, null)).toThrow('schlafphasen sind ungueltig')
    }
  )

  it('reicht einen Supabase-Abruffehler unveraendert weiter', () => {
    const fehler = { code: '42501' }
    expect(() => phasenAusAnsicht({ phasen: [] }, fehler)).toThrow(fehler)
  })
})
