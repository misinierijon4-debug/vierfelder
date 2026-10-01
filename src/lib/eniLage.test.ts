import { describe, expect, it } from 'vitest'
import { baueLage, type LageDatenbank } from '../../supabase/functions/_shared/eniLage.ts'

type Tabellen = Record<string, Array<Record<string, unknown>>>

/** die Abfragekette der Lage: eq, gte, order, limit, danach awaiten */
function dbAus(tabellen: Tabellen, fehler: string[] = []): LageDatenbank {
  const db = {
    from(tabelle: string) {
      return {
        select() {
          let daten = [...(tabellen[tabelle] ?? [])]
          const api = {
            eq(spalte: string, wert: unknown) {
              daten = daten.filter((zeile) => zeile[spalte] === wert)
              return api
            },
            gte(spalte: string, wert: string) {
              daten = daten.filter((zeile) => String(zeile[spalte] ?? '') >= wert)
              return api
            },
            order(spalte: string, { ascending }: { ascending: boolean }) {
              daten.sort((a, b) => String(a[spalte]).localeCompare(String(b[spalte])) * (ascending ? 1 : -1))
              return api
            },
            limit(anzahl: number) {
              daten = daten.slice(0, anzahl)
              return api
            },
            then(aufloesen: (wert: unknown) => unknown) {
              return Promise.resolve(
                fehler.includes(tabelle)
                  ? { data: null, error: { message: `${tabelle} nicht lesbar` } }
                  : { data: daten, error: null },
              ).then(aufloesen)
            },
          }
          return api
        },
      }
    },
  }
  return db as unknown as LageDatenbank
}

const personen = new Map<string, 'erijon' | 'koray'>([
  ['u-erijon', 'erijon'],
  ['u-koray', 'koray'],
])

// donnerstag, 08.10.2026, 19 uhr in berlin; die woche beginnt am 05.10.
const JETZT = new Date('2026-10-08T17:00:00Z')

const einheit = (user: string, bereich: string, tag: string, wert: number | null = null) => ({
  user_id: user,
  bereich,
  tag,
  wert,
})

describe('Lage: Noten', () => {
  it('zeigt die Noten beider Personen, auch wenn eine sehr viel mehr eingetragen hat', async () => {
    const viele = Array.from({ length: 25 }, (_, i) => ({
      user_id: 'u-erijon',
      fach_id: 'f1',
      art: 'klausur',
      punkte: 10,
      datum: `2026-09-${String(i + 1).padStart(2, '0')}`,
    }))
    const lage = await baueLage(
      dbAus({
        faecher: [{ id: 'f1', user_id: 'u-erijon', name: 'Mathe' }, { id: 'f2', user_id: 'u-koray', name: 'Bio' }],
        // korays einzige Note ist die aelteste: unter den neuesten 20 insgesamt kam sie nie vor
        noten: [...viele, { user_id: 'u-koray', fach_id: 'f2', art: 'test', punkte: 13, datum: '2026-01-15' }],
      }),
      personen,
      JETZT,
    )
    expect(lage).toContain('Koray   Bio test 13')
  })

  it('meldet einen Ausfall der Noten, statt eine Person leer zu nennen', async () => {
    const lage = await baueLage(dbAus({}, ['noten']), personen, JETZT)
    expect(lage).toContain('Noten: nicht lesbar.')
  })
})

describe('Lage: Serie', () => {
  const einheiten = [
    // erijon: Mo bis Do lernen, also vier Tage in Folge einschliesslich heute
    ...['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08'].map((tag) => einheit('u-erijon', 'lernen', tag)),
    // koray: gym bis gestern, heute noch nicht; eine Luecke davor
    ...['2026-10-03', '2026-10-06', '2026-10-07'].map((tag) => einheit('u-koray', 'gym', tag)),
  ]

  it('zaehlt Tage in Folge, heute nur wenn erledigt', async () => {
    const lage = await baueLage(dbAus({ einheiten }), personen, JETZT)
    expect(lage).toMatch(/Erijon\s+lernen 4, gym 0, boxen 0, lesen 0, gewicht 0/)
    // gestern und vorgestern: zwei Tage, die Luecke am 05. beendet die Serie
    expect(lage).toMatch(/Koray\s+lernen 0, gym 2, boxen 0, lesen 0, gewicht 0/)
  })

  it('zaehlt ueber die Wochengrenze hinaus', async () => {
    const lage = await baueLage(
      dbAus({
        einheiten: ['2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05', '2026-10-06', '2026-10-07'].map((tag) =>
          einheit('u-erijon', 'lesen', tag),
        ),
      }),
      personen,
      JETZT,
    )
    expect(lage).toMatch(/Erijon\s+lernen 0, gym 0, boxen 0, lesen 6, gewicht 0/)
  })

  it('laesst die Wochenpunkte unveraendert, auch wenn mehr Tage gelesen werden', async () => {
    const lage = await baueLage(
      dbAus({ einheiten: [...einheiten, einheit('u-erijon', 'gym', '2026-09-20')] }),
      personen,
      JETZT,
    )
    expect(lage).toContain('Wochenstand (Erijon : Koray): 4:2.')
  })
})

