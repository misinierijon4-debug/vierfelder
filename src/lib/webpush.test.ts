import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  MAX_NUTZLAST,
  b64urlZuBytes,
  bytesZuB64url,
  sende,
  vapidAutorisierung,
  verschluessele,
} from '../../supabase/functions/_shared/webpush'

/**
 * Fester Vektor. Erzeugt mit dieser Fassung und gegengeprueft mit `http_ece` —
 * derselben Bibliothek, die `web-push` benutzt: der Koerper unten liess sich
 * mit dem privaten Schluessel des Handys wieder zu `TEXT` entschluesseln.
 *
 * Der Test friert damit jedes Byte der Ableitung ein. Wer eine Beschriftung
 * antastet ("WebPush: info", "Content-Encoding: aes128gcm"), die Reihenfolge
 * der Schluessel im `key_info` dreht oder das Trennbyte 0x02 aendert, bekommt
 * hier einen roten Test statt einer Nachricht, die auf keinem Handy ankommt.
 */
const TEXT = 'heute noch nicht gelesen?'
const HANDY_P256DH =
  'BNnj73vM1y4bVXr9dmXmr5H4Tp92UE3hfw0guDCcCmSNJJOASxPyeLwArm83vnxJu4-3_hPulZETaetRKtpkWq8'
const HANDY_AUTH = '9obDovhjr97zGQwqvXBZrg'
const SALZ = 'X2iA_fM8VJKpXh4MS7USaQ'
const SENDER = {
  d: '_ogymy8Mh9bFvczAd7PP4xdKvcHkY8x_ZcxKwexgbX0',
  x: 'ZWemoEpSVTGB7togjocL6zB2p2FWwtrR_RcXhmXAel4',
  y: 'cmcCbPzZFgT7JODsGqeXn6k1PR9lGwvPfunWz9gcc-8',
}
const KOERPER =
  'X2iA_fM8VJKpXh4MS7USaQAAEABBBGVnpqBKUlUxge7aII6HC-swdqdhVsLa0f0XF4ZlwHpecmcCbPzZFgT7JOD' +
  'sGqeXn6k1PR9lGwvPfunWz9gcc-_ctpI29sHCaaddCNs9fyJMhJ4cJCiB9fkyXr0HQmCw5AxhnOS-JH4ayi8'

async function senderPaar(): Promise<CryptoKeyPair> {
  const gemeinsam = { kty: 'EC', crv: 'P-256', x: SENDER.x, y: SENDER.y }
  const [privateKey, publicKey] = await Promise.all([
    crypto.subtle.importKey(
      'jwk',
      { ...gemeinsam, d: SENDER.d },
      { name: 'ECDH', namedCurve: 'P-256' },
      false,
      ['deriveBits']
    ),
    crypto.subtle.importKey('jwk', gemeinsam, { name: 'ECDH', namedCurve: 'P-256' }, true, []),
  ])
  return { privateKey, publicKey }
}

describe('base64url', () => {
  it('geht hin und zurueck, auch ohne fuellzeichen', () => {
    for (const laenge of [1, 15, 16, 32, 65]) {
      const bytes = crypto.getRandomValues(new Uint8Array(laenge))
      expect(b64urlZuBytes(bytesZuB64url(bytes))).toEqual(bytes)
    }
  })

  it('schreibt weder + noch / noch =', () => {
    const text = bytesZuB64url(new Uint8Array([251, 255, 190, 0, 1, 2]))
    expect(text).not.toMatch(/[+/=]/)
  })
})

describe('verschluesselung nach rfc 8291', () => {
  it('trifft den festen vektor byte fuer byte', async () => {
    const koerper = await verschluessele(
      TEXT,
      { p256dh: HANDY_P256DH, auth: HANDY_AUTH },
      { paar: await senderPaar(), salz: b64urlZuBytes(SALZ) }
    )
    expect(bytesZuB64url(koerper)).toBe(KOERPER)
  })

  it('baut den kopf aus salz, rekordgroesse und eigenem schluessel', async () => {
    const koerper = await verschluessele(TEXT, { p256dh: HANDY_P256DH, auth: HANDY_AUTH })
    expect(koerper.slice(0, 16)).toHaveLength(16)
    expect(new DataView(koerper.buffer, koerper.byteOffset).getUint32(16)).toBe(4096)
    expect(koerper[20]).toBe(65)
    // 0x04 heisst: unkomprimierter punkt. alles andere versteht kein handy.
    expect(koerper[21]).toBe(4)
  })

  it('zieht fuer jede nachricht neues salz und neuen schluessel', async () => {
    const abo = { p256dh: HANDY_P256DH, auth: HANDY_AUTH }
    const eins = await verschluessele(TEXT, abo)
    const zwei = await verschluessele(TEXT, abo)
    expect(bytesZuB64url(eins)).not.toBe(bytesZuB64url(zwei))
  })

  it('lehnt ab, was in keinen rekord passt', async () => {
    const abo = { p256dh: HANDY_P256DH, auth: HANDY_AUTH }
    await expect(verschluessele('x'.repeat(MAX_NUTZLAST + 1), abo)).rejects.toThrow('zu lang')
  })
})

