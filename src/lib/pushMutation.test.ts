/** @vitest-environment jsdom */

import { beforeEach, describe, expect, it, vi } from 'vitest'

const mock = vi.hoisted(() => ({
  getSession: vi.fn(),
  from: vi.fn(),
  upsert: vi.fn(),
  delete: vi.fn(),
  match: vi.fn(),
  upsertSelect: vi.fn(),
  deleteSelect: vi.fn(),
  upsertMaybeSingle: vi.fn(),
  deleteMaybeSingle: vi.fn(),
}))

vi.mock('./supabase', () => ({
  hatSupabase: true,
  supabase: {
    auth: { getSession: mock.getSession },
    from: mock.from,
  },
}))

import {
  pushAbmelden,
  pushAnmelden,
  pushProbe,
  WiederholbarerPushFehler,
} from './push'

const USER_ID = '11111111-1111-4111-8111-111111111111'
const ENDPOINT = 'https://web.push.apple.com/QH/geraet-eins'

let abo: PushSubscription
let getSubscription: ReturnType<typeof vi.fn>
let subscribe: ReturnType<typeof vi.fn>
let requestPermission: ReturnType<typeof vi.fn>
let reihenfolge: string[]

function baueAbo(): PushSubscription {
  return baueAboMitEndpoint(ENDPOINT)
}

function baueAboMitEndpoint(endpoint: string): PushSubscription {
  return {
    endpoint,
    expirationTime: null,
    options: {} as PushSubscriptionOptions,
    getKey: vi.fn((name: PushEncryptionKeyName) =>
      name === 'p256dh' ? new Uint8Array(65).buffer : new Uint8Array(16).buffer
    ),
    toJSON: vi.fn(() => ({})),
    unsubscribe: vi.fn(async () => {
      reihenfolge.push('browser-abmelden')
      return true
    }),
  }
}

function upsertErgebnis(
  data: { endpoint: string; user_id: string } | null,
  error: { message: string } | null = null
) {
  mock.upsertMaybeSingle.mockResolvedValue({ data, error })
}

function deleteErgebnis(
  data: { endpoint: string; user_id: string } | null,
  error: { message: string } | null = null
) {
  mock.deleteMaybeSingle.mockImplementation(async () => {
    reihenfolge.push('datenbank-bestätigt')
    return { data, error }
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('VITE_SUPABASE_URL', 'https://projekt.supabase.co')
  vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'öffentlicher-testschlüssel')
  reihenfolge = []
  abo = baueAbo()
  getSubscription = vi.fn().mockResolvedValue(null)
  subscribe = vi.fn().mockResolvedValue(abo)
  const registration = { pushManager: { getSubscription, subscribe } }

  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: {
      getRegistration: vi.fn().mockResolvedValue(registration),
      ready: Promise.resolve(registration),
    },
  })
  Object.defineProperty(window, 'PushManager', {
    configurable: true,
    value: class PushManager {},
  })
  requestPermission = vi.fn().mockResolvedValue('granted')
  Object.defineProperty(window, 'Notification', {
    configurable: true,
    value: { permission: 'default', requestPermission },
  })

  mock.getSession.mockResolvedValue({
    data: { session: { user: { id: USER_ID }, access_token: 'nicht-ausgeben' } },
    error: null,
  })
  mock.from.mockImplementation((tabelle: string) => {
    expect(tabelle).toBe('push_abos')
    return { upsert: mock.upsert, delete: mock.delete }
  })
  mock.upsert.mockReturnValue({ select: mock.upsertSelect })
  mock.upsertSelect.mockReturnValue({ maybeSingle: mock.upsertMaybeSingle })
  mock.delete.mockReturnValue({ match: mock.match })
  mock.match.mockReturnValue({ select: mock.deleteSelect })
  mock.deleteSelect.mockReturnValue({ maybeSingle: mock.deleteMaybeSingle })
  upsertErgebnis({ endpoint: ENDPOINT, user_id: USER_ID })
  deleteErgebnis({ endpoint: ENDPOINT, user_id: USER_ID })
})

