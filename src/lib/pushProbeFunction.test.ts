import { describe, expect, it, vi } from 'vitest'
import {
  behandlePushProbe,
  type PushProbeAbhaengigkeiten,
  type PushProbeDatenbank,
} from '../../supabase/functions/_shared/pushProbe'

const TOKEN = 'kopf.inhalt.signatur'

function szenario(options: {
  user?: { id: string } | null
  authFehler?: { code?: string; message?: string; status?: number } | null
  mitglied?: { id: string } | null
  mitgliedFehler?: { code?: string; message?: string } | null
  abos?: Array<{ endpoint: string; p256dh: string; auth: string }>
  aboFehler?: { code?: string; message?: string } | null
  reserviert?: boolean | null
  reservierungFehler?: { code?: string; message?: string } | null
  umgebung?: Record<string, string | undefined>
} = {}) {
  const getUser = vi.fn(async () => ({
    data: { user: options.user === undefined ? { id: 'mitglied-1' } : options.user },
    error: options.authFehler ?? null,
  }))
  const maybeSingle = vi.fn(async () => ({
    data: options.mitglied === undefined ? { id: 'mitglied-1' } : options.mitglied,
    error: options.mitgliedFehler ?? null,
  }))
  const profilEq = vi.fn(() => ({ maybeSingle }))
  const profilSelect = vi.fn(() => ({ eq: profilEq }))
  const pushSelect = vi.fn(async () => ({
    data:
      options.abos === undefined
        ? [{ endpoint: 'https://web.push.apple.com/q', p256dh: 'p', auth: 'a' }]
        : options.abos,
    error: options.aboFehler ?? null,
  }))
  const loeschSelect = vi.fn(async () => ({ data: [], error: null }))
  const loeschIn = vi.fn(() => ({ select: loeschSelect }))
  const loeschen = vi.fn(() => ({ in: loeschIn }))
  const rpc = vi.fn(async () => ({
    data: options.reserviert === undefined ? true : options.reserviert,
    error: options.reservierungFehler ?? null,
  }))
  const from = vi.fn((tabelle: string) => {
    if (tabelle === 'profile') return { select: profilSelect }
    if (tabelle === 'push_abos') return { select: pushSelect, delete: loeschen }
    throw new Error(`unerwartete tabelle ${tabelle}`)
  })
  const db = { auth: { getUser }, from, rpc } as unknown as PushProbeDatenbank
  const datenbank = vi.fn(() => db)
  const senden = vi.fn(async () => ({ status: 201, weg: false, fehler: null }))
  const protokoll = { log: vi.fn(), error: vi.fn() }
  const deps: PushProbeAbhaengigkeiten = {
    umgebung: (name) => {
      const standard = {
        SUPABASE_URL: 'https://projekt.supabase.co',
        SUPABASE_PUBLISHABLE_KEYS: JSON.stringify({ default: 'sb_publishable_test' }),
        VAPID_PUBLIC_KEY: 'vapid-public',
        VAPID_PRIVATE_KEY: 'vapid-private',
        VAPID_KONTAKT: 'mailto:test@example.com',
      }
      return options.umgebung && name in options.umgebung
        ? options.umgebung[name]
        : standard[name as keyof typeof standard]
    },
    datenbank,
    senden,
    dienst: () => 'apple',
    protokoll,
  }
  return {
    deps,
    datenbank,
    from,
    getUser,
    maybeSingle,
    profilEq,
    pushSelect,
    rpc,
    senden,
    protokoll,
  }
}

function anfrage(token = TOKEN) {
  return new Request('https://projekt.functions.supabase.co/push-test', {
    method: 'POST',
    headers: token === '' ? {} : { authorization: `Bearer ${token}` },
    body: '{}',
  })
}

async function json(antwort: Response) {
  return (await antwort.json()) as Record<string, unknown>
}

