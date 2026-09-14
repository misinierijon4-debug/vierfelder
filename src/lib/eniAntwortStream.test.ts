import { afterEach, describe, expect, it, vi } from 'vitest'
vi.mock('./supabase', () => ({ supabase: { auth: { getSession: async () => ({ data: { session: { access_token: 'test-token' } }, error: null }) } } }))
import { EniModellFehler, modellAntwort } from './eniAntwort'
import type { Lage } from './eniAntwort'
const mensch = { id: 'm1', rolle: 'mensch', text: 'Hallo', erstellt: '2026-09-11' }
function antwort(zeilen: unknown[]) {
  return new Response(zeilen.map((e) => JSON.stringify(e)).join('\n') + '\n', { headers: { 'content-type': 'application/x-ndjson' } })
}
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.useRealTimers() })
function vorbereiten(response: Response) {
  vi.stubEnv('VITE_SUPABASE_URL', 'https://test.invalid')
  vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'test-key')
  vi.stubGlobal('fetch', vi.fn(async () => response))
}
describe('ENI client streaming protocol', () => {
  it('beendet eine hängende Anfrage mit einer sichtbaren Zeitüberschreitung', async () => {
    vi.useFakeTimers()
    vorbereiten(antwort([]))
    vi.stubGlobal('fetch', vi.fn((_url, init) => new Promise((_resolve, reject) => {
      init.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
    })))
    const result = modellAntwort().antworte('c1', 'Hallo', [], [], undefined, () => {}).catch(e => e)
    await vi.advanceTimersByTimeAsync(120_000)
    expect(await result).toMatchObject({ message: expect.stringContaining('zwei Minuten'), code: 'modell_fehler' })
    expect(vi.getTimerCount()).toBe(0)
  })
  it('reicht den konkreten Anbieterfehler aus dem Stream unverändert weiter', async () => {
    const message = 'Infron akzeptiert den API-Key nicht (HTTP 401). Prüfe den hinterlegten Schlüssel.'
    vorbereiten(antwort([{ typ: 'mensch', mensch }, { typ: 'fertig', status: 502, inhalt: { error: message, code: 'modell_fehler' } }]))
    await expect(modellAntwort('qwen-infron').antworte('c1', 'Hallo', [], [], undefined, () => {}))
      .rejects.toMatchObject({ message, mensch, code: 'modell_fehler' })
  })
  it('zeigt Teile, nutzt aber die gespeicherte Nachricht als endgültige Antwort', async () => {
    vorbereiten(antwort([{ typ: 'mensch', mensch }, { typ: 'text', text: 'Hallo' }, { typ: 'fertig', status: 200, inhalt: { mensch, eni: { ...mensch, id: 'e1', rolle: 'eni', text: 'Hallo!' } } }]))
    const teile: string[] = []
    const ergebnis = await modellAntwort().antworte('c1', 'Hallo', [], [], undefined, (teil) => teile.push(teil))
    expect(teile).toEqual(['Hallo'])
    expect(ergebnis.eni?.text).toBe('Hallo!')
  })
  it('macht aus lage-ereignissen sichtbare schritte und überspringt, was es nicht kennt', async () => {
    vorbereiten(antwort([
      { typ: 'mensch', mensch },
      { typ: 'lage', schritt: 'sucht' },
      {
        typ: 'lage',
        schritt: 'gefunden',
        quellen: [{ titel: 'Quelle', url: 'https://example.org/a' }, { titel: 'Ohne Adresse' }],
      },
      // ein neuerer server darf schritte kennen, die dieser client nicht kennt
      { typ: 'lage', schritt: 'tanzt' },
      { typ: 'lage', schritt: 'denkt' },
      { typ: 'fertig', status: 200, inhalt: { mensch, eni: { ...mensch, id: 'e1', rolle: 'eni', text: 'Hallo!' } } },
    ]))
    const lagen: Lage[] = []
    await modellAntwort().antworte('c1', 'Hallo', [], [], undefined, () => {}, true, (l) => lagen.push(l))
    expect(lagen.map((l) => l.schritt)).toEqual(['sucht', 'gefunden', 'denkt'])
    expect(lagen[1]).toEqual({ schritt: 'gefunden', quellen: [{ titel: 'Quelle', url: 'https://example.org/a' }] })
  })
  it('behält nach Verbindungsabbruch die gespeicherte Vorlage für einen sicheren erneuten Versuch', async () => {
    vorbereiten(antwort([{ typ: 'mensch', mensch }, { typ: 'text', text: 'Halb' }]))
    const fehler = await modellAntwort().antworte('c1', 'Hallo', [], [], undefined, () => {}).catch((e) => e)
    expect(fehler).toBeInstanceOf(EniModellFehler)
    expect(fehler.mensch.id).toBe('m1')
    expect(fehler.code).toBe('modell_fehler')
  })
})
