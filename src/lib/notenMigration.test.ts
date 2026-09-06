import { describe, expect, it } from 'vitest'

const migrationen = import.meta.glob(
  '../../supabase/migrations/*_noten_atomare_pruefungswahl.sql',
  { eager: true, query: '?raw', import: 'default' }
) as Record<string, string>

const sql = Object.values(migrationen)[0] ?? ''

describe('atomare Pruefungsfachwahl', () => {
  it('liegt genau einmal als additive Forward-Migration vor', () => {
    expect(Object.keys(migrationen)).toHaveLength(1)
    expect(sql).toMatch(/begin;[\s\S]*commit;/i)
    expect(sql).toMatch(/set local lock_timeout = '10s'/i)
    expect(sql).toMatch(/begin;[\s\S]*lock table public\.profile, public\.faecher, public\.noten\s+in share row exclusive mode/i)
    expect(sql).not.toMatch(/drop table|drop column/i)
  })

  it('stoppt bei widerspruechlichen Faecher- oder Notendaten', () => {
    expect(sql).toMatch(/count\(\*\) filter \(where f\.kursart = 'lk'\) <> 3/i)
    expect(sql).toMatch(/count\(\*\) filter \(where f\.pruefungsfach = 4\) <> 1/i)
    expect(sql).toMatch(/where f\.pruefungsfach = 4\s+and f\.kursart = 'gk'/i)
    expect(sql).toMatch(/lower\(btrim\(f\.name\)\) = 'sport'/i)
    expect(sql).toMatch(/left join public\.faecher f[\s\S]*f\.user_id = n\.user_id[\s\S]*f\.id = n\.fach_id/i)
    expect(sql).toContain("errcode = '23514'")
  })

  it('koppelt jede Note strukturell an ein Fach desselben Nutzers', () => {
    expect(sql).toMatch(/unique \(user_id, id\)/i)
    expect(sql).toMatch(/foreign key \(user_id, fach_id\)[\s\S]*references public\.faecher \(user_id, id\)/i)
    expect(sql).toMatch(/on delete cascade[\s\S]*not valid;[\s\S]*validate constraint noten_fach_eigentuemer_fk/i)
  })

  it('erzwingt genau eine Auswahl auch fuer alte direkte Clients', () => {
    expect(sql).toMatch(/create constraint trigger faecher_pruefungsfach_genau_eins/i)
    expect(sql).toMatch(/deferrable initially deferred/i)
    expect(sql).toMatch(/function private\.pruefe_pruefungsfach_invariante\(\)[\s\S]*security invoker[\s\S]*set search_path = ''/i)
    expect(sql).toMatch(/v_lk <> 3 or v_auswahl <> 1 or v_auswahl_gk <> 1 or v_sport <> 0/i)
  })

  it('serialisiert und bestaetigt die RPC ohne breite Execute-Rechte', () => {
    expect(sql).toMatch(/function public\.setze_pruefungsfach\([\s\S]*p_fach_id uuid,[\s\S]*p_erwartetes_fach_id uuid/i)
    expect(sql).toMatch(/security invoker\s+set search_path = ''/i)
    expect(sql).toMatch(/order by f\.id\s+for update/i)
    expect(sql).toMatch(/if v_aktuell = p_fach_id then\s+return p_fach_id/i)
    expect(sql).toMatch(/v_aktuell is distinct from p_erwartetes_fach_id/i)
    expect(sql.match(/if not found/gi)).toHaveLength(2)
    expect(sql).toMatch(/revoke all on function public\.setze_pruefungsfach\(uuid, uuid\)[\s\S]*from public, anon, authenticated/i)
    expect(sql).toMatch(/grant execute on function public\.setze_pruefungsfach\(uuid, uuid\)[\s\S]*to authenticated/i)
    expect(sql).not.toMatch(/function public\.setze_pruefungsfach\([\s\S]*security definer/i)
  })
})
