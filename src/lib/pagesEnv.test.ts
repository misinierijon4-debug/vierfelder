/// <reference types="node" />

import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const skript = fileURLToPath(new URL('../../scripts/validate-pages-env.mjs', import.meta.url))
const BASIS = {
  VITE_BASE: '/vierfelder/',
  VITE_SUPABASE_URL: 'https://ogxwazageufvalkocywh.supabase.co',
  VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_testwert',
}

function pruefe(abweichung: Partial<typeof BASIS> = {}) {
  return spawnSync(process.execPath, [skript], {
    env: { ...process.env, ...BASIS, ...abweichung },
    encoding: 'utf8',
  })
}

describe('Pages-Umgebungsvertrag', () => {
  it('akzeptiert nur die feste Projektidentitaet', () => {
    expect(pruefe().status).toBe(0)
  })

  it.each([
    ['fremder Host', 'https://anderes-projekt.supabase.co'],
    ['HTTP', 'http://ogxwazageufvalkocywh.supabase.co'],
    ['Pfad', 'https://ogxwazageufvalkocywh.supabase.co/rest/v1'],
    ['Query', 'https://ogxwazageufvalkocywh.supabase.co?falsch=1'],
    ['Fragment', 'https://ogxwazageufvalkocywh.supabase.co#falsch'],
    ['Zugangsdaten', 'https://nutzer:passwort@ogxwazageufvalkocywh.supabase.co'],
  ])('weist %s zurueck', (_fall, url) => {
    const ergebnis = pruefe({ VITE_SUPABASE_URL: url })
    expect(ergebnis.status).toBe(1)
    expect(ergebnis.stderr).toContain('muss exakt')
  })

  it('weist Secret-Key-Klassen in jedem Frontend-Feld zurueck', () => {
    const ergebnis = spawnSync(process.execPath, [skript], {
      env: { ...process.env, ...BASIS, VITE_IRGENDWAS: 'sb_secret_nicht_ins_frontend' },
      encoding: 'utf8',
    })
    expect(ergebnis.status).toBe(1)
    expect(ergebnis.stderr).toContain('darf keinen sb_secret_')
  })
})
