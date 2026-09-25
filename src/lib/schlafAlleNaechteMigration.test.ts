import { describe, expect, it } from 'vitest'

const migrationen = import.meta.glob('../../supabase/migrations/*_schlaf_alle_naechte.sql', {
  eager: true,
  query: '?raw',
  import: 'default',
}) as Record<string, string>

const sql = Object.values(migrationen)[0] ?? ''

describe('schlafimport speichert jede nacht im fenster', () => {
  it('liegt genau einmal als forward-fix-migration vor', () => {
    expect(Object.keys(migrationen)).toHaveLength(1)
  })

  it('bildet naechte wie _slfn_nacht_kennzahlen: luecke ueber drei stunden, datum am episodenende', () => {
    expect(sql).toMatch(/create or replace function public\._slfn_naechte\(p_segs jsonb\)/i)
    expect(sql).toMatch(/st - vorher > interval '3 hours'/i)
    expect(sql).toMatch(/\(bis at time zone 'Europe\/Berlin'\)::date as nacht/i)
  })

  it('ordnet jedes segment genau einer nacht zu, nach seinem start', () => {
    expect(sql).toMatch(/n\.vorher_bis is null or public\._slfn_parse_ts\(s->'start'\) >= n\.vorher_bis/i)
    expect(sql).toMatch(/n\.nachher_von is null or public\._slfn_parse_ts\(s->'start'\) < n\.nachher_von/i)
  })

  it('rechnet die naechte von alt nach neu und behaelt je nacht den frueheren teil', () => {
    expect(sql).toMatch(/for n in select \* from public\._slfn_naechte\(v_segs\) order by nr loop/i)
    expect(sql).toMatch(/v_teil := public\._slfn_frueheren_teil_behalten\(v_user, n\.nacht, v_teil\);/i)
  })

  it('schreibt eine aeltere nacht nur, wenn sie laenger wird', () => {
    expect(sql).toMatch(/if n\.nr < n\.anzahl then/i)
    expect(sql).toMatch(/v_neu_von < v_alt_von - interval '1 minute'/i)
    expect(sql).toMatch(/v_neu_bis > v_alt_bis \+ interval '1 minute'/i)
  })

  it('legt die abgeschnittene erste nacht im fenster nicht neu an', () => {
    expect(sql).toMatch(/if not found then[\s\S]*?continue when n\.nr = 1;/i)
  })

  it('laesst p_night_date bei einem aufruf wie bisher', () => {
    expect(sql).toMatch(
      /v_nacht := public\._slfn_parse_date\(p_night_date\);\s+if v_nacht is not null then[\s\S]*?return public\.record_sleep_night_internal\(\s*p_night_date, v_segs/i
    )
  })

  it('meldet ohne schlafsegmente denselben fehler wie bisher ueber _internal', () => {
    expect(sql).toMatch(/if v_ergebnis is null then[\s\S]*?return public\.record_sleep_night_internal\(\s*null, v_segs/i)
  })

  it('gibt die letzte nacht zurueck und nennt alle geschriebenen', () => {
    expect(sql).toMatch(/return v_ergebnis \|\| jsonb_build_object\('naechte', to_jsonb\(v_geschrieben\)\);/i)
  })

  it('haelt die segmentgrenze an einer stelle, die groessengrenze bleibt', () => {
    expect(sql).toMatch(/create or replace function public\._slfn_max_segmente\(\)/i)
    expect(sql).toMatch(/not between 1 and public\._slfn_max_segmente\(\)/i)
    expect(sql).toMatch(/octet_length\(v_segs::text\) > 524288/i)
  })

  it('prueft token vor nutzlast und laesst das rate-limit stehen', () => {
    expect(sql.search(/import-token ist ungueltig/i)).toBeLessThan(sql.search(/_slfn_segmente\(p_raw_segments\)/i))
    expect(sql).toMatch(/if v_anfragen > 30 then/i)
  })

  it('laesst record_sleep_night_internal unangetastet', () => {
    expect(sql).not.toMatch(/create or replace function public\.record_sleep_night_internal/i)
  })

  it('haelt die helfer aus den clientrollen heraus', () => {
    expect(sql).toMatch(/revoke all on function public\._slfn_max_segmente\(\) from public, anon, authenticated/i)
    expect(sql).toMatch(/revoke all on function public\._slfn_naechte\(jsonb\) from public, anon, authenticated/i)
    expect(sql).toMatch(/\) from public, authenticated;\s+grant execute[\s\S]*\) to anon, service_role;/i)
  })
})
