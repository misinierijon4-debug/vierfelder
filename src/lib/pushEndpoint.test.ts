import { describe, expect, it } from 'vitest'
import {
  MAX_PUSH_ENDPOINT_ZEICHEN,
  PUSH_ENDPOINT_FEHLER,
  pushDienst,
} from '../../supabase/functions/_shared/pushEndpoint'

describe('push-endpunkt als netzwerkgrenze', () => {
  it.each([
    ['https://web.push.apple.com/QH/eins?x=1', 'apple'],
    ['https://web.push.apple.com:443/QH/eins', 'apple'],
    ['https://fcm.googleapis.com/fcm/send/eins', 'google'],
    ['https://updates.push.services.mozilla.com/wpush/v2/eins', 'mozilla'],
    ['https://wns2-db5p.notify.windows.com/w/?token=eins', 'microsoft'],
    ['https://notify.windows.com/w/eins', 'microsoft'],
  ] as const)('erlaubt %s als %s', (endpoint, dienst) => {
    expect(pushDienst(endpoint)).toBe(dienst)
  })

  it.each([
    'http://web.push.apple.com/eins',
    'https://push.apple.com/eins',
    'https://web.push.apple.com.evil.example/eins',
    'https://evilpush.apple.com/eins',
    'https://fcm.googleapis.com.evil.example/eins',
    'https://fcm.googleapis.com@127.0.0.1/eins',
    'https://127.0.0.1/eins?host=fcm.googleapis.com',
    'https://user:pass@fcm.googleapis.com/eins',
    'https://fcm.googleapis.com:444/eins',
    'https://fcm.googleapis.com/eins#fragment',
    'https://fcm.googleapis.com./eins',
    'https://127.0.0.1/eins',
    'https://[::1]/eins',
    'https://169.254.169.254/latest/meta-data',
    'https://10.0.0.1/eins',
    'https://localhost/eins',
    ' https://fcm.googleapis.com/eins',
    'https://fcm.googleapis.com/eins ',
    'kein url',
    '',
  ])('lehnt %j ab', (endpoint) => {
    expect(() => pushDienst(endpoint)).toThrow(PUSH_ENDPOINT_FEHLER)
  })

  it('begrenzt die persistierbare adresse', () => {
    expect(() =>
      pushDienst(`https://fcm.googleapis.com/${'x'.repeat(MAX_PUSH_ENDPOINT_ZEICHEN)}`)
    ).toThrow(PUSH_ENDPOINT_FEHLER)
  })
})
