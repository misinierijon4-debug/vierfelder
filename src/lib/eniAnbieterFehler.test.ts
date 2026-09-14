import { describe, expect, it } from 'vitest'
import {
  anbieterFehlertext,
  findeAnbieter,
  GegenstelleFehler,
} from '../../supabase/functions/_shared/eniAnbieter'

const qwen = findeAnbieter('qwen-infron')!
describe('sichere Anbieterfehler', () => {
  it.each([
    [400, 'Anfrageformat'], [401, 'API-Key'], [402, 'Guthaben'],
    [403, 'Modellzugriff'], [404, 'Endpunkt'], [429, 'Kontingentlimit'], [503, 'HTTP 503'],
  ])('erklärt HTTP %s', (status, text) => {
    expect(anbieterFehlertext(qwen, new Error(`qwen-infron antwortet ${status}`))).toContain(text)
  })
  it('erkennt Fehlercodes in einer JSON-Antwort', () => {
    expect(anbieterFehlertext(qwen, new Error('qwen-infron meldet fehler 429'))).toContain('Kontingentlimit')
  })
  it('gibt fremde Fehlermeldungen und angehängte Secrets niemals weiter', () => {
    for (const text of ['secret-key', 'qwen-infron antwortet 401 secret-key', 'ling antwortet 401']) {
      expect(anbieterFehlertext(qwen, new Error(text))).toBe('ENI hat nicht geantwortet. versuch es gleich noch einmal.')
    }
  })
  it('erklärt eine Zeitüberschreitung ohne den Fehlertext offenzulegen', () => {
    expect(anbieterFehlertext(qwen, new DOMException('secret-key', 'TimeoutError'))).toContain('braucht zu lange')
  })
})

describe('gemeldete Fehler tragen den Grund bis in die App', () => {
  it('macht aus einem Status der Gegenstelle einen Satz, der sagt, was zu tun ist', () => {
    expect(anbieterFehlertext(qwen, new GegenstelleFehler('qwen-infron', 402))).toContain(
      'Guthaben'
    )
    expect(anbieterFehlertext(qwen, new GegenstelleFehler('qwen-infron', 404))).toContain(
      'findet das Modell'
    )
  })
  it.each([
    ['gedacht' as const, 'nur nachgedacht'],
    ['leer' as const, 'leer geantwortet'],
    ['strom' as const, 'mittendrin abgebrochen'],
    ['fehler' as const, 'ohne Status'],
  ])('erklärt %s, statt alles zu Schweigen zu machen', (art, text) => {
    expect(anbieterFehlertext(qwen, new GegenstelleFehler('qwen-infron', 0, art))).toContain(text)
  })
  it('trennt eine fehlende Leitung von einem schweigenden Modell', () => {
    expect(anbieterFehlertext(qwen, new TypeError('error sending request'))).toContain(
      'Verbindung zu Infron'
    )
  })
  it('glaubt nur der Meldung des eigenen Anbieters', () => {
    for (const fremd of [
      new GegenstelleFehler('ling', 402),
      Object.assign(new Error('secret-key'), { anbieterId: 'ling', status: 401 }),
    ]) {
      expect(anbieterFehlertext(qwen, fremd)).toBe(
        'ENI hat nicht geantwortet. versuch es gleich noch einmal.'
      )
    }
  })
})
