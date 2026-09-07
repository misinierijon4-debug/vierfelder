import { describe, expect, it, vi } from 'vitest'
import type { Abrechnung, Note, Phase } from './types'
import {
  REALTIME_KANAL_OPTIONEN,
  UnbestaetigteMutation,
  aktualisiereUndBestaetigeEinheit,
  entferneRealtimeKanal,
  finalisiereUndBestaetigeAbrechnung,
  istFehlendeVonSpalte,
  ladeAlleSeiten,
  neuerRealtimeKanalname,
  phasenAusAnsicht,
  realtimeBigintId,
  realtimeLoeschId,
  realtimeSubscribeEreignis,
  realtimeSystemEreignis,
  realtimeTextId,
  loescheUndBestaetigeNote,
  loescheUndBestaetigeEinheit,
  loescheUndBestaetigeEinheiten,
  loescheUndBestaetigeGewicht,
  loescheUndBestaetigeWette,
  schreibeUndBestaetigeAltEintrag,
  schreibeUndBestaetigeAltWert,
  schreibeUndBestaetigeEinheit,
  schreibeUndBestaetigeGewicht,
  schreibeUndBestaetigeNote,
  schreibeUndBestaetigeWette,
  supabaseBackend,
  validiereDuellprofile,
  wechsleUndBestaetigePruefungsfach,
} from './supabase'

type Testzeile = { id: string }

function paginierteTestabfrage(
  zeilen: Testzeile[],
  antwort?: (seite: number, von: number, bis: number) => {
    data: Testzeile[] | null
    error: unknown
    count?: number | null
  }
) {
  let seite = 0
  const range = vi.fn(async (von: number, bis: number) => {
    const aktuelleSeite = seite
    seite += 1
    return antwort
      ? antwort(aktuelleSeite, von, bis)
      : { data: zeilen.slice(von, bis + 1), error: null, count: zeilen.length }
  })
  return { baue: () => ({ range }), range }
}

describe('vollstaendige Supabase-Paginierung', () => {
  it.each([1000, 2037])('liest %i Zeilen ohne PostgREST-Trunkierung', async (anzahl) => {
    const zeilen = Array.from({ length: anzahl }, (_, index) => ({ id: `zeile-${index}` }))
    const abfrage = paginierteTestabfrage(zeilen)

    const ergebnis = await ladeAlleSeiten(abfrage.baue, {
      name: 'testdaten',
      schluessel: (zeile) => zeile.id,
    })

    expect(ergebnis).toHaveLength(anzahl)
    expect(ergebnis.at(-1)?.id).toBe(`zeile-${anzahl - 1}`)
    expect(abfrage.range.mock.calls).toEqual(
      anzahl === 1000
        ? [[0, 999]]
        : [[0, 999], [1000, 1999], [2000, 2999]]
    )
  })

  it('reicht einen Fehler der zweiten Seite unveraendert weiter', async () => {
    const fehler = { code: '57014', message: 'abgebrochen' }
    const ersteSeite = Array.from({ length: 1000 }, (_, index) => ({ id: `zeile-${index}` }))
    const abfrage = paginierteTestabfrage([], (seite) => seite === 0
      ? { data: ersteSeite, error: null, count: 1001 }
      : { data: null, error: fehler, count: 1001 })

    await expect(ladeAlleSeiten(abfrage.baue, {
      name: 'testdaten',
      schluessel: (zeile) => zeile.id,
    })).rejects.toBe(fehler)
  })

  it('bricht bei wechselnder Gesamtzahl und doppeltem Seitenschluessel ab', async () => {
    const ersteSeite = [{ id: 'eins' }, { id: 'zwei' }]
    const countWechsel = paginierteTestabfrage([], (seite) => seite === 0
      ? { data: ersteSeite, error: null, count: 3 }
      : { data: [{ id: 'drei' }], error: null, count: 4 })
    await expect(ladeAlleSeiten(countWechsel.baue, {
      name: 'testdaten',
      schluessel: (zeile) => zeile.id,
      seitengroesse: 2,
    })).rejects.toThrow('gesamtzahl hat sich')

    const doppelt = paginierteTestabfrage([], (seite) => seite === 0
      ? { data: ersteSeite, error: null, count: 3 }
      : { data: [{ id: 'zwei' }], error: null, count: 3 })
    await expect(ladeAlleSeiten(doppelt.baue, {
      name: 'testdaten',
      schluessel: (zeile) => zeile.id,
      seitengroesse: 2,
    })).rejects.toThrow('doppelte oder ungueltige zeile zwei')

    const zuKurz = paginierteTestabfrage([], (seite) => seite === 0
      ? { data: ersteSeite, error: null, count: 3 }
      : { data: [], error: null, count: 3 })
    await expect(ladeAlleSeiten(zuKurz.baue, {
      name: 'testdaten',
      schluessel: (zeile) => zeile.id,
      seitengroesse: 2,
    })).rejects.toThrow('gesamtzahl wurde nicht erreicht')
  })

  it('beendet eine Abfrage ohne Count erst nach einer leeren Folgeseite', async () => {
    const zeilen = Array.from({ length: 1001 }, (_, index) => ({ id: `zeile-${index}` }))
    const abfrage = paginierteTestabfrage([], (_seite, von, bis) => ({
      data: zeilen.slice(von, bis + 1),
      error: null,
      count: null,
    }))

    await expect(ladeAlleSeiten(abfrage.baue, {
      name: 'testdaten',
      schluessel: (zeile) => zeile.id,
    })).resolves.toHaveLength(1001)
    expect(abfrage.range.mock.calls).toEqual([[0, 999], [1000, 1999], [1001, 2000]])
  })
})

