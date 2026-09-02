/**
 * Web Push ohne Bibliothek: Verschluesselung nach RFC 8291 (aes128gcm) und
 * Absenderausweis nach RFC 8292 (VAPID).
 *
 * Warum selbst gebaut statt `npm:web-push`: die Bibliothek bringt den
 * halben Node-Unterbau mit in eine Deno-Function, und alles, was sie tut,
 * sind zwei Ableitungen und eine Signatur — beides kann die Web Crypto API,
 * die in Deno wie im Browser wie in Node dieselbe ist. Damit laeuft derselbe
 * Code in der Edge Function und in den Tests unter Node.
 *
 * Der Ablauf einer Nachricht:
 *
 *   1. ein Wegwerf-Schluesselpaar (ECDH P-256) je Nachricht
 *   2. gemeinsames Geheimnis mit dem oeffentlichen Schluessel des Handys
 *   3. daraus mit dem `auth`-Geheimnis des Abos Schluessel und Nonce
 *   4. AES-128-GCM ueber den Text
 *   5. Kopf aus Salz, Rekordgroesse und dem eigenen oeffentlichen Schluessel
 *
 * Der Push-Dienst (Apple, Google, Mozilla) sieht davon nur Bytes. Entschluesseln
 * kann allein das Handy, das das Abo angelegt hat.
 */

/** groesse eines rekords. wir senden immer genau einen. */
export const REKORD_GROESSE = 4096

/** was in einen rekord passt: rekord minus gcm-pruefsumme minus trennbyte */
export const MAX_NUTZLAST = REKORD_GROESSE - 16 - 1

export type Abo = {
  endpoint: string
  /** oeffentlicher schluessel des handys, base64url, 65 bytes */
  p256dh: string
  /** geteiltes geheimnis des abos, base64url, 16 bytes */
  auth: string
}

export type VapidSchluessel = {
  /** base64url, 65 bytes, unkomprimierter punkt */
  oeffentlich: string
  /** base64url, 32 bytes */
  privat: string
  /** `mailto:` oder `https:` — an wen sich der push-dienst bei problemen wendet */
  kontakt: string
}

export type Sendeergebnis = {
  status: number
  /** true heisst: das abo gibt es nicht mehr, zeile loeschen */
  weg: boolean
  fehler: string | null
}

const roh = new TextEncoder()

export function bytesZuB64url(bytes: Uint8Array): string {
  let text = ''
  for (const b of bytes) text += String.fromCharCode(b)
  return btoa(text).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function b64urlZuBytes(text: string): Uint8Array {
  const grund = text.replace(/-/g, '+').replace(/_/g, '/')
  const gefuellt = grund + '='.repeat((4 - (grund.length % 4)) % 4)
  const binaer = atob(gefuellt)
  const bytes = new Uint8Array(binaer.length)
  for (let i = 0; i < binaer.length; i += 1) bytes[i] = binaer.charCodeAt(i)
  return bytes
}

function verkette(...teile: Uint8Array[]): Uint8Array {
  const gesamt = teile.reduce((summe, teil) => summe + teil.length, 0)
  const alles = new Uint8Array(gesamt)
  let pos = 0
  for (const teil of teile) {
    alles.set(teil, pos)
    pos += teil.length
  }
  return alles
}

async function hmac(schluessel: Uint8Array, daten: Uint8Array): Promise<Uint8Array> {
  const k = await crypto.subtle.importKey(
    'raw',
    schluessel as BufferSource,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, daten as BufferSource))
}

/**
 * HKDF nach RFC 5869, aber nur fuer laengen bis 32 byte — mehr braucht web push
 * nicht, und so bleibt es eine extraktion und ein einziger expand-block.
 */
async function hkdf(
  salz: Uint8Array,
  ikm: Uint8Array,
  info: Uint8Array,
  laenge: number
): Promise<Uint8Array> {
  const prk = await hmac(salz, ikm)
  const block = await hmac(prk, verkette(info, Uint8Array.of(1)))
  return block.slice(0, laenge)
}

/** `label` gefolgt von einem nullbyte, so schreiben es RFC 8188 und 8291 vor */
function label(text: string): Uint8Array {
  return verkette(roh.encode(text), Uint8Array.of(0))
}

export type Wegwerfschluessel = {
  paar: CryptoKeyPair
  salz: Uint8Array
}

/**
 * Fuer die Tests: dasselbe, was `verschluessele` sonst zufaellig zieht, von
 * aussen vorgegeben. Im Betrieb wird der Parameter nie gesetzt — ein
 * wiederverwendetes Salz oder Schluesselpaar waere ein echter Bruch.
 */
