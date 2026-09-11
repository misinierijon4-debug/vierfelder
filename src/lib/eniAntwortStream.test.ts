import { afterEach, describe, expect, it, vi } from 'vitest'
vi.mock('./supabase', () => ({ supabase: { auth: { getSession: async () => ({ data: { session: { access_token: 'test-token' } }, error: null }) } } }))
import { EniModellFehler, modellAntwort } from './eniAntwort'
const mensch = { id: 'm1', rolle: 'mensch', text: 'Hallo', erstellt: '2026-09-11' }
function antwort(zeilen: unknown[]) {
  return new Response(zeilen.map((e) => JSON.stringify(e)).join('\n') + '\n', { headers: { 'content-type': 'application/x-ndjson' } })
}
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs() })
function vorbereiten(response: Response) {
  vi.stubEnv('VITE_SUPABASE_URL', 'https://test.invalid')
  vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'test-key')
  vi.stubGlobal('fetch', vi.fn(async () => response))
}
describe('ENI client streaming protocol', () => {
  it('zeigt Teile, nutzt aber die gespeicherte Nachricht als endgültige Antwort', async () => {
    vorbereiten(antwort([{ typ: 'mensch', mensch }, { typ: 'text', text: 'Hallo' }, { typ: 'fertig', status: 200, inhalt: { mensch, eni: { ...mensch, id: 'e1', rolle: 'eni', text: 'Hallo!' } } }]))
    const teile: string[] = []
    const ergebnis = await modellAntwort().antworte('c1', 'Hallo', [], [], undefined, (teil) => teile.push(teil))
    expect(teile).toEqual(['Hallo'])
    expect(ergebnis.eni?.text).toBe('Hallo!')
  })
  it('behält nach Verbindungsabbruch die gespeicherte Vorlage für einen sicheren erneuten Versuch', async () => {
    vorbereiten(antwort([{ typ: 'mensch', mensch }, { typ: 'text', text: 'Halb' }]))
    const fehler = await modellAntwort().antworte('c1', 'Hallo', [], [], undefined, () => {}).catch((e) => e)
    expect(fehler).toBeInstanceOf(EniModellFehler)
    expect(fehler.mensch.id).toBe('m1')
    expect(fehler.code).toBe('modell_fehler')
  })
})
