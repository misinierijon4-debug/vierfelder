/**
 * Erzeugt das VAPID-Schluesselpaar fuer Web Push.
 *
 *   node scripts/vapid.mjs
 *
 * Das Paar wird genau einmal erzeugt und danach nie wieder angefasst: der
 * oeffentliche Schluessel steckt in jedem Abo, das ein Handy anlegt. Ein neues
 * Paar macht alle bestehenden Abos ungueltig, und jedes Geraet muesste die
 * Benachrichtigungen von Hand neu einschalten.
 *
 * Der oeffentliche Teil geht in den Build (`VITE_VAPID_PUBLIC_KEY`), der
 * private bleibt Geheimnis der Edge Function. Wohin genau, steht in
 * BENACHRICHTIGUNGEN.md.
 *
 * Kein `web-push`, keine Abhaengigkeit: P-256 kann Node selbst, und die
 * Umrechnung ins Format der Push-Dienste sind vier Zeilen.
 */
import { webcrypto } from 'node:crypto'

const paar = await webcrypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
  'sign',
  'verify',
])

// oeffentlich: der unkomprimierte punkt, 65 byte, beginnend mit 0x04.
const oeffentlich = Buffer.from(
  await webcrypto.subtle.exportKey('raw', paar.publicKey)
).toString('base64url')
// privat: der skalar d aus dem jwk, 32 byte.
const { d } = await webcrypto.subtle.exportKey('jwk', paar.privateKey)

console.log('VAPID_PUBLIC_KEY  =', oeffentlich)
console.log('VAPID_PRIVATE_KEY =', d)
console.log()
console.log('den öffentlichen als repository-variable VITE_VAPID_PUBLIC_KEY setzen,')
console.log('beide zusammen mit VAPID_KONTAKT als secrets der edge function.')
