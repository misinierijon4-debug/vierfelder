import { describe, expect, it } from 'vitest'

const functionDateien = import.meta.glob(
  '../../supabase/functions/{gewicht-erinnerung,schlaf-erinnerung}/index.ts',
  { eager: true, query: '?raw', import: 'default' }
) as Record<string, string>

const migrationen = import.meta.glob(
  '../../supabase/migrations/*_scheduler_secret_absichern.sql',
  { eager: true, query: '?raw', import: 'default' }
) as Record<string, string>
const sql = Object.values(migrationen)[0] ?? ''

const configDateien = import.meta.glob('../../supabase/config.toml', {
  eager: true,
  query: '?raw',
  import: 'default',
}) as Record<string, string>
const config = Object.values(configDateien)[0] ?? ''

function tomlSektion(name: string): string {
  const zeilen = config.split(/\r?\n/)
  const anfang = zeilen.findIndex((zeile) => zeile.trim() === `[${name}]`)
  if (anfang < 0) return ''
  const ende = zeilen.findIndex((zeile, index) => index > anfang && /^\s*\[/.test(zeile))
  return zeilen.slice(anfang + 1, ende < 0 ? undefined : ende).join('\n')
}

describe('interne scheduler-authentifizierung', () => {
  it('liegt genau einmal als forward-migration vor', () => {
    expect(Object.keys(migrationen)).toHaveLength(1)
  })

  it('akzeptiert in beiden functions ausschliesslich den benannten secret-key', () => {
    expect(Object.keys(functionDateien)).toHaveLength(2)
    for (const [datei, inhalt] of Object.entries(functionDateien)) {
      expect(inhalt, datei).toContain("npm:@supabase/server@1.5.3")
      expect(inhalt, datei).toContain("auth: 'secret:automations'")
      expect(inhalt, datei).toContain("cors: 'disabled'")
      expect(inhalt, datei).toContain('context.supabaseAdmin')
      expect(inhalt, datei).not.toContain('SUPABASE_SERVICE_ROLE_KEY')
      expect(inhalt, datei).not.toContain('createClient(')
      expect(inhalt, datei).not.toContain('Deno.serve(')
    }
  })

  it('deaktiviert nur den gateway-jwt-check und behaelt die handler-pruefung', () => {
    for (const name of ['functions.gewicht-erinnerung', 'functions.schlaf-erinnerung']) {
      expect(tomlSektion(name)).toMatch(/^verify_jwt\s*=\s*false$/im)
    }
  })

  it('prueft ziel und schluessel bei jedem lauf fail-closed', () => {
    expect(sql).toContain("name = 'vierfelder_project_url'")
    expect(sql).toContain("name = 'vierfelder_automations_secret_key'")
    expect(sql).toMatch(/v_project_url_count\s*<>\s*1/i)
    expect(sql).toMatch(/v_automations_key_count\s*<>\s*1/i)
    expect(sql).toContain("v_project_url <> 'https://ogxwazageufvalkocywh.supabase.co'")
    expect(sql).toMatch(/\^sb_secret_/i)
    expect(sql).toMatch(
      /function private\.rufe_erinnerung_auf\(p_function text\)[\s\S]*security definer\s+set search_path = ''/i
    )
    expect(sql).toMatch(/p_function not in \('gewicht-erinnerung', 'schlaf-erinnerung'\)/i)
    expect(sql).toMatch(/raise exception 'scheduler nicht konfiguriert/i)
    expect(sql).toMatch(
      /revoke all on function private\.rufe_erinnerung_auf\(text\)\s+from public, anon, authenticated/i
    )
    expect(sql).not.toMatch(/do \$migration\$[\s\S]*scheduler nicht konfiguriert/i)
  })

  it('ersetzt beide jobs ueber cron-funktionen und sendet nur den secret-key', () => {
    expect(sql.match(/cron\.schedule\(/gi)).toHaveLength(2)
    expect(sql).toMatch(/cron\.unschedule\(v_job\.jobid\)/i)
    expect(sql).toContain("jobname in ('gewicht-erinnerung', 'schlaf-erinnerung')")
    expect(sql).toContain("private.rufe_erinnerung_auf('gewicht-erinnerung')")
    expect(sql).toContain("private.rufe_erinnerung_auf('schlaf-erinnerung')")
    expect(sql.match(/'apikey'/gi)).toHaveLength(1)
    expect(sql).not.toMatch(/'Authorization'/i)
    expect(sql).not.toContain('vierfelder_legacy_anon_key')
    expect(sql.match(/body := '\{\}'::jsonb/gi)).toHaveLength(1)
  })
})
