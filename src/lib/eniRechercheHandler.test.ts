import { describe, expect, it, vi } from 'vitest'
import {
  ausZeile,
  arbeite,
  behandleRecherche,
  freiesModell,
  passtZumNamen,
  PAUSE_NACH_FEHLER_MS,
  seitenAusTavily,
  seitentext,
  tavilySuche,
  WANDUHR_MS,
  wikipediaSuche,
  type RechercheDatenbank,
} from '../../supabase/functions/_shared/eniRechercheHandler'
import { DauerFehler, type RechercheDienste } from '../../supabase/functions/_shared/eniRecherche'

const ICH = '11111111-1111-4111-8111-111111111111'
const GEHEIM = 'a'.repeat(64)

/** eine laufende recherche, wie `eni_recherche_nehmen` sie liefert */
const zeile = (mehr: Record<string, unknown> = {}) => ({
  user_id: ICH,
  rolle_id: 'eigen-ali',
  lauf: 'lauf-1',
  name: 'Muhammad Ali',
  auftrag: '',
  status: 'laeuft',
  schritte: [],
  notizen: [],
  abschnitte: [],
  ...mehr,
})

/**
 * Die Datenbank als Attrappe: eine Zeile, `update` mit Filtern wie
 * PostgREST, und die beiden RPCs, die der Handler ruft.
 */
function datenbank(start: Record<string, unknown> | null, optionen: { geheimOk?: boolean } = {}) {
  let gespeichert: Record<string, unknown> | null = start ? { ...start } : null
  const updates: Array<Record<string, unknown>> = []
  const rpcs: Array<[string, Record<string, unknown>]> = []
  const db: RechercheDatenbank = {
    auth: {
      getUser: async (token) =>
        token === 'gutes-token'
          ? { data: { user: { id: ICH } }, error: null }
          : { data: { user: null }, error: { message: 'ungueltig' } },
    },
    rpc: async (name, argumente) => {
      rpcs.push([name, argumente])
      if (name === 'pruefe_aktivitaets_scheduler') return { data: optionen.geheimOk ?? true, error: null }
      if (name === 'eni_recherche_nehmen') return { data: gespeichert ? [gespeichert] : [], error: null }
      return { data: null, error: { message: 'unbekannt' } }
    },
    from: () => ({
      update(felder) {
        const filter: Record<string, unknown> = {}
        const kette = {
          eq(spalte: string, wert: unknown) {
            filter[spalte] = wert
            return kette
          },
          select: async () => {
            const passt = gespeichert && Object.entries(filter).every(([k, v]) => gespeichert![k] === v)
            if (!passt) return { data: [], error: null }
            updates.push(felder)
            gespeichert = { ...gespeichert!, ...felder }
            return { data: [{ lauf: gespeichert.lauf }], error: null }
          },
        }
        return kette
      },
    }),
  }
  return { db, updates, rpcs, stand: () => gespeichert, setze: (z: Record<string, unknown> | null) => (gespeichert = z) }
}

function dienste(): RechercheDienste {
  return {
    wikipedia: async () => [{ titel: 'Wikipedia (de): Muhammad Ali', url: 'https://de.wikipedia.org/wiki/Muhammad_Ali', text: 'Boxer.' }],
    suche: async (frage) => [{ titel: frage, url: `https://example.org/${encodeURIComponent(frage)}`, text: 'Text' }],
    modell: async (aufruf) => {
      if (aufruf.system.includes('Du planst')) return '{"person": true, "werke": ["The Greatest"], "suchen": ["a","b","c","d"]}'
      if (aufruf.system.includes('Du sammelst')) return '"Float like a butterfly" [1]'
      return 'Abschnitt [1].'
    },
  }
}

const anfrage = (kopf: Record<string, string> = {}, methode = 'POST') =>
  new Request('https://x.example/functions/v1/eni-recherche', { method: methode, headers: kopf, body: methode === 'POST' ? '{}' : undefined })

const protokoll = () => ({ error: vi.fn(), info: vi.fn() })

