import { describe, expect, it } from 'vitest'
import {
  baueWochenlage,
  ermittleWochenlage,
  type WochenDatenbank,
} from '../../supabase/functions/_shared/eniWochenlage.ts'

type Tabellen = Record<string, Array<Record<string, unknown>>>

function dbAus(tabellen: Tabellen, fehler: string[] = []): WochenDatenbank {
  const db = {
    from(tabelle: string) {
      return {
        select() {
          let daten = [...(tabellen[tabelle] ?? [])]
          const api = {
            gte(spalte: string, wert: string) {
              daten = daten.filter((zeile) => String(zeile[spalte] ?? '') >= wert)
              return api
            },
            limit(anzahl: number) {
              daten = daten.slice(0, anzahl)
              return api
            },
            then(aufloesen: (wert: unknown) => unknown) {
              return Promise.resolve(
                fehler.includes(tabelle)
                  ? { data: null, error: { message: `${tabelle} nicht lesbar` }, count: null }
                  : { data: daten, error: null, count: daten.length },
              ).then(aufloesen)
            },
          }
          return api
        },
      }
    },
  }
  return db as unknown as WochenDatenbank
}

const personen = new Map<string, 'erijon' | 'koray'>([
  ['u-erijon', 'erijon'],
  ['u-koray', 'koray'],
])

describe('ENI-Wochenlage', () => {
  it('bindet die angefragte alte Woche exakt und zaehlt Rohzeilen getrennt von Tagen', async () => {
    const lage = await ermittleWochenlage(
      dbAus({
        einheiten: [
          { id: 'e1', user_id: 'u-erijon', bereich: 'gym', tag: '2026-10-20', wert: 45 },
          { id: 'e2', user_id: 'u-erijon', bereich: 'gym', tag: '2026-10-20', wert: null },
          { id: 'falsch', user_id: 'u-erijon', bereich: 'gym', tag: '2026-10-26', wert: 99 },
        ],
        aufenthalte: [
          { user_id: 'u-erijon', bereich: 'gym', ankunft: '2026-10-21T17:00:00Z', abgang: '2026-10-21T17:20:00Z' },
          { user_id: 'u-erijon', bereich: 'gym', ankunft: '2026-10-21T18:00:00Z', abgang: '2026-10-21T18:19:00Z' },
          { user_id: 'u-erijon', bereich: 'lesen', ankunft: '2026-10-22T18:00:00Z', abgang: '2026-10-22T18:10:00Z' },
          { user_id: 'u-erijon', bereich: 'lesen', ankunft: '2026-10-23T18:00:00Z', abgang: '2026-10-23T18:09:00Z' },
          { user_id: 'u-erijon', bereich: 'gym', ankunft: '2026-10-24T00:00:00Z', abgang: '2026-10-24T12:01:00Z' },
          { user_id: 'u-erijon', bereich: 'gym', ankunft: '2026-10-24T13:00:00Z', abgang: null },
        ],
        gewicht: [
          { user_id: 'u-erijon', tag: '2026-10-23', kg: 81.4 },
          { user_id: 'u-koray', tag: '2026-10-24', kg: 82.1 },
        ],
        schlafnaechte_ansicht: [
          { user_id: 'u-erijon', nacht: '2026-10-20', schlaf_minuten: 420, nachtwert: 72 },
        ],
      }),
      personen,
      '2026-10-19',
      new Date('2026-10-27T12:00:00Z'),
    )

    expect(lage.status).toBe('abgeschlossen')
    expect(lage.wochenbeginn).toBe('2026-10-19')
    expect(lage.naechsterMontag).toBe('2026-10-26')
    expect(lage.personen.erijon.kategorien.gym).toMatchObject({
      echteDatensaetze: 3,
      tagespunkte: 2,
      gemesseneDatensaetze: 1,
      gemesseneMinuten: 20,
    })
    expect(lage.personen.erijon.kategorien.lesen).toMatchObject({
      echteDatensaetze: 1,
      tagespunkte: 1,
      gemesseneMinuten: 10,
    })
    expect(lage.personen.erijon.tagespunkte).toBe(4)
    expect(lage.personen.erijon.gewicht?.tagespunkte).toBe(1)
    expect(lage.personen.erijon.schlaf?.minutenMittelwert).toBe(420)
    expect(lage.personen.koray.schlaf?.minutenMittelwert).toBeNull()
    expect(lage.text).toContain('2026')
  })

  it('markiert eine partielle Sonntagserfassung und laesst fehlende Quelle unbekannt', async () => {
    const lage = await ermittleWochenlage(
      dbAus(
        {
          einheiten: [{ user_id: 'u-erijon', bereich: 'gym', tag: '2026-09-13', wert: 60 }],
          aufenthalte: [],
          gewicht: [],
          schlafnaechte_ansicht: [],
        },
        ['schlafnaechte_ansicht'],
      ),
      personen,
      '2026-09-07',
      // 20:00 in Berlin while summer time is active.
      new Date('2026-09-13T18:00:00Z'),
    )

    expect(lage.status).toBe('stand')
    expect(lage.teilwoche).toBe(true)
    expect(lage.tageImBericht).toBe(7)
    expect(lage.personen.erijon.tagespunkte).toBe(1)
    expect(lage.personen.erijon.schlaf).toBeNull()
    expect(lage.text).toContain('Stand')
    expect(lage.text).toContain('Schlaf: unbekannt')
  })

  it('weist keinen Nicht-Montag als Woche aus und liefert den Datenblock als String', async () => {
    await expect(
      baueWochenlage(dbAus({}), personen, '2026-09-08', new Date('2026-09-13T18:00:00Z')),
    ).rejects.toThrow(/Montag/)
    await expect(
      baueWochenlage(dbAus({}), personen, '2026-09-07', new Date('2026-09-13T18:00:00Z')),
    ).resolves.toContain('WOCHENLAGE')
  })
})