const ERIJON_ID = '11111111-1111-4111-8111-111111111111'
const KORAY_ID = '22222222-2222-4222-8222-222222222222'

describe('kanonische Zwei-Personen-Mitgliedschaft', () => {
  const profile = [
    { id: KORAY_ID, person: 'koray' },
    { id: ERIJON_ID, person: 'erijon' },
  ]

  it('ordnet nur die zwei eindeutigen kanonischen Profile zu', () => {
    expect(validiereDuellprofile(profile, ERIJON_ID)).toEqual({
      profile: [
        { id: ERIJON_ID, person: 'erijon' },
        { id: KORAY_ID, person: 'koray' },
      ],
      me: 'erijon',
      userIds: [ERIJON_ID, KORAY_ID],
    })
  })

  it.each([
    [profile.slice(0, 1), 'unvollstaendig'],
    [[...profile, { id: '33333333-3333-4333-8333-333333333333', person: 'gast' }], 'fremde'],
    [[profile[0], { id: ERIJON_ID, person: 'koray' }], 'doppelte'],
    [[profile[0], { id: ERIJON_ID, person: 'gast' }], 'unbekannte'],
    [[profile[0], { id: 'keine-uuid', person: 'erijon' }], 'ungueltige profil-id'],
  ])('lehnt eine nicht kanonische Mitgliedschaft ab: %s', (daten, meldung) => {
    expect(() => validiereDuellprofile(daten, ERIJON_ID)).toThrow(meldung)
  })

  it('lehnt ein authentifiziertes Konto ausserhalb der zwei Profile ab', () => {
    expect(() => validiereDuellprofile(
      profile,
      '33333333-3333-4333-8333-333333333333'
    )).toThrow('gehoert nicht zum zweikampf')
  })
})

type AbfrageProtokoll = {
  tabelle: string
  userFilter: unknown[] | null
  eigenerFilter: unknown | null
  profileFertigBeimStart: boolean
  auswahl: string | null
}

