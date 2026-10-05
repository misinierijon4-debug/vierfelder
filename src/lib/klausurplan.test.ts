import { describe, expect, it } from 'vitest'
import { KLAUSURPLAN } from './klausurplan'

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

/** die zeilen aus dem `values`-block der migration, als planzeilen gelesen */
function planAusMigration(): unknown[] {
  const block = sql.slice(sql.indexOf('from (values'), sql.indexOf(') as k(person'))
  const wert = (roh: string) => (roh === 'null' ? null : roh.slice(1, -1))
  return [...block.matchAll(/^\s*\((.*)\),?$/gm)].map((treffer) =>
    treffer[1]!.split(/,\s+(?=(?:'|null))/).map((teil) => wert(teil.trim())))
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
    expect(planAusMigration()).toEqual(KLAUSURPLAN.map((zeile) => [...zeile]))
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
})
