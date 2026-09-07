import { describe, expect, it } from 'vitest'

const migrationen = import.meta.glob(
  '../../supabase/migrations/*_duell_wette_loeschen.sql',
  { eager: true, query: '?raw', import: 'default' }
) as Record<string, string>
const sql = Object.values(migrationen)[0] ?? ''

describe('gemeinsamen Wetteinsatz entfernen', () => {
  it('bleibt als bereits versionierte additive Forward-Migration erhalten', () => {
    expect(Object.keys(migrationen)).toHaveLength(1)
    expect(sql).toMatch(/begin;[\s\S]*commit;/i)
    expect(sql).not.toMatch(/delete from|drop table|drop column/i)
  })

  it('gibt DELETE nur Duellmitgliedern und nicht anon frei', () => {
    expect(sql).toMatch(/revoke delete[\s\S]*from public, anon/i)
    expect(sql).toMatch(/grant delete[\s\S]*to authenticated/i)
    expect(sql).toMatch(
      /create policy "duell wetten loeschen"[\s\S]*for delete to authenticated[\s\S]*private\.ist_duellprofil\(\)/i
    )
  })

  it('veraendert das unveraenderliche Wochenarchiv nicht', () => {
    expect(sql).not.toMatch(/alter table public\.wochenabrechnung|update public\.wochenabrechnung/i)
  })
})