describe('push-probe edge function', () => {
  it('verwirft fehlende und abgelaufene anmeldungen vor allen datenabfragen', async () => {
    const ohneToken = szenario()
    const antwortOhneToken = await behandlePushProbe(anfrage(''), ohneToken.deps)
    expect(antwortOhneToken.status).toBe(401)
    expect(ohneToken.datenbank).not.toHaveBeenCalled()

    const abgelaufen = szenario({
      user: null,
      authFehler: { message: 'jwt expired', status: 401 },
    })
    const antwortAbgelaufen = await behandlePushProbe(anfrage('geheim'), abgelaufen.deps)
    expect(antwortAbgelaufen.status).toBe(401)
    expect(await antwortAbgelaufen.text()).not.toContain('geheim')
    expect(abgelaufen.from).not.toHaveBeenCalled()
  })

  it('unterscheidet eine unerreichbare auth-infrastruktur von einem falschen jwt', async () => {
    const fehlerantwort = szenario({
      user: null,
      authFehler: { message: 'upstream unavailable', status: 503 },
    })
    expect((await behandlePushProbe(anfrage(), fehlerantwort.deps)).status).toBe(502)

    const ausnahme = szenario()
    ausnahme.getUser.mockRejectedValueOnce(new Error('netz weg'))
    expect((await behandlePushProbe(anfrage(), ausnahme.deps)).status).toBe(502)
    expect(ausnahme.from).not.toHaveBeenCalled()
  })

  it('bevorzugt den neuen publishable key und endet bei kaputtem json fail-closed', async () => {
    const test = szenario()
    expect((await behandlePushProbe(anfrage(), test.deps)).status).toBe(200)
    expect(test.datenbank).toHaveBeenCalledWith(
      'https://projekt.supabase.co',
      'sb_publishable_test',
      `Bearer ${TOKEN}`
    )

    const kaputt = szenario({
      umgebung: {
        SUPABASE_PUBLISHABLE_KEYS: '{kaputt',
        SUPABASE_ANON_KEY: 'x.eyJyb2xlIjoiYW5vbiJ9.y',
      },
    })
    expect((await behandlePushProbe(anfrage(), kaputt.deps)).status).toBe(500)
    expect(kaputt.datenbank).not.toHaveBeenCalled()
  })

  it('laesst ein authentifiziertes fremdkonto weder abos lesen noch push senden', async () => {
    const test = szenario({ user: { id: 'fremd' }, mitglied: null })
    const antwort = await behandlePushProbe(anfrage(), test.deps)

    expect(antwort.status).toBe(403)
    expect(await json(antwort)).toEqual({ error: 'dieses konto gehört nicht zum duell' })
    expect(test.pushSelect).not.toHaveBeenCalled()
    expect(test.profilEq).toHaveBeenCalledWith('id', 'fremd')
    expect(test.rpc).not.toHaveBeenCalled()
    expect(test.senden).not.toHaveBeenCalled()
  })

  it('reserviert keine rate-limit-zeile, solange kein geraet angemeldet ist', async () => {
    const test = szenario({ abos: [] })
    const antwort = await behandlePushProbe(anfrage(), test.deps)

    expect(antwort.status).toBe(404)
    expect(test.rpc).not.toHaveBeenCalled()
    expect(test.senden).not.toHaveBeenCalled()
  })

  it('begrenzt parallele oder zu schnelle proben sichtbar auf eine pro minute', async () => {
    const test = szenario({ reserviert: false })
    const antwort = await behandlePushProbe(anfrage(), test.deps)

    expect(antwort.status).toBe(429)
    expect(antwort.headers.get('retry-after')).toBe('60')
    expect(await json(antwort)).toEqual({
      error: 'bitte warte eine minute bis zur nächsten probe',
    })
    expect(test.senden).not.toHaveBeenCalled()
  })

  it('sendet erst nach authentifizierung, mitgliedschaft und atomarer reservierung', async () => {
    const test = szenario()
    const antwort = await behandlePushProbe(anfrage(), test.deps)

    expect(antwort.status).toBe(200)
    expect(test.getUser).toHaveBeenCalledWith(TOKEN)
    expect(test.maybeSingle).toHaveBeenCalled()
    expect(test.rpc).toHaveBeenCalledWith('reserviere_push_probe')
    expect(test.senden).toHaveBeenCalledTimes(1)
    expect(await json(antwort)).toMatchObject({ gesendet: 1, entfernt: 0 })
  })

  it('endet bei einer mehrdeutigen rpc-antwort fail-closed', async () => {
    const test = szenario({ reserviert: null })
    const antwort = await behandlePushProbe(anfrage(), test.deps)

    expect(antwort.status).toBe(500)
    expect(test.senden).not.toHaveBeenCalled()
  })
})