function startDb(einheitenFehler?: 'von' | 'tabelle', profilVerzoegert = false) {
  let profileFertig = false
  let profileFreigeben: () => void = () => {}
  const protokoll: AbfrageProtokoll[] = []
  const profile = [
    { id: ERIJON_ID, person: 'erijon' },
    { id: KORAY_ID, person: 'koray' },
  ]

  const from = vi.fn((tabelle: string) => {
    const eintrag: AbfrageProtokoll = {
      tabelle,
      userFilter: null,
      eigenerFilter: null,
      profileFertigBeimStart: profileFertig,
      auswahl: null,
    }
    protokoll.push(eintrag)
    const builder = {
      select: vi.fn((spalten: string) => {
        eintrag.auswahl = spalten
        return builder
      }),
      in: vi.fn((spalte: string, werte: unknown[]) => {
        if (spalte === 'user_id') eintrag.userFilter = [...werte]
        return builder
      }),
      eq: vi.fn((spalte: string, wert: unknown) => {
        if (spalte === 'user_id') eintrag.eigenerFilter = wert
        return builder
      }),
      order: vi.fn(() => builder),
      gte: vi.fn(() => builder),
      range: vi.fn(async (von: number, bis: number) => {
        if (tabelle === 'profile') {
          const antwort = { data: profile.slice(von, bis + 1), error: null, count: profile.length }
          if (!profilVerzoegert) {
            profileFertig = true
            return antwort
          }
          return await new Promise<typeof antwort>((resolve) => {
            profileFreigeben = () => {
              profileFertig = true
              resolve(antwort)
            }
          })
        }
        if (tabelle === 'einheiten' && einheitenFehler === 'tabelle') {
          return { data: null, error: { code: 'PGRST205' }, count: null }
        }
        if (tabelle === 'einheiten' && einheitenFehler === 'von' && eintrag.auswahl?.includes('von')) {
          return { data: null, error: { code: 'PGRST204' }, count: null }
        }
        return { data: [], error: null, count: 0 }
      }),
    }
    return builder
  })

  return { db: { from }, protokoll, profileFreigeben: () => profileFreigeben() }
}

describe('Supabase-Startreihenfolge und Serverfilter', () => {
  it('validiert beide Profile vor Fachdaten und filtert jede personenbezogene Liste', async () => {
    const fake = startDb(undefined, true)
    const backend = supabaseBackend(
      ERIJON_ID,
      fake.db as unknown as NonNullable<Parameters<typeof supabaseBackend>[1]>
    )

    const ladevorgang = backend.laden()
    expect(fake.protokoll.map((eintrag) => eintrag.tabelle)).toEqual(['profile'])
    fake.profileFreigeben()
    await expect(ladevorgang).resolves.toMatchObject({ me: 'erijon' })
    expect(fake.protokoll[0]).toMatchObject({
      tabelle: 'profile',
      profileFertigBeimStart: false,
    })
    const fachdaten = fake.protokoll.slice(1)
    expect(fachdaten.length).toBeGreaterThan(0)
    expect(fachdaten.every((eintrag) => eintrag.profileFertigBeimStart)).toBe(true)

    const personenbezogen = fachdaten.filter((eintrag) => [
      'einheiten',
      'schlafnaechte_ansicht',
      'gewicht',
      'aufenthalte',
      'faecher',
      'noten',
    ].includes(eintrag.tabelle))
    expect(personenbezogen).toHaveLength(7)
    for (const eintrag of personenbezogen) {
      expect(eintrag.userFilter).toEqual([ERIJON_ID, KORAY_ID])
    }
  })

  it('paginiert und filtert auch Spalten- und Tabellen-Fallbacks', async () => {
    const ohneVon = startDb('von')
    const neuerBackend = supabaseBackend(
      ERIJON_ID,
      ohneVon.db as unknown as NonNullable<Parameters<typeof supabaseBackend>[1]>
    )
    await expect(neuerBackend.laden()).resolves.toMatchObject({
      altbestand: false,
      einheitVonVerfuegbar: false,
    })
    const einheitAnfragen = ohneVon.protokoll.filter((eintrag) => eintrag.tabelle === 'einheiten')
    expect(einheitAnfragen).toHaveLength(2)
    expect(einheitAnfragen[0].auswahl).toContain('von')
    expect(einheitAnfragen[1].auswahl).not.toContain('von')
    expect(einheitAnfragen.every((eintrag) =>
      JSON.stringify(eintrag.userFilter) === JSON.stringify([ERIJON_ID, KORAY_ID])
    )).toBe(true)

    const alt = startDb('tabelle')
    const altBackend = supabaseBackend(
      ERIJON_ID,
      alt.db as unknown as NonNullable<Parameters<typeof supabaseBackend>[1]>
    )
    await expect(altBackend.laden()).resolves.toMatchObject({ altbestand: true })
    expect(alt.protokoll.find((eintrag) => eintrag.tabelle === 'eintraege')?.userFilter)
      .toEqual([ERIJON_ID, KORAY_ID])
    expect(alt.protokoll.find((eintrag) => eintrag.tabelle === 'werte')).toMatchObject({
      userFilter: null,
      eigenerFilter: ERIJON_ID,
    })
  })
})

