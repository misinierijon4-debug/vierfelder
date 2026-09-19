import { describe, expect, it } from 'vitest'
import { BADGE_KURZ, BADGE_LANG, heuristischesBadge } from './duellBadge'

describe('heuristischesBadge', () => {
  it('liest denselben druck für beide seiten umgekehrt', () => {
    // `DruckStatus` steht immer aus meiner sicht: führe ich die woche, ist sein
    // eintrag eine aufholjagd und meiner ein ausbau.
    expect(heuristischesBadge('wocheFuehrung', true)).toBe('fuehrungsausbau')
    expect(heuristischesBadge('wocheFuehrung', false)).toBe('aufholjagd')
    expect(heuristischesBadge('abstandGross', true)).toBe('konter')
    expect(heuristischesBadge('abstandGross', false)).toBe('fuehrungsausbau')
  })

  it('macht aus höchstem druck einen kraftakt', () => {
    expect(heuristischesBadge('matchball', true)).toBe('kraftakt')
    expect(heuristischesBadge('zugzwang', true)).toBe('kraftakt')
  })

  it('bleibt ohne lage bei routine', () => {
    expect(heuristischesBadge('offen', true)).toBe('routine')
    expect(heuristischesBadge('entschieden', false)).toBe('routine')
  })
})

describe('Badge-Worte', () => {
  it('haelt kurz- und langform fuer jedes label bereit', () => {
    for (const badge of Object.keys(BADGE_KURZ) as (keyof typeof BADGE_KURZ)[]) {
      expect(BADGE_KURZ[badge]).toBeTruthy()
      // das kurze wort steht im ticker, das lange erklaert es im tooltip
      expect(BADGE_LANG[badge]).toContain(BADGE_KURZ[badge])
    }
  })

  it('fuehrt keine emojis', () => {
    const alle = [...Object.values(BADGE_KURZ), ...Object.values(BADGE_LANG)].join(' ')
    expect(alle).not.toMatch(/\p{Extended_Pictographic}/u)
  })
})
