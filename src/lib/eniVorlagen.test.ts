import { describe, expect, it } from 'vitest'
import {
  WOCHENBERICHT_VORLAGE,
  istWochenberichtVorlage,
} from '../../supabase/functions/_shared/eniVorlagen'

describe('die wochenvorlage', () => {
  it('schreibt den namen in versalien, wie ENI selbst', () => {
    expect(WOCHENBERICHT_VORLAGE).toBe('Willst du, dass ENI deine Woche zusammenfasst?')
  })

  it('erkennt den alten wortlaut weiter', () => {
    // sonst stuenden in einem chat von vor dem wechsel zwei vorlagen: die alte
    // wird nicht mehr erkannt, also legt die function eine zweite daneben.
    expect(istWochenberichtVorlage('Willst du, dass Eni deine Woche zusammenfasst?')).toBe(true)
    expect(istWochenberichtVorlage(WOCHENBERICHT_VORLAGE)).toBe(true)
  })

  it('haelt eine beliebige zeile nicht fuer die vorlage', () => {
    expect(istWochenberichtVorlage('fass meine woche zusammen')).toBe(false)
    expect(istWochenberichtVorlage('')).toBe(false)
  })
})