describe('eni-recherche: wer hereindarf', () => {
  it('beantwortet OPTIONS und lehnt GET ab', async () => {
    const { db } = datenbank(null)
    const deps = { umgebung: () => undefined, dienst: () => db, protokoll: protokoll() }
    expect((await behandleRecherche(anfrage({}, 'OPTIONS'), deps)).status).toBe(204)
    expect((await behandleRecherche(anfrage({}, 'GET'), deps)).status).toBe(405)
  })

  it('lässt niemanden ohne geheimnis oder anmeldung herein', async () => {
    const { db, rpcs } = datenbank(zeile())
    const deps = { umgebung: () => undefined, dienst: () => db, protokoll: protokoll() }
    expect((await behandleRecherche(anfrage(), deps)).status).toBe(401)
    expect((await behandleRecherche(anfrage({ authorization: 'Bearer falsch' }), deps)).status).toBe(401)
    expect((await behandleRecherche(anfrage({ 'x-erinnerungs-secret': 'kurz' }), deps)).status).toBe(401)
    expect(rpcs.some(([name]) => name === 'eni_recherche_nehmen')).toBe(false)
  })

  it('lehnt ein falsches scheduler-geheimnis ab', async () => {
    const { db, rpcs } = datenbank(zeile(), { geheimOk: false })
    const deps = { umgebung: () => undefined, dienst: () => db, protokoll: protokoll() }
    expect((await behandleRecherche(anfrage({ 'x-erinnerungs-secret': GEHEIM }), deps)).status).toBe(401)
    expect(rpcs.map(([name]) => name)).toEqual(['pruefe_aktivitaets_scheduler'])
  })

  it('nimmt mit dem geheimnis irgendeine, mit dem token nur die eigene recherche', async () => {
    const { db, rpcs } = datenbank(null)
    const deps = { umgebung: () => undefined, dienst: () => db, protokoll: protokoll() }
    const cron = await behandleRecherche(anfrage({ 'x-erinnerungs-secret': GEHEIM }), deps)
    expect(await cron.json()).toEqual({ arbeit: false })
    await behandleRecherche(anfrage({ authorization: 'Bearer gutes-token' }), deps)
    expect(rpcs.filter(([name]) => name === 'eni_recherche_nehmen').map(([, a]) => a)).toEqual([
      { p_user: null },
      { p_user: ICH },
    ])
  })

  it('antwortet sofort und arbeitet im hintergrund weiter', async () => {
    const { db, stand } = datenbank(zeile())
    let hintergrund: Promise<unknown> | null = null
    const res = await behandleRecherche(anfrage({ authorization: 'Bearer gutes-token' }), {
      umgebung: () => undefined,
      dienst: () => db,
      dienste: dienste(),
      imHintergrund: (arbeit) => (hintergrund = arbeit),
      protokoll: protokoll(),
    })
    expect(res.status).toBe(202)
    expect(hintergrund).not.toBeNull()
    await hintergrund
    expect(stand()!.status).toBe('fertig')
  })
})