describe('push-abo bestaetigt speichern', () => {
  it('sendet den nutzer explizit und akzeptiert nur endpoint und nutzer zurück', async () => {
    await expect(pushAnmelden()).resolves.toBe('an')

    expect(mock.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        endpoint: ENDPOINT,
        user_id: USER_ID,
        p256dh: expect.any(String),
        auth: expect.any(String),
      }),
      { onConflict: 'endpoint' }
    )
    expect(mock.upsertSelect).toHaveBeenCalledWith('endpoint,user_id')
    expect(abo.unsubscribe).not.toHaveBeenCalled()
  })

  it('bestätigt ein vorhandenes browser-abo für den aktuellen nutzer', async () => {
    getSubscription.mockResolvedValue(abo)

    await expect(pushAnmelden()).resolves.toBe('an')

    expect(mock.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ endpoint: ENDPOINT, user_id: USER_ID }),
      { onConflict: 'endpoint' }
    )
    expect(requestPermission).not.toHaveBeenCalled()
    expect(subscribe).not.toHaveBeenCalled()
    expect(abo.unsubscribe).not.toHaveBeenCalled()
  })

  it('deaktiviert ein fremdes vorhandenes abo und ermöglicht einen ehrlichen retry', async () => {
    getSubscription.mockResolvedValue(abo)
    upsertErgebnis(null, { message: 'row-level security' })

    const fehler = await pushAnmelden().catch((grund) => grund)
    expect(fehler).toBeInstanceOf(WiederholbarerPushFehler)
    expect(fehler).toMatchObject({ wiederholbar: true })
    expect(fehler.message).not.toContain(ENDPOINT)
    expect(abo.unsubscribe).toHaveBeenCalledOnce()

    const neuesAbo = baueAboMitEndpoint(`${ENDPOINT}-neu`)
    getSubscription.mockResolvedValue(null)
    subscribe.mockResolvedValue(neuesAbo)
    upsertErgebnis({ endpoint: neuesAbo.endpoint, user_id: USER_ID })

    await expect(pushAnmelden()).resolves.toBe('an')
    expect(subscribe).toHaveBeenCalledOnce()
    expect(neuesAbo.unsubscribe).not.toHaveBeenCalled()
  })

  it('nimmt einen fehlerlosen rls-nulltreffer nicht als gespeichertes abo an', async () => {
    upsertErgebnis(null)

    await expect(pushAnmelden()).rejects.toThrow('push-abo konnte nicht bestätigt werden')
    expect(abo.unsubscribe).toHaveBeenCalledOnce()
  })

  it('weist eine bestätigung für einen anderen nutzer zurück', async () => {
    upsertErgebnis({
      endpoint: ENDPOINT,
      user_id: '22222222-2222-4222-8222-222222222222',
    })

    await expect(pushAnmelden()).rejects.toThrow('push-abo konnte nicht bestätigt werden')
    expect(abo.unsubscribe).toHaveBeenCalledOnce()
  })

  it('dreht das browser-abo bei einem datenbank-netzfehler zurück', async () => {
    upsertErgebnis(null, { message: 'network request failed' })

    await expect(pushAnmelden()).rejects.toThrow('push-abo konnte nicht bestätigt werden')
    expect(abo.unsubscribe).toHaveBeenCalledOnce()
  })

  it('erzeugt bei einem sitzungsfehler noch kein browser-abo', async () => {
    mock.getSession.mockResolvedValue({
      data: { session: null },
      error: { message: 'network request failed' },
    })

    await expect(pushAnmelden()).rejects.toThrow('anmeldung konnte nicht geprüft werden')
    expect(requestPermission).not.toHaveBeenCalled()
    expect(subscribe).not.toHaveBeenCalled()
  })
})

describe('push-abo bestaetigt abmelden', () => {
  beforeEach(() => {
    getSubscription.mockResolvedValue(abo)
  })

  it('löscht und bestätigt die eigene db-zeile vor dem browser-abo', async () => {
    await expect(pushAbmelden()).resolves.toBe('aus')

    expect(mock.match).toHaveBeenCalledWith({ endpoint: ENDPOINT, user_id: USER_ID })
    expect(mock.deleteSelect).toHaveBeenCalledWith('endpoint,user_id')
    expect(reihenfolge).toEqual(['datenbank-bestätigt', 'browser-abmelden'])
  })

  it('behält bei einem rls-nulltreffer das browser-abo für den retry', async () => {
    deleteErgebnis(null)

    const fehler = await pushAbmelden().catch((grund) => grund)
    expect(fehler).toBeInstanceOf(WiederholbarerPushFehler)
    expect(fehler).toMatchObject({ wiederholbar: true })
    expect(fehler.message).toContain('app- oder browser-einstellungen')
    expect(abo.unsubscribe).not.toHaveBeenCalled()
  })

  it('behält bei einem db-netzfehler das browser-abo für den retry', async () => {
    deleteErgebnis(null, { message: 'network request failed' })

    await expect(pushAbmelden()).rejects.toBeInstanceOf(WiederholbarerPushFehler)
    expect(abo.unsubscribe).not.toHaveBeenCalled()
  })

  it('behält bei einer abweichenden löschbestätigung das browser-abo', async () => {
    deleteErgebnis({ endpoint: ENDPOINT, user_id: '22222222-2222-4222-8222-222222222222' })

    await expect(pushAbmelden()).rejects.toBeInstanceOf(WiederholbarerPushFehler)
    expect(abo.unsubscribe).not.toHaveBeenCalled()
  })

  it('behält bei einem sitzungsfehler das browser-abo unangetastet', async () => {
    mock.getSession.mockResolvedValue({
      data: { session: null },
      error: { message: 'network request failed' },
    })

    await expect(pushAbmelden()).rejects.toThrow('anmeldung konnte nicht geprüft werden')
    expect(mock.delete).not.toHaveBeenCalled()
    expect(abo.unsubscribe).not.toHaveBeenCalled()
  })
})

describe('push-probe mit belastbarer sitzung', () => {
  it('meldet einen getSession-netzfehler und sendet keinen request', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch')
    mock.getSession.mockResolvedValue({
      data: { session: null },
      error: { message: 'network request failed' },
    })

    await expect(pushProbe()).rejects.toThrow('anmeldung konnte nicht geprüft werden')
    expect(fetch).not.toHaveBeenCalled()
    fetch.mockRestore()
  })
})