const EINHEIT_ZEILE = {
  id: '44444444-4444-4444-8444-444444444444',
  user_id: ERIJON_ID,
  bereich: 'lernen' as const,
  tag: '2026-09-06',
  wert: 45,
  erfasst: '2026-09-06T18:00:00.000Z',
  von: null,
}

function einheitSchreibDb(kanonisch: unknown) {
  const upsert = vi.fn(async () => ({ error: null }))
  const lesen = {
    eq: vi.fn(() => lesen),
    maybeSingle: vi.fn(async () => ({ data: kanonisch, error: null })),
  }
  return {
    db: {
      from: vi.fn()
        .mockReturnValueOnce({ upsert })
        .mockReturnValueOnce({ select: vi.fn(() => lesen) }),
    },
    upsert,
  }
}

function einheitUpdateCasDb(anfang: { wert: number | null; von: string | null }) {
  let zeile = {
    id: EINHEIT_ZEILE.id,
    user_id: ERIJON_ID,
    ...anfang,
  }
  const from = vi.fn(() => {
    let aenderung: { wert: number | null } | { von: string | null } | null = null
    let filter: { art: 'eq' | 'is'; feld: string; wert: unknown } | null = null
    const kette = {
      update: vi.fn((naechste: { wert: number | null } | { von: string | null }) => {
        aenderung = naechste
        return kette
      }),
      match: vi.fn(() => kette),
      eq: vi.fn((feld: string, wert: unknown) => {
        filter = { art: 'eq', feld, wert }
        return kette
      }),
      is: vi.fn((feld: string, wert: unknown) => {
        filter = { art: 'is', feld, wert }
        return kette
      }),
      select: vi.fn(() => kette),
      maybeSingle: vi.fn(async () => {
        if (!aenderung || !filter) return { data: null, error: null }
        const ist = zeile[filter.feld as keyof typeof zeile]
        const trifft = filter.art === 'is'
          ? ist === null && filter.wert === null
          : ist === filter.wert
        if (!trifft) return { data: null, error: null }

        zeile = { ...zeile, ...aenderung }
        const feld = 'wert' in aenderung ? 'wert' : 'von'
        return {
          data: { id: zeile.id, user_id: zeile.user_id, [feld]: zeile[feld] },
          error: null,
        }
      }),
    }
    return kette
  })
  return {
    db: { from },
    stand: () => ({ ...zeile }),
  }
}