describe('eni-recherche: arbeiten', () => {
  it('arbeitet alle schritte ab und legt die fertige akte ab', async () => {
    const { db, stand } = datenbank(zeile())
    const p = protokoll()
    const ergebnis = await arbeite(stand()!, db, dienste(), { start: 0, jetzt: () => 0, protokoll: p })
    expect(ergebnis).toBe('fertig')
    const fertig = stand()!
    expect(fertig.status).toBe('fertig')
    expect(fertig.akte).toContain('# Muhammad Ali')
    expect(fertig.akte).toContain('## Werk: The Greatest')
    expect(fertig.akte_name).toBe('Muhammad Ali')
    expect(fertig.schritte).toEqual([])
    expect(fertig.notizen).toEqual([])
    expect(fertig.gesperrt_bis).toBeNull()
    expect((fertig.quellen as unknown[]).length).toBeGreaterThan(0)
    expect(p.info).toHaveBeenCalledWith(expect.stringMatching(/^eni-recherche: fertig, \d+ abschnitte/))
  })

  it('beginnt keinen schritt, der nicht mehr in die zeit passt, und gibt die sperre frei', async () => {
    const { db, stand, updates } = datenbank(zeile())
    let uhr = 0
    const langsam: RechercheDienste = {
      ...dienste(),
      modell: async (a) => {
        uhr += 30_000
        return dienste().modell(a)
      },
    }
    const ergebnis = await arbeite(stand()!, db, langsam, { start: 0, jetzt: () => uhr, protokoll: protokoll() })
    expect(ergebnis).toBe('weiter')
    expect(uhr).toBeLessThanOrEqual(WANDUHR_MS)
    expect(updates.at(-1)).toEqual({ gesperrt_bis: null })
    expect(stand()!.status).toBe('laeuft')
    // gespeichert ist, was geschafft wurde: wikipedia und plan
    expect((stand()!.schritte as Array<{ erledigt: boolean }>).filter((s) => s.erledigt).length).toBeGreaterThanOrEqual(2)
  })

  it('macht nach einem neustart dort weiter, wo der letzte aufruf aufgehört hat', async () => {
    const { db, stand, setze } = datenbank(zeile())
    let uhr = 0
    const d = { ...dienste(), modell: async (a: Parameters<RechercheDienste['modell']>[0]) => ((uhr += 40_000), dienste().modell(a)) }
    await arbeite(stand()!, db, d, { start: 0, jetzt: () => uhr, protokoll: protokoll() })
    const zwischen = stand()!
    setze({ ...zwischen })
    uhr = 0
    let runden = 0
    while (stand()!.status === 'laeuft' && runden++ < 50) {
      uhr = 0
      await arbeite(stand()!, db, d, { start: 0, jetzt: () => uhr, protokoll: protokoll() })
    }
    expect(stand()!.status).toBe('fertig')
  })

  it('hört still auf, wenn die recherche inzwischen abgebrochen oder neu gestartet wurde', async () => {
    const { db, stand, setze } = datenbank(zeile())
    const d: RechercheDienste = {
      ...dienste(),
      wikipedia: async () => {
        setze({ ...stand()!, lauf: 'lauf-2', schritte: [] })
        return []
      },
    }
    const ergebnis = await arbeite(zeile(), db, d, { start: 0, jetzt: () => 0, protokoll: protokoll() })
    expect(ergebnis).toBe('weg')
    expect(stand()!.lauf).toBe('lauf-2')
    expect(stand()!.schritte).toEqual([])
  })

  it('pausiert nach einem fehlgeschlagenen schritt und sperrt kurz', async () => {
    const { db, stand } = datenbank(zeile())
    const p = protokoll()
    const d: RechercheDienste = { ...dienste(), wikipedia: async () => Promise.reject(new Error('wikipedia antwortet 503')) }
    const ergebnis = await arbeite(stand()!, db, d, { start: 0, jetzt: () => 1_000, protokoll: p })
    expect(ergebnis).toBe('pause')
    expect(stand()!.gesperrt_bis).toBe(new Date(1_000 + PAUSE_NACH_FEHLER_MS).toISOString())
    expect((stand()!.schritte as Array<{ versuche: number }>)[0]!.versuche).toBe(1)
    expect(p.error).toHaveBeenCalledWith('eni-recherche: schritt wiki gescheitert', 'wikipedia antwortet 503')
  })

  it('meldet einen dauerfehler an der recherche, statt es endlos zu versuchen', async () => {
    const { db, stand } = datenbank(zeile())
    const d: RechercheDienste = {
      ...dienste(),
      wikipedia: async () => Promise.reject(new DauerFehler('Für die Recherche fehlt INFRON_API_KEY.')),
    }
    expect(await arbeite(stand()!, db, d, { start: 0, jetzt: () => 0, protokoll: protokoll() })).toBe('fehler')
    expect(stand()).toMatchObject({ status: 'fehler', fehler: 'Für die Recherche fehlt INFRON_API_KEY.', gesperrt_bis: null })
  })

  it('sagt, wenn modell oder suche die ganze zeit nicht geantwortet haben', async () => {
    const { db, stand } = datenbank(zeile())
    const d: RechercheDienste = {
      ...dienste(),
      wikipedia: async () => [],
      modell: async (a) => {
        if (a.system.includes('Du planst')) return '{"person": false, "suchen": ["a","b","c","d"]}'
        throw new Error('modell antwortet 429')
      },
    }
    let runden = 0
    while (stand()!.status === 'laeuft' && runden++ < 200) {
      await arbeite({ ...stand()!, gesperrt_bis: null }, db, d, { start: 0, jetzt: () => 0, protokoll: protokoll() })
    }
    expect(stand()!.status).toBe('fehler')
    expect(stand()!.fehler).toMatch(/^Die Recherche ist an Fehlern gescheitert: \d+ Schritte/)
  })

  it('meldet, wenn am ende gar nichts gefunden wurde', async () => {
    const { db, stand } = datenbank(zeile())
    const d: RechercheDienste = { ...dienste(), modell: async (a) => (a.system.includes('Du planst') ? '' : 'NICHTS') }
    expect(await arbeite(stand()!, db, d, { start: 0, jetzt: () => 0, protokoll: protokoll() })).toBe('fehler')
    expect(stand()!.fehler).toContain('nichts Brauchbares gefunden')
  })
})

describe('eni-recherche: zustand aus der datenbank', () => {
  it('liest nur gültige schritte, notizen und adressen', () => {
    const r = ausZeile(
      zeile({
        schritte: [
          { art: 'wiki', erledigt: true, versuche: 0 },
          { art: 'suche', frage: '', erledigt: false },
          { art: 'boese' },
          { art: 'abschnitt', titel: 'Kernideen', auftrag: 'x', woerter: 500, erledigt: false, versuche: 1 },
        ],
        notizen: [
          { titel: 'a', text: 'b', quellen: [{ titel: 't', url: 'javascript:alert(1)' }, { titel: 'u', url: 'https://u.example' }] },
          { titel: 'leer', text: '' },
        ],
      }),
    )
    expect(r.schritte.map((s) => s.art)).toEqual(['wiki', 'abschnitt'])
    expect(r.notizen).toEqual([{ titel: 'a', text: 'b', quellen: [{ titel: 'u', url: 'https://u.example/' }] }])
  })

  it('beginnt mit wikipedia und plan, wenn noch nichts da ist', () => {
    expect(ausZeile(zeile()).schritte.map((s) => s.art)).toEqual(['wiki', 'planen'])
  })
})

