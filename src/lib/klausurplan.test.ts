import { describe, expect, it } from 'vitest'
import { ABITURPLAN, KLAUSURPLAN } from './klausurplan'

const dateien = import.meta.glob('../../supabase/migrations/*_klausuren.sql', {
  eager: true,
  query: '?raw',
  import: 'default',
}) as Record<string, string>
const sql = Object.values(dateien)[0] ?? ''

const vorige = import.meta.glob('../../supabase/migrations/*_eni_meldungen.sql', {
  eager: true,
  query: '?raw',
  import: 'default',
}) as Record<string, string>
const vorher = Object.values(vorige)[0] ?? ''

const abiturDateien = import.meta.glob('../../supabase/migrations/*_abitur_termine.sql', {
  eager: true,
  query: '?raw',
  import: 'default',
}) as Record<string, string>
const abitur = Object.values(abiturDateien)[0] ?? ''

/** die zeilen aus dem `values`-block der migration, als planzeilen gelesen */
function planAusMigration(datei = sql): unknown[] {
  const block = datei.slice(datei.indexOf('from (values'), datei.indexOf(') as k(person'))
  const wert = (roh: string) => (roh === 'null' ? null : roh.slice(1, -1))
  return [...block.matchAll(/^\s*\((.*)\),?$/gm)].map((treffer) =>
    treffer[1]!.split(/,\s+(?=(?:'|null))/).map((teil) => wert(teil.trim())))
}

const nachtraege = import.meta.glob('../../supabase/migrations/*_klausur_meldung_konkret.sql', {
  eager: true,
  query: '?raw',
  import: 'default',
}) as Record<string, string>
const konkret = Object.values(nachtraege)[0] ?? ''

const erdkundeDateien = import.meta.glob('../../supabase/migrations/*_fach_erdkunde.sql', {
  eager: true,
  query: '?raw',
  import: 'default',
}) as Record<string, string>
const erdkunde = Object.values(erdkundeDateien)[0] ?? ''

const sozialkundeDateien = import.meta.glob('../../supabase/migrations/*_fach_sozialkunde.sql', {
  eager: true,
  query: '?raw',
  import: 'default',
}) as Record<string, string>
const sozialkunde = Object.values(sozialkundeDateien)[0] ?? ''

/**
 * der plan nach beiden nachträgen: `*_fach_erdkunde.sql` setzt korays zeit und
 * benennt um, `*_fach_sozialkunde.sql` nimmt nur den namen zurück
 */
function mitNachtraegen(plan: unknown[]): unknown[] {
  return plan.map((zeile) => {
    const [wer, fach, kurs, datum] = zeile as Array<string | null>
    if (wer !== 'koray' || fach !== 'sozialkunde') return zeile
    return [wer, fach, kurs, datum, '09:45', '11:20', '']
  })
}

function rumpf(datei: string): string {
  const start = datei.indexOf('create or replace function public.aktivitaets_kandidaten(')
  const marke = 'grant execute on function public.aktivitaets_kandidaten(timestamptz) to service_role;'
  const ende = datei.indexOf(marke, start)
  return start < 0 || ende < 0 ? '' : datei.slice(start, ende + marke.length)
}

describe('klausurplan', () => {
  it('steht im prototyp genauso wie in der migration', () => {
    expect(Object.keys(dateien)).toHaveLength(1)
    expect(mitNachtraegen(planAusMigration())).toEqual(KLAUSURPLAN.map((zeile) => [...zeile]))
  })

  it('hat je person höchstens eine klausur pro fach und gültige zeiten', () => {
    const schluessel = KLAUSURPLAN.map(([wer, fach]) => `${wer}|${fach}`)
    expect(new Set(schluessel).size).toBe(schluessel.length)
    for (const [, , , datum, beginn, ende] of KLAUSURPLAN) {
      expect(datum).toMatch(/^2026-(09|1[0-2])-\d{2}$/)
      expect(beginn === null).toBe(ende === null)
      if (beginn && ende) expect(beginn < ende).toBe(true)
    }
  })

  it('übernimmt die push-funktion bis auf die neue art wörtlich', () => {
    const alt = rumpf(vorher)
    const neu = rumpf(sql)
    expect(alt).not.toBe('')
    const marke = '  select * from grundtaetigkeiten'
    const kopf = alt.slice(0, alt.indexOf(marke)).replace(/\s+\)\s*$/, '')
    expect(neu.startsWith(kopf)).toBe(true)
    expect(neu).toContain('  anstehende_klausuren as (')
    expect(neu).toContain('union all select * from faellige_aufgaben\n  union all select * from anstehende_klausuren;')
    expect(neu).toContain('security invoker')
    expect(neu).toContain("set search_path = ''")
  })

  it('ändert keine bestehenden daten', () => {
    expect(sql).not.toMatch(/\b(update|delete from)\s+public\./i)
    expect(sql.match(/insert into public\.(\w+)/gi)).toEqual(['insert into public.klausuren'])
    expect(sql).toContain('add column if not exists klausur_aktiv boolean not null default true')
  })

  it('nachtrag: aendert nur die klausur-meldung und nennt die klausur danach', () => {
    expect(Object.keys(nachtraege)).toHaveLength(1)
    const alt = rumpf(sql)
    const neu = rumpf(konkret)
    const marke = '  -- Klausuren aus dem festen Plan'
    expect(neu.slice(0, neu.indexOf(marke))).toBe(alt.slice(0, alt.indexOf(marke)))
    const schluss = '  select * from grundtaetigkeiten'
    expect(neu.slice(neu.indexOf(schluss))).toBe(alt.slice(alt.indexOf(schluss)))
    expect(neu).toContain("then ' danach: '")
    expect(neu).toContain("when 7 then 'in einer woche '")
    expect(konkret).not.toMatch(/\b(insert into|update|delete from|drop policy)\b/i)
  })

  it('nachtrag erdkunde: benennt nur das fach um und setzt korays zeit', () => {
    expect(Object.keys(erdkundeDateien)).toHaveLength(1)
    expect(erdkunde).toContain("set name = 'erdkunde'")
    expect(erdkunde).toContain("and f.name = 'sozialkunde';")
    expect(erdkunde).toContain("set beginn = '09:45', ende = '11:20', bemerkung = ''")
    expect(erdkunde).toContain("and p.person = 'koray'")
    expect(erdkunde).toContain('and k.beginn is null;')
    expect(erdkunde).not.toMatch(/\b(delete|drop|insert into|create)\b/i)
  })

  it('abiturtermine: stehen im prototyp genauso wie in der migration', () => {
    expect(Object.keys(abiturDateien)).toHaveLength(1)
    expect(planAusMigration(abitur)).toEqual(ABITURPLAN.map((zeile) => [...zeile]))
    expect(abitur).toContain("select p.id, f.id, 'abitur', k.kurs")
    expect(abitur).toContain('on conflict (fach_id, art, datum) do nothing;')
    expect(abitur.match(/insert into public\.(\w+)/gi)).toEqual(['insert into public.klausuren'])
    expect(abitur).not.toMatch(/\b(update|delete from|drop|alter|create)\b/i)
  })

  it('abiturtermine: vier prüfungen je person, schriftlich im januar, mündlich im märz', () => {
    for (const person of ['erijon', 'koray'] as const) {
      const eigene = ABITURPLAN.filter(([wer]) => wer === person)
      expect(eigene).toHaveLength(4)
      expect(new Set(eigene.map(([, fach]) => fach)).size).toBe(4)
      for (const [, , , datum, beginn, ende, bemerkung] of eigene) {
        expect(beginn).toBeNull()
        expect(ende).toBeNull()
        expect(bemerkung.length).toBeLessThanOrEqual(80)
        expect(datum).toMatch(bemerkung.startsWith('schriftlich') ? /^2027-01-(1[3-9]|2\d)$/ : /^2027-03-15$/)
      }
      expect(eigene.filter(([, , , , , , b]) => b.startsWith('mündlich'))).toHaveLength(1)
    }
    // geschichte gw schreiben beide am selben tag
    expect(ABITURPLAN.filter(([, fach, , datum]) => fach === 'geschichte' && datum === '2027-01-18')).toHaveLength(2)
  })

  it('nachtrag sozialkunde: nimmt nur den namen zurück', () => {
    expect(Object.keys(sozialkundeDateien)).toHaveLength(1)
    expect(sozialkunde).toContain("set name = 'sozialkunde'")
    expect(sozialkunde).toContain("and f.name = 'erdkunde';")
    expect(sozialkunde).not.toMatch(/klausuren|\b(delete|drop|insert into|create)\b/i)
  })
})
