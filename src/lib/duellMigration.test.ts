import { describe, expect, it } from 'vitest'

const migrationen = import.meta.glob(
  '../../supabase/migrations/*_duell_wochenabschluss_serverautoritaer.sql',
  { eager: true, query: '?raw', import: 'default' }
) as Record<string, string>

const sql = Object.values(migrationen)[0] ?? ''

describe('serverautoritiver wochenabschluss', () => {
  it('liegt genau einmal als neue migration vor', () => {
    expect(Object.keys(migrationen)).toHaveLength(1)
    expect(sql).toContain('finalisiere_wochenabrechnung')
  })

  it('entzieht direkte client-inserts und exponiert nur die rpc für mitglieder', () => {
    expect(sql).toMatch(
      /revoke insert on table public\.wochenabrechnung from public, anon, authenticated/i
    )
    expect(sql).toMatch(/drop policy if exists "wochenabrechnung schreiben"/i)
    expect(sql).toMatch(
      /function private\.finalisiere_wochenabrechnung\(p_woche date\)[\s\S]*security definer\s+set search_path = ''/i
    )
    expect(sql).toMatch(
      /function public\.finalisiere_wochenabrechnung\(p_woche date\)[\s\S]*security invoker\s+set search_path = ''/i
    )
    expect(sql).toMatch(/auth\.uid\(\)/i)
    expect(sql).toMatch(/from public\.profile p where p\.id = v_aufrufer/i)
    expect(sql).toMatch(
      /revoke all on function public\.finalisiere_wochenabrechnung\(date\)[\s\S]*from public, anon, authenticated/i
    )
    expect(sql).toMatch(
      /grant execute on function public\.finalisiere_wochenabrechnung\(date\)[\s\S]*to authenticated/i
    )
  })

  it('nimmt nur einen wochenmontag an und sperrt verfrühte abschlüsse in berlin', () => {
    expect(sql).toMatch(/finalisiere_wochenabrechnung\(p_woche date\)/i)
    expect(sql).toMatch(/extract\(isodow from p_woche\) <> 1/i)
    expect(sql).toContain("timezone('Europe/Berlin'")
    expect(sql).toMatch(/p_woche \+ 6 > v_lokal_jetzt::date/i)
    expect(sql).toContain("time '18:00'")
  })

  it('berechnet punkte und beleg aus kanonischen tabellen mit unveränderter schwelle', () => {
    expect(sql).toMatch(/from public\.einheiten e/gi)
    expect(sql).toMatch(/from public\.aufenthalte a/gi)
    expect(sql).toMatch(/from public\.gewicht g/gi)
    expect(sql).toMatch(/a\.bereich in \('lernen', 'gym', 'boxen', 'lesen'\)/i)
    expect(sql).toMatch(/e\.bereich in \('lernen', 'gym', 'boxen', 'lesen'\)/i)
    expect(sql).toContain("when a.bereich = 'lesen' then interval '10 minutes'")
    expect(sql).toContain("else interval '20 minutes'")
    expect(sql).toMatch(/select distinct\s+a\.user_id,\s+a\.bereich/gi)
    expect(sql).toMatch(/select g\.user_id,\s*'gewicht'::text,\s*g\.tag/gi)
    expect(sql).toContain("then 'punkte'")
    expect(sql).toContain("then 'beleg'")
    expect(sql).toContain("else 'unentschieden'")
    expect(sql).toMatch(/punkte_erijon smallint[\s\S]*punkte_koray smallint/i)
  })

  it('bewahrt legacy-archive und bestätigt bei einem race dieselbe zeile', () => {
    expect(sql).toContain("default 'legacy_client'")
    expect(sql).toContain("'server_planmaessig'")
    expect(sql).toContain("'server_nachgeholt'")
    expect(sql).toContain('berechnung_version')
    expect(sql).toContain('wochenabrechnung_server_invariante')
    expect(sql).toContain('pg_advisory_xact_lock')
    expect(sql).toMatch(/where w\.woche = p_woche;[\s\S]*if found then/i)
    expect(sql).toMatch(/on conflict \(woche\) do nothing/i)
    expect(sql).toMatch(/if not found then[\s\S]*where w\.woche = p_woche/i)
  })
})
