import { describe, expect, it } from 'vitest'
import { bauKurz, standZeit } from './dates'

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

describe('standZeit', () => {
  // die tests laufen in Europe/Berlin, im september also UTC+2
  const jetzt = new Date('2026-09-07T16:23:00.000Z')

  it('nennt am selben tag nur die uhrzeit', () => {
    expect(standZeit('2026-09-07T10:05:00.000Z', jetzt)).toBe('heute 12:05')
  })

  it('nennt den vortag beim namen', () => {
    expect(standZeit('2026-09-06T20:40:00.000Z', jetzt)).toBe('gestern 22:40')
  })

  it('nennt bei aelteren staenden das ganze datum', () => {
    expect(standZeit('2026-09-04T06:00:00.000Z', jetzt)).toBe('freitag, 4. september, 08:00')
  })

  it('bleibt leer, wenn nichts brauchbares ankommt', () => {
    expect(standZeit('irgendwas', jetzt)).toBe('')
  })
})