describe('eni-recherche: netz', () => {
  it('nimmt den ganzen seitentext, ohne bilder und linkziele', () => {
    const seiten = seitenAusTavily([
      { url: 'https://a.example/x', title: 'A', content: 'kurz', raw_content: 'Lang ![bild](https://b/c.png) und [ein Link](https://d)\n\n\n\nweiter' },
      { url: 'ftp://b.example', title: 'B', content: 'x' },
      { url: 'https://a.example/x', title: 'doppelt', content: 'y' },
      { url: 'https://c.example', title: 'C', content: '' },
    ])
    expect(seiten).toEqual([{ titel: 'A', url: 'https://a.example/x', text: 'Lang und ein Link\n\nweiter' }])
    expect(seitentext('a  \t b')).toBe('a b')
  })

  it('sucht bei tavily mit ganzem seitentext und unterscheidet dauerhafte fehler', async () => {
    const http = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const rumpf = JSON.parse(String(init?.body))
      expect(rumpf).toMatchObject({ query: 'Ali quotes', include_raw_content: true, search_depth: 'basic' })
      return new Response(JSON.stringify({ results: [{ url: 'https://a.example', title: 'A', content: 'x' }] }))
    })
    expect(await tavilySuche('tvly-x', http as typeof fetch)('Ali quotes', 1000)).toHaveLength(1)
    const fehler = (status: number) => tavilySuche('tvly-x', (async () => new Response('', { status })) as typeof fetch)('x', 1000)
    await expect(fehler(401)).rejects.toBeInstanceOf(DauerFehler)
    await expect(fehler(432)).rejects.toBeInstanceOf(DauerFehler)
    await expect(fehler(500)).rejects.not.toBeInstanceOf(DauerFehler)
    await expect(tavilySuche('', http as typeof fetch)('x', 1000)).rejects.toThrow('TAVILY_API_KEY')
  })

  it('nimmt wikipedia-artikel nur, wenn sie zum namen passen', async () => {
    const http = (async (url: string | URL | Request) => {
      const de = String(url).startsWith('https://de.')
      return new Response(
        JSON.stringify({ query: { pages: [{ title: de ? 'Rohkost' : 'Aajonus Vonderplanitz', extract: 'Text' }] } }),
      )
    }) as typeof fetch
    const seiten = await wikipediaSuche(http)('Aajonus Vonderplanitz', 1000)
    expect(seiten.map((s) => s.url)).toEqual(['https://en.wikipedia.org/wiki/Aajonus_Vonderplanitz'])
    expect(passtZumNamen('Ernährungsberater', 'Ernährungsberatung')).toBe(true)
    expect(passtZumNamen('Muhammad Ali', 'Muhammad Ali')).toBe(true)
    expect(passtZumNamen('Muhammad Ali', 'Boxen')).toBe(false)
  })

  it('rechnet mit dem kostenlosen qwen-modell, ohne vordenken', async () => {
    const http = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      expect(String(url)).toBe('https://llm.onerouter.pro/v1/chat/completions')
      const rumpf = JSON.parse(String(init?.body))
      expect(rumpf.model).toBe('qwen/qwen3.8-flash:free')
      expect(rumpf.reasoning).toEqual({ effort: 'none' })
      expect(rumpf.max_tokens).toBe(1234)
      expect(rumpf.messages.map((m: { role: string }) => m.role)).toEqual(['system', 'user'])
      return new Response(JSON.stringify({ choices: [{ message: { content: 'Notiz' } }] }))
    })
    const modell = freiesModell((name) => (name === 'INFRON_API_KEY' ? 'key' : undefined), http as typeof fetch)
    expect(await modell({ system: 's', nutzer: 'n', maxTokens: 1234, fristMs: 1000 })).toBe('Notiz')
    const ohne = freiesModell(() => undefined, http as typeof fetch)
    await expect(ohne({ system: 's', nutzer: 'n', maxTokens: 1, fristMs: 1 })).rejects.toThrow('INFRON_API_KEY')
    const mit = (status: number) =>
      freiesModell(() => 'key', (async () => new Response('', { status })) as typeof fetch)({ system: '', nutzer: '', maxTokens: 1, fristMs: 1 })
    await expect(mit(401)).rejects.toBeInstanceOf(DauerFehler)
    await expect(mit(429)).rejects.not.toBeInstanceOf(DauerFehler)
    await expect(mit(400)).rejects.not.toBeInstanceOf(DauerFehler)
  })
})
