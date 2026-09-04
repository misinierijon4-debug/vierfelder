import { describe, expect, it, vi } from 'vitest'
import {
  behandleFokus,
  publizierbarerSupabaseKey,
  type FokusAbhaengigkeiten,
} from '../../supabase/functions/_shared/fokus'

const TOKEN = 't'.repeat(64)
const ANON_KEY = 'x.eyJyb2xlIjoiYW5vbiJ9.y'

function umgebung(werte: Record<string, string | undefined>) {
  return vi.fn((name: string) => werte[name])
}

function abhaengigkeiten(
  werte: Record<string, string | undefined>,
  ergebnis: {
    data: unknown
    error: { code?: string; message?: string } | null
    status?: number
  } = {
    data: { ok: true, neu: true },
    error: null,
  }
) {
  const rpc = vi.fn(async () => ergebnis)
  const datenbank = vi.fn(() => ({ rpc }))
  const env = umgebung(werte)
  return {
    deps: { umgebung: env, datenbank } satisfies FokusAbhaengigkeiten,
    datenbank,
    env,
    rpc,
  }
}

async function json(antwort: Response) {
  return (await antwort.json()) as Record<string, unknown>
}

describe('fokus edge function', () => {
  it('bevorzugt den benannten publishable key und liest niemals service role', async () => {
    const key = 'sb_publishable_test'
    const { deps, datenbank, env, rpc } = abhaengigkeiten({
      SUPABASE_URL: 'https://projekt.supabase.co',
      SUPABASE_PUBLISHABLE_KEYS: JSON.stringify({ default: key }),
      SUPABASE_ANON_KEY: ANON_KEY,
      SUPABASE_SERVICE_ROLE_KEY: 'darf-nicht-gelesen-werden',
    })
    const antwort = await behandleFokus(
      new Request('https://projekt.functions.supabase.co/fokus?b=lernen&e=an', {
        method: 'POST',
        headers: { 'x-import-token': TOKEN },
      }),
      deps
    )

    expect(antwort.status).toBe(200)
    expect(await json(antwort)).toEqual({ ok: true, neu: true })
    expect(datenbank).toHaveBeenCalledWith('https://projekt.supabase.co', key)
    expect(rpc).toHaveBeenCalledWith('record_aufenthalt', {
      p_token: TOKEN,
      p_bereich: 'lernen',
      p_ort: 'fokus lernen',
      p_ereignis: 'an',
    })
    expect(env).not.toHaveBeenCalledWith('SUPABASE_SERVICE_ROLE_KEY')
  })

  it('nutzt den legacy-anon-key nur wenn die neue variable ganz fehlt', () => {
    expect(publizierbarerSupabaseKey(umgebung({ SUPABASE_ANON_KEY: ANON_KEY }))).toBe(ANON_KEY)
  })

  it.each([
    ['sb_secret_falsch'],
    ['x.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.y'],
    ['x.eyJyb2xlIjoic3VwYWJhc2VfYWRtaW4ifQ.y'],
    ['x.eyJyb2xlIjoicG9zdGdyZXMifQ.y'],
    ['x.eyJyb2xlIjoiYXV0aGVudGljYXRlZCJ9.y'],
    ['x.kein-json.y'],
    ['undurchsichtiger-key'],
  ])('lehnt privilegierte werte auch im legacy-anon-feld ab: %s', (key) => {
    expect(publizierbarerSupabaseKey(umgebung({ SUPABASE_ANON_KEY: key }))).toBeNull()
  })

  it.each(['kein json', '{}', '[]', '{"default":"sb_secret_falsch"}'])(
    'endet bei fehlerhafter publishable-konfiguration fail-closed: %s',
    async (wert) => {
      const { deps, datenbank } = abhaengigkeiten({
        SUPABASE_URL: 'https://projekt.supabase.co',
        SUPABASE_PUBLISHABLE_KEYS: wert,
        SUPABASE_ANON_KEY: ANON_KEY,
        SUPABASE_SERVICE_ROLE_KEY: 'service-role',
      })
      const antwort = await behandleFokus(
        new Request(`https://projekt.test/fokus?t=${TOKEN}&b=lesen&e=aus`),
        deps
      )
      expect(antwort.status).toBe(500)
      expect(datenbank).not.toHaveBeenCalled()
    }
  )

  it('faellt auch ohne öffentliche keys nicht auf service role zurück', async () => {
    const { deps, datenbank, env } = abhaengigkeiten({
      SUPABASE_URL: 'https://projekt.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'service-role',
    })
    const antwort = await behandleFokus(
      new Request(`https://projekt.test/fokus?t=${TOKEN}&b=lesen&e=an`),
      deps
    )
    expect(antwort.status).toBe(500)
    expect(datenbank).not.toHaveBeenCalled()
    expect(env).not.toHaveBeenCalledWith('SUPABASE_SERVICE_ROLE_KEY')
  })

  it('behält GET vorübergehend bei und kennzeichnet ihn als veraltet', async () => {
    const { deps } = abhaengigkeiten({
      SUPABASE_URL: 'https://projekt.supabase.co',
      SUPABASE_ANON_KEY: ANON_KEY,
    })
    const antwort = await behandleFokus(
      new Request(`https://projekt.test/fokus?t=${TOKEN}&b=boxen&e=aus`),
      deps
    )
    expect(antwort.status).toBe(200)
    expect(antwort.headers.get('deprecation')).toBe('true')
    expect(antwort.headers.get('x-zweikampf-fokus-get')).toBe('veraltet')
    expect(await json(antwort)).toEqual({ ok: true, neu: true, veraltet: true })
  })

  it('nimmt bei POST kein token aus der url', async () => {
    const { deps, datenbank } = abhaengigkeiten({
      SUPABASE_URL: 'https://projekt.supabase.co',
      SUPABASE_ANON_KEY: ANON_KEY,
    })
    const antwort = await behandleFokus(
      new Request(`https://projekt.test/fokus?t=${TOKEN}&b=lernen&e=an`, {
        method: 'POST',
        headers: { 'x-import-token': TOKEN },
      }),
      deps
    )
    expect(antwort.status).toBe(400)
    expect(await json(antwort)).toEqual({
      error: 'bei POST gehört das import-token in x-import-token',
    })
    expect(datenbank).not.toHaveBeenCalled()
  })

  it.each([
    ['PUT', `https://projekt.test/fokus?b=lernen&e=an`, 405],
    ['POST', `https://projekt.test/fokus?b=lernen&e=an`, 401],
    ['GET', `https://projekt.test/fokus?t=${TOKEN}&b=falsch&e=an`, 400],
    ['GET', `https://projekt.test/fokus?t=${TOKEN}&b=lesen&e=unbekannt`, 400],
  ])('validiert %s %s', async (method, url, status) => {
    const { deps, datenbank } = abhaengigkeiten({
      SUPABASE_URL: 'https://projekt.supabase.co',
      SUPABASE_ANON_KEY: ANON_KEY,
    })
    const antwort = await behandleFokus(new Request(url, { method }), deps)
    expect(antwort.status).toBe(status)
    expect(datenbank).not.toHaveBeenCalled()
  })

  it.each([
    ['ankunft', 'an'],
    ['ankommen', 'an'],
    ['arrival', 'an'],
    ['arrive', 'an'],
    ['start', 'an'],
    ['on', 'an'],
    ['abgang', 'aus'],
    ['verlassen', 'aus'],
    ['weggehen', 'aus'],
    ['departure', 'aus'],
    ['leave', 'aus'],
    ['ende', 'aus'],
    ['off', 'aus'],
  ])('erhält den datenbank-alias %s als %s', async (alias, erwartet) => {
    const { deps, rpc } = abhaengigkeiten({
      SUPABASE_URL: 'https://projekt.supabase.co',
      SUPABASE_ANON_KEY: ANON_KEY,
    })
    const antwort = await behandleFokus(
      new Request(`https://projekt.test/fokus?t=${TOKEN}&b=lernen&e=${alias}`),
      deps
    )

    expect(antwort.status).toBe(200)
    expect(rpc).toHaveBeenCalledWith(
      'record_aufenthalt',
      expect.objectContaining({ p_ereignis: erwartet })
    )
  })

  it('gibt unbekannte datenbankdetails nicht an den aufrufer weiter', async () => {
    const geheim = 'relation intern token=SUPERSECRET'
    const { deps } = abhaengigkeiten(
      { SUPABASE_URL: 'https://projekt.supabase.co', SUPABASE_ANON_KEY: ANON_KEY },
      { data: null, error: { code: 'XX000', message: geheim } }
    )
    const antwort = await behandleFokus(
      new Request(`https://projekt.test/fokus?t=${TOKEN}&b=lernen&e=an`),
      deps
    )
    const text = await antwort.text()
    expect(antwort.status).toBe(500)
    expect(text).toContain('konnte nicht gespeichert werden')
    expect(text).not.toContain(geheim)
    expect(text).not.toContain('SUPERSECRET')
  })

  it('verbirgt auch geworfene netzwerkfehler', async () => {
    const geheim = 'connect ECONNREFUSED 10.0.0.5 token=SUPERSECRET'
    const env = umgebung({
      SUPABASE_URL: 'https://projekt.supabase.co',
      SUPABASE_ANON_KEY: ANON_KEY,
    })
    const datenbank = vi.fn(() => ({
      rpc: vi.fn(async () => Promise.reject(new Error(geheim))),
    }))
    const antwort = await behandleFokus(
      new Request(`https://projekt.test/fokus?t=${TOKEN}&b=lernen&e=an`),
      { umgebung: env, datenbank }
    )
    const text = await antwort.text()
    expect(antwort.status).toBe(502)
    expect(text).toContain('speicher ist nicht erreichbar')
    expect(text).not.toContain(geheim)
    expect(text).not.toContain('SUPERSECRET')
  })

  it('übersetzt nur den bekannten tokenfehler in 401', async () => {
    const { deps } = abhaengigkeiten(
      { SUPABASE_URL: 'https://projekt.supabase.co', SUPABASE_ANON_KEY: ANON_KEY },
      { data: null, error: { message: 'kein gueltiges import-token' } }
    )
    const antwort = await behandleFokus(
      new Request(`https://projekt.test/fokus?t=${TOKEN}&b=lernen&e=an`),
      deps
    )
    expect(antwort.status).toBe(401)
    expect(await json(antwort)).toEqual({ error: 'import-token ist ungültig' })
  })

  it('deutet interne meldungen mit dem wort import-token nicht als authfehler', async () => {
    const { deps } = abhaengigkeiten(
      { SUPABASE_URL: 'https://projekt.supabase.co', SUPABASE_ANON_KEY: ANON_KEY },
      { data: null, error: { message: 'import-token audit index ist intern kaputt' } }
    )
    const antwort = await behandleFokus(
      new Request(`https://projekt.test/fokus?t=${TOKEN}&b=lernen&e=an`),
      deps
    )
    expect(antwort.status).toBe(500)
  })

  it('meldet einen nicht ausgeführten abgang als konflikt statt als erfolg', async () => {
    const { deps } = abhaengigkeiten(
      { SUPABASE_URL: 'https://projekt.supabase.co', SUPABASE_ANON_KEY: ANON_KEY },
      { data: { ok: false, grund: 'interner datenbanktext' }, error: null }
    )
    const antwort = await behandleFokus(
      new Request(`https://projekt.test/fokus?t=${TOKEN}&b=lernen&e=aus`),
      deps
    )
    expect(antwort.status).toBe(409)
    expect(await json(antwort)).toEqual({
      error: 'kein passender offener fokus vorhanden',
      code: 'kein_offener_fokus',
    })
  })

  it('trennt ungültige server-url und clientaufbau vom netzwerkfehler', async () => {
    const ungültig = abhaengigkeiten({
      SUPABASE_URL: 'ftp://intern.example',
      SUPABASE_ANON_KEY: ANON_KEY,
    })
    const urlAntwort = await behandleFokus(
      new Request(`https://projekt.test/fokus?t=${TOKEN}&b=lernen&e=an`),
      ungültig.deps
    )
    expect(urlAntwort.status).toBe(500)
    expect(ungültig.datenbank).not.toHaveBeenCalled()

    const env = umgebung({
      SUPABASE_URL: 'https://projekt.supabase.co',
      SUPABASE_ANON_KEY: ANON_KEY,
    })
    const datenbank = vi.fn(() => {
      throw new Error('geheimer clientaufbau')
    })
    const clientAntwort = await behandleFokus(
      new Request(`https://projekt.test/fokus?t=${TOKEN}&b=lernen&e=an`),
      { umgebung: env, datenbank }
    )
    expect(clientAntwort.status).toBe(500)
    expect((await clientAntwort.text())).not.toContain('geheimer clientaufbau')
  })

  it('erkennt die echte supabase-js-transportform mit status 0 als 502', async () => {
    const geheim = 'TypeError: fetch failed zu 10.0.0.5 token=SUPERSECRET'
    const { deps } = abhaengigkeiten(
      { SUPABASE_URL: 'https://projekt.supabase.co', SUPABASE_ANON_KEY: ANON_KEY },
      { data: null, error: { code: '', message: geheim }, status: 0 }
    )
    const antwort = await behandleFokus(
      new Request(`https://projekt.test/fokus?t=${TOKEN}&b=lernen&e=an`),
      deps
    )
    const text = await antwort.text()
    expect(antwort.status).toBe(502)
    expect(text).toContain('speicher ist nicht erreichbar')
    expect(text).not.toContain(geheim)
    expect(text).not.toContain('SUPERSECRET')
  })
})
