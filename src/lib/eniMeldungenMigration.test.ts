import { describe, expect, it } from 'vitest'

const neue = import.meta.glob('../../supabase/migrations/*_eni_meldungen.sql', {
  eager: true,
  query: '?raw',
  import: 'default',
}) as Record<string, string>
const sql = Object.values(neue)[0] ?? ''

const vorige = import.meta.glob('../../supabase/migrations/*_ansagen_stufen.sql', {
  eager: true,
  query: '?raw',
  import: 'default',
}) as Record<string, string>
const vorher = Object.values(vorige)[0] ?? ''

/** der funktionsrumpf ab `create or replace` bis zum grant, ohne kommentarkopf */
function rumpf(datei: string): string {
  const start = datei.indexOf('create or replace function public.aktivitaets_kandidaten(')
  const marke = 'grant execute on function public.aktivitaets_kandidaten(timestamptz) to service_role;'
  const ende = datei.indexOf(marke, start)
  return start < 0 || ende < 0 ? '' : datei.slice(start, ende + marke.length)
}

/** ein abschnitt zwischen zwei marken, beide eingeschlossen bzw. ausgeschlossen */
function zwischen(text: string, von: string, bis: string): string {
  const a = text.indexOf(von)
  const b = text.indexOf(bis, a)
  return a < 0 || b < 0 ? '' : text.slice(a, b)
}

describe('ENI meldet sich: sonntagsstand und faellige aufgaben', () => {
  it('liegt genau einmal als forward-migration vor und baut auf der produktiven fassung auf', () => {
    expect(Object.keys(neue)).toHaveLength(1)
    expect(rumpf(vorher)).not.toBe('')
    expect(rumpf(sql)).not.toBe('')
  })

  it('uebernimmt alles ausser den zwei geaenderten stellen woertlich', () => {
    const alt = rumpf(vorher)
    const neu = rumpf(sql)
    // alles vor der sonntagsmeldung
    const kopf = alt.slice(0, alt.indexOf('  alter_wochenblick as ('))
    expect(neu.startsWith(kopf)).toBe(true)
    // alles zwischen sonntagsmeldung und dem schluss-select
    const mitte = zwischen(alt, '  partner as (', '  select * from grundtaetigkeiten')
    expect(mitte.length).toBeGreaterThan(1000)
    expect(neu).toContain(mitte.trimEnd())
    for (const teil of ['grundtaetigkeiten', 'alter_wochenblick', 'partner', 'neue_wochenrueckblicke', 'fertige_wochenberichte', 'neue_ansagen']) {
      expect(neu).toMatch(new RegExp(`(select \\* from|union all select \\* from) ${teil}\\b`))
    }
    expect(neu).toContain('union all select * from faellige_aufgaben;')
  })

  it('bleibt eine invoker-funktion mit leerem suchpfad, die nur der dienst ausfuehren darf', () => {
    const neu = rumpf(sql)
    expect(neu).toContain('security invoker')
    expect(neu).toContain("set search_path = ''")
    expect(neu).toMatch(/revoke all on function public\.aktivitaets_kandidaten\(timestamptz\)\s+from public, anon, authenticated;/)
    expect(neu).toContain('grant execute on function public.aktivitaets_kandidaten(timestamptz) to service_role;')
  })

  it('fuegt den schalter und die art hinzu, ohne daten zu aendern', () => {
    expect(sql).toContain('add column if not exists aufgabe_aktiv boolean not null default true')
    const pruefung = zwischen(sql, 'add constraint aktivitaets_versand_art_check', ';')
    for (const art of ['lernen', 'lesen', 'wochenblick', 'partner', 'wochenrueckblick', 'wochenbericht', 'ansage', 'aufgabe']) {
      expect(pruefung).toContain(`'${art}'`)
    }
    expect(sql).not.toMatch(/\b(update|delete from|insert into)\s+public\.(?!aktivitaets_versand)/i)
  })

  it('schickt den sonntagsstand ab 18:10 und zaehlt nur entschiedene ansagen', () => {
    const wochenblick = zwischen(rumpf(sql), '  alter_wochenblick as (', '  partner as (')
    expect(wochenblick).toContain("l.zeit >= time '18:10' and l.zeit < time '19:00'")
    const punkte = zwischen(rumpf(sql), '  ansage_punkte as (', '  ansagen_offen as (')
    expect(punkte).toContain("d.ergebnis in ('geschafft', 'verfehlt')")
    expect(punkte).toContain("case when d.reaktion = 'kontern' then 2 else 1 end")
  })

  it('meldet nur eigene, offene aufgaben mit frist heute, morgens', () => {
    const aufgaben = zwischen(rumpf(sql), '  faellige_aufgaben as (', '  select * from grundtaetigkeiten')
    expect(aufgaben).toContain('e.user_id = s.user_id')
    expect(aufgaben).toContain("e.art = 'aufgabe'")
    expect(aufgaben).toContain('not e.erledigt')
    expect(aufgaben).toContain('e.bis = l.tag')
    expect(aufgaben).toContain('s.aufgabe_aktiv')
    expect(aufgaben).toContain("l.zeit >= time '08:30' and l.zeit < time '10:00'")
  })
})
