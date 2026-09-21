import { describe, expect, it } from 'vitest'

const neue = import.meta.glob(
  '../../supabase/migrations/*_wochenbericht_meldung_ohne_nachtzusatz.sql',
  { eager: true, query: '?raw', import: 'default' }
) as Record<string, string>
const sql = Object.values(neue)[0] ?? ''

const vorige = import.meta.glob(
  '../../supabase/migrations/*_wochenbericht_nachtrag_push_und_persoenliche_texte.sql',
  { eager: true, query: '?raw', import: 'default' }
) as Record<string, string>
const vorher = Object.values(vorige)[0] ?? ''

/** der funktionsrumpf ab `create or replace`, ohne den kommentarkopf davor */
function rumpf(datei: string): string {
  const start = datei.indexOf('create or replace function public.aktivitaets_kandidaten(')
  return start < 0 ? '' : datei.slice(start)
}

describe('die montagsmeldung ohne nachtzusatz', () => {
  it('liegt genau einmal als forward-migration vor', () => {
    expect(Object.keys(neue)).toHaveLength(1)
  })

  it('sagt nur noch, dass der bericht fertig ist', () => {
    expect(sql).toContain(`'dein wochenbericht für letzte woche ist fertig.'::text as nachricht`)
    // Nur der Rumpf: der Kommentarkopf zitiert den entfernten Zusatz absichtlich.
    expect(rumpf(sql)).not.toContain('mit der letzten nacht')
  })

  it('aendert nichts ausser dieser einen zeile', () => {
    // Die feste Rueckgabeform zwingt zum vollstaendigen Ersetzen der Funktion.
    // Genau deshalb wird hier Zeile fuer Zeile gegen die Vorgaengerfassung
    // geprueft: ein versehentlich mitkopierter Unterschied faellt sofort auf.
    const alt = rumpf(vorher).split('\n')
    const jetzt = rumpf(sql).split('\n')
    expect(jetzt).toHaveLength(alt.length)
    const anders = alt
      .map((zeile, i) => (zeile === jetzt[i] ? null : i))
      .filter((i): i is number => i !== null)
    expect(anders).toHaveLength(1)
    expect(alt[anders[0]!]).toContain('mit der letzten nacht')
    expect(jetzt[anders[0]!]).toContain('ist fertig.')
  })

  it('laesst den nachtrag selbst unangetastet', () => {
    // Nachgetragen wird weiter; nur die Meldung schweigt darueber.
    expect(sql).not.toMatch(/wochenbericht_nachtrag|ergaenze_wochenbericht_naechte/i)
    expect(sql).not.toMatch(/naechte_vollstaendig\s*=/)
    expect(sql).toContain('w.naechte_vollstaendig is not null')
  })
})
