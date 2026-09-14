import { describe, expect, it } from 'vitest'
import { anbieterFehlertext, findeAnbieter } from '../../supabase/functions/_shared/eniAnbieter'

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
