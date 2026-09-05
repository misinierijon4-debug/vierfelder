import { describe, expect, it } from 'vitest'

const migrationen = import.meta.glob(
  '../../supabase/migrations/*_mitgliedschaft_rls_absichern.sql',
  { eager: true, query: '?raw', import: 'default' }
) as Record<string, string>
const sql = Object.values(migrationen)[0] ?? ''

const configDateien = import.meta.glob('../../supabase/config.toml', {
  eager: true,
  query: '?raw',
  import: 'default',
}) as Record<string, string>
const config = Object.values(configDateien)[0] ?? ''

function policy(name: string, tabelle: string): string {
  const muster = new RegExp(
    `create policy "${name}" on public\\.${tabelle}([\\s\\S]*?);`,
    'i'
  )
  return sql.match(muster)?.[0] ?? ''
}

function tomlSektion(name: string): string {
  const zeilen = config.split(/\r?\n/)
  const anfang = zeilen.findIndex((zeile) => zeile.trim() === `[${name}]`)
  if (anfang < 0) return ''
  const ende = zeilen.findIndex((zeile, index) => index > anfang && /^\s*\[/.test(zeile))
  return zeilen.slice(anfang + 1, ende < 0 ? undefined : ende).join('\n')
}

describe('zwei-personen-mitgliedschaft', () => {
  it('liegt genau einmal als forward-migration vor', () => {
    expect(Object.keys(migrationen)).toHaveLength(1)
  })

  it('haertet die zentrale prueffunktion mit leerem suchpfad', () => {
    expect(sql).toMatch(
      /function private\.ist_duellprofil\(\)[\s\S]*security definer\s+set search_path = ''/i
    )
    expect(sql).toMatch(/from public\.profile p[\s\S]*p\.id = \(select auth\.uid\(\)\)/i)
    expect(sql).toMatch(
      /revoke all on function private\.ist_duellprofil\(\) from public, anon, authenticated/i
    )
    expect(sql).toMatch(/grant execute on function private\.ist_duellprofil\(\) to authenticated/i)
  })

  it('bindet alle bisherigen auth-user-fremdschluessel zusaetzlich an ein profil', () => {
    const tabellen = [
      'eintraege',
      'werte',
      'schlafnaechte',
      'schlaf_import_tokens',
      'gewicht',
      'einheiten',
      'aufenthalte',
      'faecher',
      'noten',
      'push_abos',
      'erinnerungs_einstellungen',
      'erinnerungs_versand',
      'kurzbefehl_laeufe',
    ]

    for (const tabelle of tabellen) {
      expect(sql).toMatch(
        new RegExp(
          `alter table public\\.${tabelle}[\\s\\S]*?constraint ${tabelle}_duellprofil_fk[\\s\\S]*?foreign key \\(user_id\\) references public\\.profile\\(id\\)[\\s\\S]*?not valid;`,
          'i'
        )
      )
      expect(sql).toMatch(
        new RegExp(
          `alter table public\\.${tabelle}[\\s\\S]*?validate constraint ${tabelle}_duellprofil_fk;`,
          'i'
        )
      )
    }
    expect(sql).not.toMatch(/_duellprofil_fk[\s\S]{0,120}on delete cascade/i)
  })

  it('stoppt bei fremden altzeilen, statt sie still zu bereinigen', () => {
    expect(sql).toMatch(/not exists \(select 1 from public\.profile p where p\.id = x\.user_id\)/i)
    expect(sql).toMatch(/raise exception 'mitgliedschaft nicht migrierbar/i)
    expect(sql).not.toMatch(/delete from public\.(eintraege|werte|gewicht|einheiten|noten|push_abos)/i)
  })

  it('verlangt bei jeder eigenen client-mutation mitgliedschaft und eigentum', () => {
    const policies = [
      ['eintraege schreiben', 'eintraege'],
      ['eintraege loeschen', 'eintraege'],
      ['werte schreiben', 'werte'],
      ['werte aendern', 'werte'],
      ['werte loeschen', 'werte'],
      ['gewicht schreiben', 'gewicht'],
      ['gewicht aendern', 'gewicht'],
      ['gewicht loeschen', 'gewicht'],
      ['einheiten schreiben', 'einheiten'],
      ['einheiten aendern', 'einheiten'],
      ['einheiten loeschen', 'einheiten'],
      ['faecher aendern', 'faecher'],
      ['noten schreiben', 'noten'],
      ['noten loeschen', 'noten'],
      ['push abos anlegen', 'push_abos'],
      ['push abos aendern', 'push_abos'],
      ['push abos loeschen', 'push_abos'],
      ['erinnerungszeit anlegen', 'erinnerungs_einstellungen'],
      ['erinnerungszeit aendern', 'erinnerungs_einstellungen'],
    ] as const

    for (const [name, tabelle] of policies) {
      const block = policy(name, tabelle)
      expect(block, `${name} fehlt`).not.toBe('')
      expect(block).toContain('(select private.ist_duellprofil())')
      expect(block).toContain('(select auth.uid()) = user_id')
    }
  })

  it('laesst gemeinsame daten nur duellmitglieder und private daten nur ihren eigentuemer lesen', () => {
    for (const [name, tabelle] of [
      ['profile lesen', 'profile'],
      ['eintraege lesen', 'eintraege'],
      ['gewicht lesen', 'gewicht'],
      ['einheiten lesen', 'einheiten'],
      ['aufenthalte lesen', 'aufenthalte'],
      ['faecher lesen', 'faecher'],
      ['noten lesen', 'noten'],
      ['laeufe lesen', 'kurzbefehl_laeufe'],
      ['schlaf updates lesen', 'schlaf_updates'],
    ] as const) {
      expect(policy(name, tabelle)).toContain('(select private.ist_duellprofil())')
    }

    for (const [name, tabelle] of [
      ['werte lesen', 'werte'],
      ['push abos lesen', 'push_abos'],
      ['erinnerungszeit lesen', 'erinnerungs_einstellungen'],
    ] as const) {
      const block = policy(name, tabelle)
      expect(block).toContain('(select private.ist_duellprofil())')
      expect(block).toContain('(select auth.uid()) = user_id')
    }
  })

  it('reserviert push-proben atomar und nur fuer mitglieder', () => {
    expect(sql).toMatch(/create table private\.push_probe_limits/i)
    expect(sql).toMatch(
      /function private\.reserviere_push_probe\(\)[\s\S]*security definer\s+set search_path = ''/i
    )
    expect(sql).toMatch(/from public\.profile p where p\.id = v_user/i)
    expect(sql).toMatch(/on conflict \(user_id\) do update/i)
    expect(sql).toMatch(/interval '1 minute'/i)
    expect(sql).toMatch(/return found/i)
    expect(sql).toMatch(
      /revoke all on function private\.reserviere_push_probe\(\) from public, anon, authenticated/i
    )
    expect(sql).toMatch(
      /function public\.reserviere_push_probe\(\)[\s\S]*security invoker\s+set search_path = ''[\s\S]*select private\.reserviere_push_probe\(\)/i
    )
    expect(sql).toMatch(/grant execute on function public\.reserviere_push_probe\(\) to authenticated/i)
  })

  it('begrenzt auch die anzahl der push-geraete ohne altbestand zu loeschen', () => {
    expect(sql).toMatch(/having count\(\*\) > 5/i)
    expect(sql).toMatch(
      /function private\.begrenze_push_abos\(\)[\s\S]*security definer\s+set search_path = ''/i
    )
    expect(sql).toMatch(/pg_catalog\.pg_advisory_xact_lock/i)
    expect(sql).toMatch(/where a\.user_id = new\.user_id\) >= 5/i)
    expect(sql).toMatch(/before insert on public\.push_abos/i)
    expect(sql).not.toMatch(/delete from public\.push_abos/i)
  })

  it('schliesst signup auch in der lokalen reproduktionskonfiguration', () => {
    const auth = tomlSektion('auth')
    expect(auth).toMatch(/^enable_signup\s*=\s*false$/im)
    expect(auth).toMatch(/^enable_anonymous_sign_ins\s*=\s*false$/im)
  })
})
