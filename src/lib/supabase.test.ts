import { describe, expect, it, vi } from 'vitest'
import type { Abrechnung, Note, Phase } from './types'
import {
  REALTIME_KANAL_OPTIONEN,
  entferneRealtimeKanal,
  finalisiereUndBestaetigeAbrechnung,
  istFehlendeVonSpalte,
  neuerRealtimeKanalname,
  phasenAusAnsicht,
  realtimeBigintId,
  realtimeLoeschId,
  realtimeSubscribeEreignis,
  realtimeSystemEreignis,
  realtimeTextId,
  loescheUndBestaetigeNote,
  schreibeUndBestaetigeNote,
  wechsleUndBestaetigePruefungsfach,
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

describe('bestaetigte Notenmutationen', () => {
  const NOTE: Note = {
    id: '10000000-0000-4000-8000-000000000001',
    user: 'erijon',
    fachId: '20000000-0000-4000-8000-000000000001',
    art: 'klausur',
    punkte: 12,
    gewicht: 1,
    datum: '2026-09-06',
    titel: 'zellbiologie',
  }
  const EIGENE_ID = '30000000-0000-4000-8000-000000000001'
  const ZEILE = {
    id: NOTE.id,
    user_id: EIGENE_ID,
    fach_id: NOTE.fachId,
    art: NOTE.art,
    punkte: NOTE.punkte,
    gewicht: NOTE.gewicht,
    datum: NOTE.datum,
    titel: NOTE.titel,
  }

  it('sendet beim Fachwechsel nur Ziel und erwarteten Ausgang und prueft die UUID', async () => {
    const rpc = vi.fn(async () => ({ data: NOTE.fachId, error: null }))
    const db = { rpc }

    await expect(
      wechsleUndBestaetigePruefungsfach(
        db as unknown as Parameters<typeof wechsleUndBestaetigePruefungsfach>[0],
        NOTE.fachId,
        'alt-fach'
      )
    ).resolves.toBe(NOTE.fachId)
    expect(rpc).toHaveBeenCalledWith('setze_pruefungsfach', {
      p_fach_id: NOTE.fachId,
      p_erwartetes_fach_id: 'alt-fach',
    })

    rpc.mockResolvedValueOnce({ data: 'anderes-fach', error: null })
    await expect(
      wechsleUndBestaetigePruefungsfach(
        db as unknown as Parameters<typeof wechsleUndBestaetigePruefungsfach>[0],
        NOTE.fachId,
        'alt-fach'
      )
    ).rejects.toThrow('nicht bestaetigt')
  })

  it('bestaetigt einen Noten-Retry durch eine exakt gleiche kanonische Zeile', async () => {
    const upsert = vi.fn(async () => ({ error: null }))
    const maybeSingle = vi.fn(async () => ({ data: ZEILE, error: null }))
    const lesen = {
      eq: vi.fn(() => lesen),
      maybeSingle,
    }
    const from = vi.fn()
      .mockReturnValueOnce({ upsert })
      .mockReturnValueOnce({ select: vi.fn(() => lesen) })
    const db = { from }

    await expect(
      schreibeUndBestaetigeNote(
        db as unknown as Parameters<typeof schreibeUndBestaetigeNote>[0],
        NOTE,
        EIGENE_ID
      )
    ).resolves.toBe(NOTE.id)
    expect(upsert).toHaveBeenCalledWith(ZEILE, { onConflict: 'id', ignoreDuplicates: true })
    expect(maybeSingle).toHaveBeenCalledOnce()
  })

  it('lehnt eine abweichende UUID-Kollision und eine Nullzeilen-Loeschung ab', async () => {
    const upsert = vi.fn(async () => ({ error: null }))
    const lesen = {
      eq: vi.fn(() => lesen),
      maybeSingle: vi.fn(async () => ({ data: { ...ZEILE, punkte: 3 }, error: null })),
    }
    const dbKollision = {
      from: vi.fn()
        .mockReturnValueOnce({ upsert })
        .mockReturnValueOnce({ select: vi.fn(() => lesen) }),
    }
    await expect(
      schreibeUndBestaetigeNote(
        dbKollision as unknown as Parameters<typeof schreibeUndBestaetigeNote>[0],
        NOTE,
        EIGENE_ID
      )
    ).rejects.toThrow('nicht eindeutig bestaetigt')

    const loeschKette = {
      match: vi.fn(() => loeschKette),
      select: vi.fn(() => loeschKette),
      maybeSingle: vi.fn(async () => ({ data: null, error: null })),
    }
    const dbLoeschen = { from: vi.fn(() => ({ delete: vi.fn(() => loeschKette) })) }
    await expect(
      loescheUndBestaetigeNote(
        dbLoeschen as unknown as Parameters<typeof loescheUndBestaetigeNote>[0],
        NOTE.id,
        EIGENE_ID
      )
    ).rejects.toThrow('nicht bestaetigt')
  })

  it('akzeptiert beim Loeschen nur die exakt zurueckgegebene ID', async () => {
    const loeschKette = {
      match: vi.fn(() => loeschKette),
      select: vi.fn(() => loeschKette),
      maybeSingle: vi.fn(async () => ({ data: { id: NOTE.id }, error: null })),
    }
    const db = { from: vi.fn(() => ({ delete: vi.fn(() => loeschKette) })) }
    await expect(
      loescheUndBestaetigeNote(
        db as unknown as Parameters<typeof loescheUndBestaetigeNote>[0],
        NOTE.id,
        EIGENE_ID
      )
    ).resolves.toBe(NOTE.id)
  })
})

describe('supabase realtime lifecycle', () => {
  it('vergibt fuer jeden Lauf ein eindeutiges, nicht personenbezogenes Topic', () => {
    const erstes = neuerRealtimeKanalname('einheiten')
    const zweites = neuerRealtimeKanalname('einheiten')

    expect(erstes).not.toBe(zweites)
    expect(erstes).toMatch(/^zweikampf:einheiten:\d+$/)
  })

  it('trennt Transportstatus von bestaetigter Replikationsbereitschaft', () => {
    expect(REALTIME_KANAL_OPTIONEN).toEqual({
      config: { broadcast: { replication_ready: true } },
    })
    expect(realtimeSubscribeEreignis('SUBSCRIBED')).toEqual({
      typ: 'verbindung',
      status: 'transportbereit',
    })
    expect(realtimeSystemEreignis({ extension: 'system', status: 'ok' })).toEqual({
      typ: 'verbindung',
      status: 'bereit',
    })
    expect(realtimeSystemEreignis({ extension: 'postgres_changes', status: 'ok' })).toBeNull()
  })

  it.each([
    ['CHANNEL_ERROR', 'channel_error'],
    ['TIMED_OUT', 'timed_out'],
    ['CLOSED', 'closed'],
  ])('markiert %s als veraltet', (status, grund) => {
    expect(realtimeSubscribeEreignis(status)).toEqual({
      typ: 'verbindung',
      status: 'veraltet',
      grund,
    })
  })

  it('markiert einen Replikationsfehler und ignoriert unbekannte Systemmeldungen', () => {
    expect(realtimeSystemEreignis({ extension: 'system', status: 'error' })).toEqual({
      typ: 'verbindung',
      status: 'veraltet',
      grund: 'replication_error',
    })
    expect(realtimeSystemEreignis({ extension: 'system', status: 'spaeter' })).toBeNull()
  })

  it('entfernt beim Cleanup genau den erstellten Kanal', () => {
    const kanal = { topic: neuerRealtimeKanalname('einheiten') }
    const removeChannel = vi.fn(async () => 'ok')

    entferneRealtimeKanal({ removeChannel }, kanal)

    expect(removeChannel).toHaveBeenCalledTimes(1)
    expect(removeChannel).toHaveBeenCalledWith(kanal)
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