describe('bestaetigte Tracker-Mutationen', () => {
  it('bestaetigt den exakten Einheit-Retry und lehnt eine UUID-Kollision ab', async () => {
    const exakt = einheitSchreibDb(EINHEIT_ZEILE)
    await expect(schreibeUndBestaetigeEinheit(
      exakt.db as unknown as Parameters<typeof schreibeUndBestaetigeEinheit>[0],
      EINHEIT_ZEILE
    )).resolves.toBe(EINHEIT_ZEILE.id)
    expect(exakt.upsert).toHaveBeenCalledWith(EINHEIT_ZEILE, {
      onConflict: 'id',
      ignoreDuplicates: true,
    })

    const kollision = einheitSchreibDb({ ...EINHEIT_ZEILE, wert: 5 })
    await expect(schreibeUndBestaetigeEinheit(
      kollision.db as unknown as Parameters<typeof schreibeUndBestaetigeEinheit>[0],
      EINHEIT_ZEILE
    )).rejects.toBeInstanceOf(UnbestaetigteMutation)
  })

  it('filtert Updates atomar auf den alten Nicht-Null- oder Nullwert', async () => {
    const updateDb = (data: unknown) => {
      const kette = {
        match: vi.fn(() => kette),
        eq: vi.fn(() => kette),
        is: vi.fn(() => kette),
        select: vi.fn(() => kette),
        maybeSingle: vi.fn(async () => ({ data, error: null })),
      }
      return {
        db: { from: vi.fn(() => ({ update: vi.fn(() => kette) })) },
        kette,
      }
    }

    const wert = updateDb({ id: EINHEIT_ZEILE.id, user_id: ERIJON_ID, wert: 61 })
    await expect(aktualisiereUndBestaetigeEinheit(
      wert.db as unknown as Parameters<typeof aktualisiereUndBestaetigeEinheit>[0],
      EINHEIT_ZEILE.id,
      ERIJON_ID,
      { wert: 61 },
      EINHEIT_ZEILE.wert
    )).resolves.toBe(EINHEIT_ZEILE.id)
    expect(wert.kette.eq).toHaveBeenCalledWith('wert', EINHEIT_ZEILE.wert)
    expect(wert.kette.is).not.toHaveBeenCalled()

    const von = '2026-09-06T18:10:00.000Z'
    const zeit = updateDb({ id: EINHEIT_ZEILE.id, user_id: ERIJON_ID, von })
    await expect(aktualisiereUndBestaetigeEinheit(
      zeit.db as unknown as Parameters<typeof aktualisiereUndBestaetigeEinheit>[0],
      EINHEIT_ZEILE.id,
      ERIJON_ID,
      { von },
      null
    )).resolves.toBe(EINHEIT_ZEILE.id)
    expect(zeit.kette.is).toHaveBeenCalledWith('von', null)
    expect(zeit.kette.eq).not.toHaveBeenCalled()

    const konflikt = updateDb(null)
    await expect(aktualisiereUndBestaetigeEinheit(
      konflikt.db as unknown as Parameters<typeof aktualisiereUndBestaetigeEinheit>[0],
      EINHEIT_ZEILE.id,
      ERIJON_ID,
      { von },
      null
    )).rejects.toBeInstanceOf(UnbestaetigteMutation)
  })

  it('laesst 50 -> 60 -> 70 zu, aber bestaetigt zwei Schreiber mit Altwert 50 nicht beide', async () => {
    const schreibkette = einheitUpdateCasDb({ wert: 50, von: null })
    const db = schreibkette.db as unknown as Parameters<typeof aktualisiereUndBestaetigeEinheit>[0]

    await expect(aktualisiereUndBestaetigeEinheit(
      db, EINHEIT_ZEILE.id, ERIJON_ID, { wert: 60 }, 50
    )).resolves.toBe(EINHEIT_ZEILE.id)
    await expect(aktualisiereUndBestaetigeEinheit(
      db, EINHEIT_ZEILE.id, ERIJON_ID, { wert: 70 }, 60
    )).resolves.toBe(EINHEIT_ZEILE.id)
    expect(schreibkette.stand().wert).toBe(70)

    const konkurrenz = einheitUpdateCasDb({ wert: 50, von: null })
    const konkurrenzDb = konkurrenz.db as unknown as Parameters<typeof aktualisiereUndBestaetigeEinheit>[0]
    const ergebnisse = await Promise.allSettled([
      aktualisiereUndBestaetigeEinheit(
        konkurrenzDb, EINHEIT_ZEILE.id, ERIJON_ID, { wert: 60 }, 50
      ),
      aktualisiereUndBestaetigeEinheit(
        konkurrenzDb, EINHEIT_ZEILE.id, ERIJON_ID, { wert: 70 }, 50
      ),
    ])

    expect(ergebnisse.filter((ergebnis) => ergebnis.status === 'fulfilled')).toHaveLength(1)
    const abgelehnt = ergebnisse.find((ergebnis) => ergebnis.status === 'rejected')
    expect(abgelehnt).toMatchObject({ reason: expect.any(UnbestaetigteMutation) })
    expect([60, 70]).toContain(konkurrenz.stand().wert)
  })

  it('bestaetigt nur die exakte DELETE-Zeile und erhaelt Null- und Fehlerpfade', async () => {
    const loeschDb = (loeschzeile: unknown, error: unknown = null) => {
      const loeschen = {
        match: vi.fn(() => loeschen),
        select: vi.fn(() => loeschen),
        maybeSingle: vi.fn(async () => ({ data: loeschzeile, error })),
      }
      return {
        from: vi.fn(() => ({ delete: vi.fn(() => loeschen) })),
      }
    }
    await expect(loescheUndBestaetigeEinheit(
      loeschDb({ id: EINHEIT_ZEILE.id, user_id: ERIJON_ID }) as unknown as Parameters<typeof loescheUndBestaetigeEinheit>[0],
      EINHEIT_ZEILE.id,
      ERIJON_ID
    )).resolves.toBe(EINHEIT_ZEILE.id)
    const rlsNulltreffer = loeschDb(null)
    await expect(loescheUndBestaetigeEinheit(
      rlsNulltreffer as unknown as Parameters<typeof loescheUndBestaetigeEinheit>[0],
      EINHEIT_ZEILE.id,
      ERIJON_ID
    )).rejects.toBeInstanceOf(UnbestaetigteMutation)
    expect(rlsNulltreffer.from).toHaveBeenCalledOnce()

    const datenbankfehler = { code: '42501' }
    await expect(loescheUndBestaetigeEinheit(
      loeschDb(null, datenbankfehler) as unknown as Parameters<typeof loescheUndBestaetigeEinheit>[0],
      EINHEIT_ZEILE.id,
      ERIJON_ID
    )).rejects.toBe(datenbankfehler)
  })

  it('bestaetigt Mehrfachloeschungen nur mit allen erwarteten DELETE-IDs', async () => {
    const ids = [EINHEIT_ZEILE.id, '55555555-5555-4555-8555-555555555555']
    const mehrfachDb = (geloescht: unknown, error: unknown = null) => {
      const loeschen = {
        eq: vi.fn(() => loeschen),
        in: vi.fn(() => loeschen),
        select: vi.fn(async () => ({ data: geloescht, error })),
      }
      return {
        from: vi.fn(() => ({ delete: vi.fn(() => loeschen) })),
      }
    }
    await expect(loescheUndBestaetigeEinheiten(
      mehrfachDb(ids.map((id) => ({ id }))) as unknown as Parameters<typeof loescheUndBestaetigeEinheiten>[0],
      ids,
      ERIJON_ID
    )).resolves.toEqual(ids)

    const teiltreffer = mehrfachDb([{ id: ids[0] }])
    await expect(loescheUndBestaetigeEinheiten(
      teiltreffer as unknown as Parameters<typeof loescheUndBestaetigeEinheiten>[0],
      ids,
      ERIJON_ID
    )).rejects.toBeInstanceOf(UnbestaetigteMutation)
    expect(teiltreffer.from).toHaveBeenCalledOnce()

    const nulltreffer = mehrfachDb(null)
    await expect(loescheUndBestaetigeEinheiten(
      nulltreffer as unknown as Parameters<typeof loescheUndBestaetigeEinheiten>[0],
      ids,
      ERIJON_ID
    )).rejects.toBeInstanceOf(UnbestaetigteMutation)
    expect(nulltreffer.from).toHaveBeenCalledOnce()

    const leererTreffer = mehrfachDb([])
    await expect(loescheUndBestaetigeEinheiten(
      leererTreffer as unknown as Parameters<typeof loescheUndBestaetigeEinheiten>[0],
      ids,
      ERIJON_ID
    )).rejects.toBeInstanceOf(UnbestaetigteMutation)
    expect(leererTreffer.from).toHaveBeenCalledOnce()

    const datenbankfehler = { code: '42501' }
    await expect(loescheUndBestaetigeEinheiten(
      mehrfachDb(null, datenbankfehler) as unknown as Parameters<typeof loescheUndBestaetigeEinheiten>[0],
      ids,
      ERIJON_ID
    )).rejects.toBe(datenbankfehler)
  })
})