export async function verschluessele(
  nachricht: string,
  abo: Pick<Abo, 'p256dh' | 'auth'>,
  fest?: Wegwerfschluessel
): Promise<Uint8Array> {
  const klartext = roh.encode(nachricht)
  if (klartext.length > MAX_NUTZLAST) {
    throw new Error(`nachricht zu lang: ${klartext.length} von ${MAX_NUTZLAST} bytes`)
  }

  const handySchluessel = b64urlZuBytes(abo.p256dh)
  const handyGeheimnis = b64urlZuBytes(abo.auth)

  const paar =
    fest?.paar ??
    ((await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, [
      'deriveBits',
    ])) as CryptoKeyPair)
  const salz = fest?.salz ?? crypto.getRandomValues(new Uint8Array(16))

  const eigenerSchluessel = new Uint8Array(await crypto.subtle.exportKey('raw', paar.publicKey))
  const handy = await crypto.subtle.importKey(
    'raw',
    handySchluessel as BufferSource,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    []
  )
  const gemeinsam = new Uint8Array(
    await crypto.subtle.deriveBits({ name: 'ECDH', public: handy }, paar.privateKey, 256)
  )

  // RFC 8291, 3.4: erst das abo-geheimnis ueber das ecdh-ergebnis, dann das
  // salz ueber das ergebnis davon. beide oeffentlichen schluessel gehen in die
  // info ein, damit ein abgefangener schluesseltausch nicht passt.
  const ikm = await hkdf(
    handyGeheimnis,
    gemeinsam,
    verkette(label('WebPush: info'), handySchluessel, eigenerSchluessel),
    32
  )
  const cek = await hkdf(salz, ikm, label('Content-Encoding: aes128gcm'), 16)
  const nonce = await hkdf(salz, ikm, label('Content-Encoding: nonce'), 12)

  const aes = await crypto.subtle.importKey('raw', cek as BufferSource, 'AES-GCM', false, [
    'encrypt',
  ])
  // 0x02 statt 0x01: das trennbyte des letzten rekords. bei uns ist der erste
  // rekord auch der letzte.
  const chiffre = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: nonce as BufferSource, tagLength: 128 },
      aes,
      verkette(klartext, Uint8Array.of(2)) as BufferSource
    )
  )

  const rs = new Uint8Array(4)
  new DataView(rs.buffer).setUint32(0, REKORD_GROESSE)
  return verkette(salz, rs, Uint8Array.of(eigenerSchluessel.length), eigenerSchluessel, chiffre)
}

async function vapidUnterschreiber(schluessel: VapidSchluessel): Promise<CryptoKey> {
  const punkt = b64urlZuBytes(schluessel.oeffentlich)
  if (punkt.length !== 65 || punkt[0] !== 4) {
    throw new Error('vapid-schluessel ist kein unkomprimierter p-256-punkt')
  }
  return crypto.subtle.importKey(
    'jwk',
    {
      kty: 'EC',
      crv: 'P-256',
      d: schluessel.privat,
      x: bytesZuB64url(punkt.slice(1, 33)),
      y: bytesZuB64url(punkt.slice(33, 65)),
      ext: false,
    },
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign']
  )
}

/** zwoelf stunden. RFC 8292 laesst hoechstens 24 zu. */
const VAPID_DAUER_S = 12 * 60 * 60

/**
 * Der `Authorization`-Kopf, mit dem sich der Absender ausweist. Ein JWT ueber
 * die Herkunft des Endpunkts, unterschrieben mit dem privaten VAPID-Schluessel;
 * der oeffentliche liegt daneben, damit der Push-Dienst pruefen kann.
 */
export async function vapidAutorisierung(
  endpoint: string,
  schluessel: VapidSchluessel,
  jetzt: number = Date.now()
): Promise<string> {
  const kopf = bytesZuB64url(roh.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })))
  const inhalt = bytesZuB64url(
    roh.encode(
      JSON.stringify({
        aud: new URL(endpoint).origin,
        exp: Math.floor(jetzt / 1000) + VAPID_DAUER_S,
        sub: schluessel.kontakt,
      })
    )
  )
  const daten = `${kopf}.${inhalt}`
  const unterschrift = new Uint8Array(
    await crypto.subtle.sign(
      { name: 'ECDSA', hash: 'SHA-256' },
      await vapidUnterschreiber(schluessel),
      roh.encode(daten)
    )
  )
  return `vapid t=${daten}.${bytesZuB64url(unterschrift)}, k=${schluessel.oeffentlich}`
}

/**
 * Eine Nachricht an ein Abo. `weg` im Ergebnis heisst: der Push-Dienst kennt
 * das Abo nicht mehr (App geloescht, Abo erneuert). Dann gehoert die Zeile
 * geloescht, sonst sammeln sich Karteileichen, an die ewig weiter gesendet wird.
 */
export async function sende(
  abo: Abo,
  nachricht: string,
  schluessel: VapidSchluessel,
  ttlSekunden = 12 * 60 * 60
): Promise<Sendeergebnis> {
  const koerper = await verschluessele(nachricht, abo)
  const antwort = await fetch(abo.endpoint, {
    method: 'POST',
    headers: {
      authorization: await vapidAutorisierung(abo.endpoint, schluessel),
      'content-encoding': 'aes128gcm',
      'content-type': 'application/octet-stream',
      ttl: String(ttlSekunden),
      urgency: 'normal',
    },
    body: koerper as BodyInit,
  })

  const weg = antwort.status === 404 || antwort.status === 410
  if (antwort.ok || weg) return { status: antwort.status, weg, fehler: null }
  return { status: antwort.status, weg: false, fehler: (await antwort.text()).slice(0, 300) }
}
