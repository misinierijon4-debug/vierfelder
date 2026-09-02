import { describe, expect, it } from 'vitest'
import { bauKurz } from './dates'

describe('bauzeit', () => {
  it('zeigt tag und minute in lokaler zeit', () => {
    // die tests laufen in Europe/Berlin, im september also UTC+2
    expect(bauKurz('2026-09-02T09:22:14.000Z')).toBe('02.09. 11:22')
  })

  it('füllt einstellige zahlen auf', () => {
    expect(bauKurz('2026-01-05T05:07:00.000Z')).toBe('05.01. 06:07')
  })

  /**
   * `__BAUZEIT__` kommt aus der vite-konfiguration. faellt das define je weg,
   * soll in der fusszeile nichts stehen statt "Invalid Date".
   */
  it('bleibt leer, wenn nichts brauchbares ankommt', () => {
    expect(bauKurz('')).toBe('')
    expect(bauKurz('irgendwas')).toBe('')
  })
})
