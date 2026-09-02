import { describe, expect, it } from 'vitest'
import { deuteProbe, geraetName } from './push'

describe('geraetname', () => {
  it('erkennt die geräte, die hier vorkommen', () => {
    expect(geraetName('Mozilla/5.0 (iPhone; CPU iPhone OS 18_2 like Mac OS X) Safari')).toBe(
      'iphone'
    )
    expect(geraetName('Mozilla/5.0 (iPad; CPU OS 18_2 like Mac OS X) Safari')).toBe('ipad')
    expect(geraetName('Mozilla/5.0 (Linux; Android 15; Pixel 9) Chrome')).toBe('android')
    expect(geraetName('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari')).toBe('mac')
    expect(geraetName('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome')).toBe('windows')
  })

  it('nennt unbekanntes gerät, statt zu raten', () => {
    expect(geraetName('irgendein browser')).toBe('gerät')
  })

  /**
   * das ipad meldet sich seit ipados 13 als macintosh. hier ist das kein
   * problem — der name ist nur eine beschriftung —, aber es ist der grund,
   * warum `istApple` nicht dieselbe pruefung benutzt.
   */
  it('hält ipad vor macintosh, weil ipados beides schreibt', () => {
    expect(geraetName('Mozilla/5.0 (iPad; CPU OS 18_2 like Mac OS X) AppleWebKit Macintosh')).toBe(
      'ipad'
    )
  })
})

describe('antwort der probe deuten', () => {
  it('nimmt die zahlen aus einer guten antwort', () => {
    expect(deuteProbe(200, JSON.stringify({ gesendet: 2, entfernt: 1 }))).toEqual({
      gesendet: 2,
      entfernt: 1,
    })
  })

  it('nimmt die meldung des servers, nicht den status', () => {
    expect(() => deuteProbe(404, JSON.stringify({ error: 'kein gerät angemeldet' }))).toThrow(
      'kein gerät angemeldet'
    )
  })

  it('nennt den status, wenn das json keine meldung hat', () => {
    expect(() => deuteProbe(500, '{}')).toThrow('server antwortet 500')
  })

  /**
   * der fall, der diese funktion erzwungen hat: irgendetwas zwischen app und
   * function antwortet mit einer fehlerseite. "Unexpected token '<'" nennt die
   * sprache, in der der fehler geschrieben ist — nicht den fehler.
   */
  it('zeigt eine fremde fehlerseite, statt an ihr zu zerbrechen', () => {
    const seite = '<html> <head><title>502</title></head>\n<body>oops</body>'
    expect(() => deuteProbe(502, seite)).toThrow(
      'server antwortet 502, aber kein json: <html> <head><title>502</title></head> <body>oops</body>'
    )
  })

  it('sagt es, wenn gar nichts kam', () => {
    expect(() => deuteProbe(204, '   ')).toThrow('kein json: leere antwort')
  })

  it('kürzt eine lange fremde antwort', () => {
    expect(() => deuteProbe(500, `<html>${'x'.repeat(400)}`)).toThrow('…')
  })
})
