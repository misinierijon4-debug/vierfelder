import { describe, expect, it } from 'vitest'

const migrationen = import.meta.glob(
  '../../supabase/migrations/*_schlaf_quellloeschung_propagieren.sql',
  { eager: true, query: '?raw', import: 'default' }
) as Record<string, string>

const sql = Object.values(migrationen)[0] ?? ''

describe('schlaf-quellloeschung', () => {
  it('liegt genau einmal als forward-fix-migration vor', () => {
    expect(Object.keys(migrationen)).toHaveLength(1)
  })

  it('loescht die Projektion anhand des stabilen zusammengesetzten Schluessels', () => {
    expect(sql).toMatch(/delete from public\.schlaf_updates u/i)
    expect(sql).toMatch(/using alte_schlafnaechte d/i)
    expect(sql).toMatch(/u\.user_id = d\.user_id/i)
    expect(sql).toMatch(/u\.nacht = d\.nacht/i)
  })

  it('reagiert ausschliesslich nach einer bestaetigten Quellloeschung', () => {
    expect(sql).toMatch(/create trigger schlaf_quellloeschung_projektion\s+after delete on public\.schlafnaechte/i)
    expect(sql).toMatch(/referencing old table as alte_schlafnaechte\s+for each statement/i)
    expect(sql).not.toMatch(/for each row execute function private\.projiziere_schlaf_loeschung/i)
    expect(sql).not.toMatch(/before delete on public\.schlafnaechte/i)
  })

  it('bewertet nur die 13 abhaengigen Folgenaechte neu', () => {
    expect(sql).toMatch(/s\.user_id = d\.user_id/i)
    expect(sql).toMatch(/s\.nacht > d\.nacht/i)
    expect(sql).toMatch(/order by s\.nacht\s+limit 13/i)
    expect(sql).toMatch(/set schlaf_minuten = n\.schlaf_minuten/i)
  })

  it('haelt die privilegierte Triggerfunktion aus den Clientrollen heraus', () => {
    expect(sql).toMatch(/security definer\s+set search_path = ''/i)
    expect(sql).toMatch(/revoke all on function private\.projiziere_schlaf_loeschung\(\)\s+from public, anon, authenticated/i)
  })
})