describe('Lage: Zeit der Woche', () => {
  it('trennt gemessene und erfasste Minuten und addiert sie nie', async () => {
    const lage = await baueLage(
      dbAus({
        einheiten: [einheit('u-erijon', 'lernen', '2026-10-06', 90), einheit('u-erijon', 'lesen', '2026-10-07', 30)],
        aufenthalte: [
          // 60 minuten gemessen am dienstag
          { user_id: 'u-erijon', bereich: 'lernen', ankunft: '2026-10-06T14:00:00Z', abgang: '2026-10-06T15:00:00Z' },
          // zu kurz fuer einen Punkt: zaehlt auch nicht als Zeit
          { user_id: 'u-erijon', bereich: 'gym', ankunft: '2026-10-07T14:00:00Z', abgang: '2026-10-07T14:10:00Z' },
          // vorige woche
          { user_id: 'u-erijon', bereich: 'lernen', ankunft: '2026-10-01T14:00:00Z', abgang: '2026-10-01T16:00:00Z' },
        ],
      }),
      personen,
      JETZT,
    )
    expect(lage).toMatch(/Erijon\s+lernen 60 min gemessen, 90 min erfasst; lesen 30 Seiten erfasst/)
    expect(lage).toMatch(/Koray\s+nichts mit Minuten/)
  })
})

describe('Lage: abgeschlossene Wochen', () => {
  const wochen = [
    { woche: '2026-09-28', sieger: 'koray', grund: 'punkte', differenz: -3, punkte_erijon: 9, punkte_koray: 12 },
    { woche: '2026-09-21', sieger: 'erijon', grund: 'punkte', differenz: 3, punkte_erijon: 14, punkte_koray: 11 },
    { woche: '2026-09-14', sieger: 'erijon', grund: 'beleg', differenz: 0, punkte_erijon: 12, punkte_koray: 12 },
    // aeltere Fassung ohne Punkte: nur die Differenz steht fest
    { woche: '2026-09-07', sieger: 'unentschieden', grund: 'unentschieden', differenz: 0, punkte_erijon: null, punkte_koray: null },
  ]

  it('nennt das festgeschriebene Ergebnis, neueste zuerst, und die Bilanz', async () => {
    const lage = await baueLage(dbAus({ wochenabrechnung: wochen }), personen, JETZT)
    expect(lage).toContain('Woche ab 28.09. Koray (9:12); Woche ab 21.09. Erijon (14:11); Woche ab 14.09. Erijon (12:12, nach Beleg)')
    expect(lage).toContain('Woche ab 07.09. unentschieden (Differenz 0 fuer Erijon)')
    expect(lage).toContain('Bilanz aus 4 abgeschlossenen Wochen: Erijon 2 Siege, Koray 1, unentschieden 1.')
  })

  it('schweigt ohne Wochen und meldet einen Lesefehler', async () => {
    expect(await baueLage(dbAus({}), personen, JETZT)).not.toContain('Abgeschlossene Wochen')
    expect(await baueLage(dbAus({}, ['wochenabrechnung']), personen, JETZT)).toContain('Abgeschlossene Wochen: nicht lesbar.')
  })
})

describe('Lage: Gewichtstrend und Schlafschnitt', () => {
  it('zeigt einen Trend erst ab einer Woche Abstand', async () => {
    const lage = await baueLage(
      dbAus({
        gewicht: [
          { user_id: 'u-erijon', tag: '2026-09-14', kg: 82.6 },
          { user_id: 'u-erijon', tag: '2026-10-08', kg: 81.4 },
          // koray hat nur zwei Werte an aufeinanderfolgenden Tagen: kein Trend
          { user_id: 'u-koray', tag: '2026-10-07', kg: 90 },
          { user_id: 'u-koray', tag: '2026-10-08', kg: 89.5 },
        ],
      }),
      personen,
      JETZT,
    )
    expect(lage).toContain('Erijon  14.09. 82,6 auf 08.10. 81,4: minus 1,2 kg')
    expect(lage).not.toMatch(/Koray\s+07\.10\. 90,0 auf/)
  })

  it('rechnet den Schlafschnitt aus den gezeigten Naechten', async () => {
    const lage = await baueLage(
      dbAus({
        schlafnaechte_ansicht: [
          { user_id: 'u-erijon', nacht: '2026-10-07', schlaf_minuten: 420, nachtwert: 70 },
          { user_id: 'u-erijon', nacht: '2026-10-06', schlaf_minuten: 360, nachtwert: 60 },
        ],
      }),
      personen,
      JETZT,
    )
    expect(lage).toContain('(Schnitt 6,5h aus 2 Naechten)')
  })
})
