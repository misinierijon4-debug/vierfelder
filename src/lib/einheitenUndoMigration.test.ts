import { describe, expect, it } from 'vitest'

const migrationen = import.meta.glob(
  '../../supabase/migrations/*_einheiten_undo_atomar.sql',
  { eager: true, query: '?raw', import: 'default' }
) as Record<string, string>
const sql = Object.values(migrationen)[0] ?? ''

describe('atomare Einheiten-Undo-Migration', () => {
  it('liegt genau einmal als Forward-Migration vor', () => {
    expect(Object.keys(migrationen)).toHaveLength(1)
    expect(sql).toContain('drop function if exists public.stelle_einheiten_wieder_her(jsonb)')
    expect(sql).toContain('create function public.stelle_einheiten_wieder_her')
    expect(sql).toMatch(/returns\s+uuid\[\]/i)
  })

  it('laeuft als enger SECURITY-INVOKER-Vertrag mit Auth und Mitgliedschaft', () => {
    expect(sql).toMatch(/security\s+invoker/i)
    expect(sql).not.toMatch(/security\s+definer/i)
    expect(sql).toMatch(/set\s+search_path\s*=\s*''/i)
    expect(sql).toContain('auth.uid()')
    expect(sql).toContain('private.ist_duellprofil()')
    expect(sql).toMatch(/errcode\s*=\s*'42501'/i)
    expect(sql).not.toMatch(/disable\s+row\s+level\s+security/i)
  })

  it('entzieht Standardrechte und erteilt EXECUTE nur authenticated', () => {
    expect(sql).toMatch(
      /revoke\s+all\s+on\s+function\s+public\.stelle_einheiten_wieder_her\(jsonb\)[\s\S]*?from\s+public,\s*anon,\s*authenticated\s*;/i
    )
    expect(sql).toMatch(
      /grant\s+execute\s+on\s+function\s+public\.stelle_einheiten_wieder_her\(jsonb\)[\s\S]*?to\s+authenticated\s*;/i
    )
    expect(sql).not.toMatch(/to\s+(public|anon)\s*;/i)
  })

  it('validiert den strikten 0-bis-64-JSON-Vertrag vor dem Insert', () => {
    const insert = sql.indexOf('insert into public.einheiten')
    expect(insert).toBeGreaterThan(0)
    for (const muster of [
      'jsonb_typeof(p_einheiten)',
      'jsonb_array_length(p_einheiten)',
      'v_anzahl > 64',
      "v_anzahl = 0",
      'jsonb_object_keys(input.element)',
      "array['id', 'bereich', 'tag', 'wert', 'erfasst', 'von']",
      "count(distinct (input.element ->> 'id')::uuid) <> v_anzahl",
      "count(distinct input.element ->> 'bereich') <> 1",
      "count(distinct input.element ->> 'tag') <> 1",
    ]) {
      const position = sql.indexOf(muster)
      expect(position, muster).toBeGreaterThan(0)
      expect(position, muster).toBeLessThan(insert)
    }
  })

  it('schreibt einmal, ueberschreibt nie und rollt bei unexaktem Postcheck zurueck', () => {
    expect(sql.match(/insert\s+into\s+public\.einheiten/gi)).toHaveLength(1)
    expect(sql).toMatch(/order\s+by\s+\(input\.element\s*->>\s*'id'\)::uuid[\s\S]*on\s+conflict\s*\(id\)\s+do\s+nothing/i)

    const insert = sql.indexOf('insert into public.einheiten')
    const postcheck = sql.indexOf('select count(*)', insert)
    const konflikt = sql.indexOf("errcode = '40001'", postcheck)
    expect(postcheck).toBeGreaterThan(insert)
    expect(sql.slice(postcheck)).toContain('is not distinct from')
    expect(sql.slice(postcheck)).toContain('gespeichert.user_id = v_user_id')
    expect(konflikt).toBeGreaterThan(postcheck)
    expect(sql.indexOf('commit;')).toBeGreaterThan(konflikt)
  })

  it('liefert genau die Eingabe-UUIDs in stabiler Eingabereihenfolge', () => {
    expect(sql).toMatch(/with\s+ordinality\s+as\s+input\(element,\s*position\)/i)
    expect(sql).toMatch(
      /array_agg\(\(input\.element\s*->>\s*'id'\)::uuid\s+order\s+by\s+input\.position\)/i
    )
    expect(sql).toMatch(/return\s+v_ids\s*;/i)
  })
})