function direktBestaetigteUpsertDb(data: unknown) {
  const kette = {
    select: vi.fn(() => kette),
    maybeSingle: vi.fn(async () => ({ data, error: null })),
  }
  return { from: vi.fn(() => ({ upsert: vi.fn(() => kette) })) }
}

describe('bestaetigte Legacy-, Gewichts- und Wettmutationen', () => {
  it('bestaetigt Legacy-Eintrag und -Wert samt numerischem PostgREST-Wert', async () => {
    const eintrag = { user_id: ERIJON_ID, bereich: 'lesen' as const, tag: '2026-09-06' }
    await expect(schreibeUndBestaetigeAltEintrag(
      direktBestaetigteUpsertDb(eintrag) as unknown as Parameters<typeof schreibeUndBestaetigeAltEintrag>[0],
      eintrag
    )).resolves.toBeUndefined()
    await expect(schreibeUndBestaetigeAltWert(
      direktBestaetigteUpsertDb({ ...eintrag, wert: '23' }) as unknown as Parameters<typeof schreibeUndBestaetigeAltWert>[0],
      { ...eintrag, wert: 23 }
    )).resolves.toBeUndefined()
    await expect(schreibeUndBestaetigeAltWert(
      direktBestaetigteUpsertDb(null) as unknown as Parameters<typeof schreibeUndBestaetigeAltWert>[0],
      { ...eintrag, wert: 23 }
    )).rejects.toBeInstanceOf(UnbestaetigteMutation)
  })

  it('bestaetigt Gewicht einschliesslich getippter Quelle und erkennt Nullzeilen', async () => {
    const payload = { user_id: ERIJON_ID, tag: '2026-09-06', kg: 81.4, quelle: 'getippt' as const }
    await expect(schreibeUndBestaetigeGewicht(
      direktBestaetigteUpsertDb({ ...payload, kg: '81.40' }) as unknown as Parameters<typeof schreibeUndBestaetigeGewicht>[0],
      payload
    )).resolves.toBeUndefined()
    await expect(schreibeUndBestaetigeGewicht(
      direktBestaetigteUpsertDb({ ...payload, quelle: 'gemessen' }) as unknown as Parameters<typeof schreibeUndBestaetigeGewicht>[0],
      payload
    )).rejects.toBeInstanceOf(UnbestaetigteMutation)

    const loeschen = {
      match: vi.fn(() => loeschen),
      select: vi.fn(() => loeschen),
      maybeSingle: vi.fn(async () => ({ data: null, error: null })),
    }
    const lesen = {
      eq: vi.fn(() => lesen),
      maybeSingle: vi.fn(async () => ({ data: { user_id: ERIJON_ID, tag: payload.tag }, error: null })),
    }
    const db = {
      from: vi.fn()
        .mockReturnValueOnce({ delete: vi.fn(() => loeschen) })
        .mockReturnValueOnce({ select: vi.fn(() => lesen) }),
    }
    await expect(loescheUndBestaetigeGewicht(
      db as unknown as Parameters<typeof loescheUndBestaetigeGewicht>[0],
      ERIJON_ID,
      payload.tag
    )).rejects.toBeInstanceOf(UnbestaetigteMutation)
  })

  it('akzeptiert einen Wetteinsatz nur mit Identitaet, Text, Autor und Zeitpunkt', async () => {
    const payload = {
      woche: '2026-08-31',
      text: 'verlierer kocht',
      updated_by: ERIJON_ID,
      updated_at: '2026-09-06T18:00:00.000Z',
    }
    await expect(schreibeUndBestaetigeWette(
      direktBestaetigteUpsertDb({ ...payload, updated_at: '2026-09-06T20:00:00+02:00' }) as unknown as Parameters<typeof schreibeUndBestaetigeWette>[0],
      payload
    )).resolves.toBeUndefined()
    await expect(schreibeUndBestaetigeWette(
      direktBestaetigteUpsertDb({ ...payload, updated_by: KORAY_ID }) as unknown as Parameters<typeof schreibeUndBestaetigeWette>[0],
      payload
    )).rejects.toBeInstanceOf(UnbestaetigteMutation)
  })

  it('bestaetigt das Entfernen eines Wetteinsatzes ueber Woche und Endzustand', async () => {
    const loeschen = {
      match: vi.fn(() => loeschen),
      select: vi.fn(() => loeschen),
      maybeSingle: vi.fn(async () => ({ data: { woche: '2026-08-31' }, error: null })),
    }
    const db = { from: vi.fn(() => ({ delete: vi.fn(() => loeschen) })) }

    await expect(loescheUndBestaetigeWette(
      db as unknown as Parameters<typeof loescheUndBestaetigeWette>[0],
      '2026-08-31'
    )).resolves.toBeUndefined()
    expect(loeschen.match).toHaveBeenCalledWith({ woche: '2026-08-31' })
  })
})

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
    ).rejects.toBeInstanceOf(UnbestaetigteMutation)
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
