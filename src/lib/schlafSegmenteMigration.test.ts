import { describe, expect, it } from 'vitest'

const migrationen = import.meta.glob(
  '../../supabase/migrations/*_schlaf_segmente_verzeihend.sql',
  { eager: true, query: '?raw', import: 'default' }
) as Record<string, string>

const sql = Object.values(migrationen)[0] ?? ''

const rateLimit = import.meta.glob(
  '../../supabase/migrations/*_schlaf_import_rate_limit.sql',
  { eager: true, query: '?raw', import: 'default' }
) as Record<string, string>

const vorher = Object.values(rateLimit)[0] ?? ''

describe('schlaf-segmente verzeihend annehmen', () => {
  it('liegt genau einmal als forward-fix-migration vor', () => {
    expect(Object.keys(migrationen)).toHaveLength(1)
  })

  it('nimmt die liste als array, als {segments:[...]} und als text entgegen', () => {
    expect(sql).toMatch(/create or replace function public\._slfn_segmente\(raw jsonb\)/i)
    expect(sql).toMatch(/when 'array' then\s+return raw;/i)
    expect(sql).toMatch(/jsonb_typeof\(raw->'segments'\) = 'array'/i)
    expect(sql).toMatch(/when 'string' then/i)
    expect(sql).toMatch(/v_geparst := v_text::jsonb;/i)
  })

  it('packt ein einzelnes segment-woerterbuch in ein array', () => {
    expect(sql).toMatch(/raw \? 'start' and raw \? 'end'/i)
    expect(sql).toMatch(/return jsonb_build_array\(raw\);/i)
  })

  it('packt eine zeichenkette nur eine ebene aus', () => {
    expect(sql).toMatch(/if jsonb_typeof\(v_geparst\) = 'string' then\s+return null;/i)
  })

  it('gibt bei ungueltigem json keine datenbankfehlermeldung nach aussen', () => {
    expect(sql).toMatch(/exception when others then\s+return null;/i)
  })

  it('benennt in der ablehnung den tatsaechlich angekommenen typ', () => {
    expect(sql).toMatch(/angekommen ist %/i)
    expect(sql).toMatch(/coalesce\(jsonb_typeof\(p_raw_segments\), 'nichts'\)/i)
    expect(sql).toMatch(/errcode = 'invalid_parameter_value'/i)
  })

  it('prueft das token weiterhin vor der nutzlast', () => {
    const tokenPruefung = sql.search(/import-token ist ungueltig/i)
    const segmentPruefung = sql.search(/_slfn_segmente\(p_raw_segments\)/i)
    expect(tokenPruefung).toBeGreaterThan(-1)
    expect(segmentPruefung).toBeGreaterThan(tokenPruefung)
  })

  it('laesst rate-limit und grenzen unveraendert', () => {
    expect(sql).toMatch(/jsonb_array_length\(v_segs\) not between 1 and 300/i)
    expect(sql).toMatch(/octet_length\(v_segs::text\) > 524288/i)
    expect(sql).toMatch(/if v_anfragen > 30 then/i)
    expect(sql).toMatch(/date_bin\(\s*interval '15 minutes'/i)
  })

  it('reicht das fertige array an record_sleep_night_internal weiter', () => {
    expect(sql).toMatch(
      /return public\.record_sleep_night_internal\(\s*p_night_date, v_segs, p_source_name, p_target_hours, p_user_id, p_token\s*\)/i
    )
    expect(sql).not.toMatch(/create or replace function public\.record_sleep_night_internal/i)
  })

  it('haelt die helferfunktion aus den clientrollen heraus', () => {
    expect(sql).toMatch(
      /revoke all on function public\._slfn_segmente\(jsonb\) from public, anon, authenticated/i
    )
  })

  it('behaelt die rollenvergabe des wrappers bei', () => {
    for (const quelle of [vorher, sql]) {
      expect(quelle).toMatch(
        /revoke all on function public\.record_sleep_night\(\s*jsonb, jsonb, jsonb, jsonb, jsonb, jsonb\s*\) from public, authenticated/i
      )
      expect(quelle).toMatch(
        /grant execute on function public\.record_sleep_night\(\s*jsonb, jsonb, jsonb, jsonb, jsonb, jsonb\s*\) to anon, service_role/i
      )
    }
  })

  it('aendert die bestehende rate-limit-migration nicht', () => {
    expect(vorher).toMatch(/p_raw_segments muss ein array sein/i)
    expect(vorher).not.toMatch(/_slfn_segmente/i)
  })
})
