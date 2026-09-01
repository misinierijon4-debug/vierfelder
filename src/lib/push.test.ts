import { describe, expect, it } from 'vitest'
import { geraetName } from './push'

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
