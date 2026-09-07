import { describe, expect, it } from 'vitest'

const schemaDateien = import.meta.glob('../../supabase/schema.sql', {
  eager: true,
  query: '?raw',
  import: 'default',
}) as Record<string, string>
const schema = Object.values(schemaDateien)[0] ?? ''

const readmeDateien = import.meta.glob('../../README.md', {
  eager: true,
  query: '?raw',
  import: 'default',
}) as Record<string, string>
const readme = Object.values(readmeDateien)[0] ?? ''

describe('fail-closed Kontoprovisionierung', () => {
  it('ordnet unbekannte E-Mail-Adressen in keiner Grundschema-Anleitung einer Person zu', () => {
    expect(schema).not.toMatch(/case\s+when[\s\S]{0,240}else\s+'koray'/i)
    expect(schema).toMatch(/Unbekannte Auth-Nutzer erhalten\s+-- kein Profil/i)
  })

  it('kennzeichnet das Grundschema als historische Grundlage und sperrt Blind-Pushes', () => {
    expect(schema).toMatch(/NICHT als einzelnes produktionsskript/i)
    expect(schema).toMatch(/unbesehenes `supabase db push` gesperrt/i)
    expect(schema).toContain('docs/release-und-migrationen.md')
  })

  it('dokumentiert zwei explizite Zuordnungen und prueft den vollstaendigen Bestand', () => {
    expect(readme).toMatch(/select id, 'erijon'[\s\S]*ERIJONS_ECHTE_EMAIL/i)
    expect(readme).toMatch(/select id, 'koray'[\s\S]*KORAYS_ECHTE_EMAIL/i)
    expect(readme).toMatch(/select count\(\*\) from auth\.users\) <> 2/i)
    expect(readme).toMatch(/where p\.id is null/i)
    expect(readme).not.toMatch(/case\s+when[\s\S]{0,240}else\s+'koray'/i)
  })
})
