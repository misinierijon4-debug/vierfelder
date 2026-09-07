import { describe, expect, it } from 'vitest'

const migrationen = import.meta.glob(
  '../../supabase/migrations/*_duell_wette_cas.sql',
  { eager: true, query: '?raw', import: 'default' }
) as Record<string, string>
const abschlussMigrationen = import.meta.glob(
  '../../supabase/migrations/*_duell_wochenabschluss_serverautoritaer.sql',
  { eager: true, query: '?raw', import: 'default' }
) as Record<string, string>

const sql = Object.values(migrationen)[0] ?? ''
const abschlussSql = Object.values(abschlussMigrationen)[0] ?? ''
const wochenLock =
  /pg_catalog\.hashtextextended\('zweikampf:wochenabrechnung:' \|\| p_woche::text, 0\)/i

describe('atomare gemeinsame Wette', () => {
  it('ersetzt die nicht ausgerollte Delete-Migration genau einmal', () => {
    expect(Object.keys(migrationen)).toHaveLength(1)
    expect(sql).toMatch(/begin;[\s\S]*commit;/i)
    expect(sql).not.toMatch(/grant delete on table public\.duell_wetten/i)
    expect(sql).not.toMatch(/delete from public\.duell_wetten/i)
  })

  it('verwendet eine servergenerierte globale bigint-Version ohne JS-Praezisionsverlust', () => {
    expect(sql).toMatch(/create sequence[\s\S]*private\.duell_wetten_version_seq[\s\S]*as bigint/i)
    expect(sql).toMatch(/add column if not exists version bigint/i)
    expect(sql).toMatch(/nextval\('private\.duell_wetten_version_seq'::regclass\)/i)
    expect(sql).toMatch(/version_text text[\s\S]*generated always as \(version::text\) stored/i)
    expect(sql).toMatch(/text is null[\s\S]*char_length\(text\) between 1 and 160/i)
    expect(sql).toMatch(
      /do \$\$[\s\S]*from public\.duell_wetten w[\s\S]*w\.text <> pg_catalog\.btrim\(w\.text\)[\s\S]*nicht-kanonischen Alttext/i
    )
  })

  it('laesst authentifizierte Clients nur lesen und die schmale RPC ausfuehren', () => {
    expect(sql).toMatch(
      /revoke insert, update, delete on table public\.duell_wetten[\s\S]*from public, anon, authenticated/i
    )
    expect(sql).toMatch(/grant select on table public\.duell_wetten to authenticated/i)
    expect(sql).toMatch(
      /create policy "duell wetten lesen"[\s\S]*for select to authenticated[\s\S]*private\.ist_duellprofil\(\)/i
    )
    expect(sql).toMatch(
      /function private\.setze_duell_wette\([\s\S]*security definer\s+set search_path = ''/i
    )
    expect(sql).toMatch(
      /function public\.setze_duell_wette\([\s\S]*security invoker\s+set search_path = ''/i
    )
    expect(sql).toMatch(
      /revoke all on function public\.setze_duell_wette\(date, text, bigint\)[\s\S]*from public, anon, authenticated/i
    )
    expect(sql).toMatch(
      /grant execute on function public\.setze_duell_wette\(date, text, bigint\)[\s\S]*to authenticated/i
    )
  })

  it('prueft Mitgliedschaft, Montag, Text und Expected-Version fail-closed', () => {
    expect(sql).toMatch(/v_aufrufer is null or not \(select private\.ist_duellprofil\(\)\)/i)
    expect(sql).toMatch(/extract\(isodow from p_woche\) <> 1/i)
    expect(sql).toMatch(/p_text <> pg_catalog\.btrim\(p_text\)/i)
    expect(sql).toMatch(/char_length\(p_text\) not between 1 and 160/i)
    expect(sql).toMatch(/v_aktuell\.version <> p_erwartete_version/i)
    expect(sql).toMatch(/not found and p_erwartete_version <> 0/i)
    expect(sql).toMatch(/errcode = '40001'/i)
  })

  it('teilt den Wochenlock mit dem Abschluss und prueft danach den Archivschutz', () => {
    expect(sql).toMatch(wochenLock)
    expect(abschlussSql).toMatch(wochenLock)
    const lockPosition = sql.search(wochenLock)
    const archivPosition = sql.search(/from public\.wochenabrechnung a where a\.woche = p_woche/i)
    expect(lockPosition).toBeGreaterThanOrEqual(0)
    expect(archivPosition).toBeGreaterThan(lockPosition)
    expect(sql).toMatch(/eine archivierte woche darf nicht mehr geaendert werden/i)
  })

  it('liefert Tombstone, Autor, Serverzeit und Version als exakt pruefbare RPC-Zeile', () => {
    expect(sql).toMatch(/updated_by,\s*updated_at,\s*version/i)
    expect(sql).toMatch(/v_aufrufer,\s*pg_catalog\.clock_timestamp\(\),\s*pg_catalog\.nextval/i)
    expect(sql).toMatch(/'updated_by', v_neu\.updated_by::text/i)
    expect(sql).toMatch(/'updated_at', v_neu\.updated_at/i)
    expect(sql).toMatch(/'version', v_neu\.version::text/i)
  })
})