describe('vapid', () => {
  async function schluesselpaar() {
    const paar = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
      'sign',
      'verify',
    ])) as CryptoKeyPair
    const jwk = await crypto.subtle.exportKey('jwk', paar.privateKey)
    const roh = new Uint8Array(await crypto.subtle.exportKey('raw', paar.publicKey))
    return {
      pruefer: paar.publicKey,
      schluessel: {
        oeffentlich: bytesZuB64url(roh),
        privat: jwk.d as string,
        kontakt: 'mailto:zweikampf@example.com',
      },
    }
  }

  it('unterschreibt ein jwt, das mit dem oeffentlichen schluessel aufgeht', async () => {
    const { pruefer, schluessel } = await schluesselpaar()
    const jetzt = Date.parse('2026-09-02T20:00:00Z')
    const kopf = await vapidAutorisierung('https://web.push.apple.com/eins/zwei', schluessel, jetzt)

    expect(kopf.startsWith('vapid t=')).toBe(true)
    expect(kopf.endsWith(`, k=${schluessel.oeffentlich}`)).toBe(true)

    const token = kopf.slice('vapid t='.length).split(', k=')[0]!
    const [a, b, unterschrift] = token.split('.')
    expect(JSON.parse(new TextDecoder().decode(b64urlZuBytes(a!)))).toEqual({
      typ: 'JWT',
      alg: 'ES256',
    })
    // die zielgruppe ist die herkunft des endpunkts, nie der ganze pfad: der
    // pfad ist die adresse des handys und hat in einem token nichts verloren.
    expect(JSON.parse(new TextDecoder().decode(b64urlZuBytes(b!)))).toEqual({
      aud: 'https://web.push.apple.com',
      exp: Math.floor(jetzt / 1000) + 12 * 60 * 60,
      sub: 'mailto:zweikampf@example.com',
    })

    const gueltig = await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      pruefer,
      b64urlZuBytes(unterschrift!) as BufferSource,
      new TextEncoder().encode(`${a}.${b}`)
    )
    expect(gueltig).toBe(true)
  })

  it('merkt, wenn der oeffentliche schluessel kein p-256-punkt ist', async () => {
    const { schluessel } = await schluesselpaar()
    await expect(
      vapidAutorisierung('https://example.com/x', { ...schluessel, oeffentlich: 'AAAA' })
    ).rejects.toThrow('p-256-punkt')
  })
})

describe('senden', () => {
  afterEach(() => vi.unstubAllGlobals())

  const abo = {
    endpoint: 'https://web.push.apple.com/eins',
    p256dh: HANDY_P256DH,
    auth: HANDY_AUTH,
  }
  const schluessel = {
    oeffentlich:
      'BPBikYfCtufw6fHehwcew3_mc_8Su8IZdON2Ne39ZxiFCNwTXhDCw53RLu4IFlYLP1J7gNMsEtqpnLcWnZsAISg',
    privat: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    kontakt: 'mailto:test@example.com',
  }

  /** der signierschritt braucht ein echtes paar, sonst wirft schon der import */
  async function echterSchluessel() {
    const paar = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
      'sign',
    ])) as CryptoKeyPair
    const jwk = await crypto.subtle.exportKey('jwk', paar.privateKey)
    const roh = new Uint8Array(await crypto.subtle.exportKey('raw', paar.publicKey))
    return { ...schluessel, oeffentlich: bytesZuB64url(roh), privat: jwk.d as string }
  }

  it('meldet einen angenommenen push ohne fehler', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 201 })))
    expect(await sende(abo, 'hallo', await echterSchluessel())).toEqual({
      status: 201,
      weg: false,
      fehler: null,
    })
  })

  it('erkennt ein abo, das der dienst nicht mehr kennt', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 410 })))
    expect(await sende(abo, 'hallo', await echterSchluessel())).toEqual({
      status: 410,
      weg: true,
      fehler: null,
    })
  })

  /**
   * der grund fuer die frist: ohne sie haengt der aufruf, bis die function
   * abgeraeumt wird — und dann antwortet das gateway mit einer html-seite,
   * an der jeder zerbricht, der json erwartet.
   */
  it('gibt auf, statt zu haengen', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, optionen: { signal?: AbortSignal }) => {
        await new Promise((_, ab) => {
          optionen.signal?.addEventListener('abort', () => ab(optionen.signal!.reason))
        })
        return new Response(null)
      })
    )
    const ergebnis = await sende(abo, 'hallo', await echterSchluessel(), 60, 20)
    expect(ergebnis.status).toBe(0)
    expect(ergebnis.weg).toBe(false)
    expect(ergebnis.fehler).toBe('push-dienst antwortet nicht in 0.02 s')
  })

  it('reicht die antwort des dienstes durch, wenn er ablehnt', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('BadSubscription', { status: 400 })))
    const ergebnis = await sende(abo, 'hallo', await echterSchluessel())
    expect(ergebnis).toEqual({ status: 400, weg: false, fehler: 'BadSubscription' })
  })
})
