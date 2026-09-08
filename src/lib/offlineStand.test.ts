/** @vitest-environment jsdom */

import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Anfangszustand } from './backend'
import { leseStand, merkeStand, vergissStand } from './offlineStand'

afterEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
})

const ANFANG: Anfangszustand = {
  me: 'erijon',
  einheiten: {},
  gewichte: {},
  gewichtQuellen: {},
  schlaf: [],
  aufenthalte: [],
  wetten: {},
  wettenMeta: {},
  abrechnungen: [],
  noten: { faecher: [], noten: [] },
  einheitVonVerfuegbar: true,
  altbestand: false,
}

describe('offlineStand', () => {
  it('gibt den gemerkten Stand mit seinem Zeitpunkt zurueck', () => {
    merkeStand('supabase:a', ANFANG, new Date('2026-09-07T16:23:00.000Z'))

    expect(leseStand('supabase:a')).toEqual({
      gespeichertAm: '2026-09-07T16:23:00.000Z',
      anfang: ANFANG,
    })
  })

  it('trennt die Staende zweier Konten', () => {
    merkeStand('supabase:a', ANFANG)
    merkeStand('supabase:b', { ...ANFANG, me: 'koray' })

    expect(leseStand('supabase:a')?.anfang.me).toBe('erijon')
    expect(leseStand('supabase:b')?.anfang.me).toBe('koray')
  })

  it('meldet nichts und raeumt auf, wenn der Inhalt beschaedigt ist', () => {
    localStorage.setItem('zweikampf:offline-stand:supabase:a', '{kaputt')

    expect(leseStand('supabase:a')).toBeNull()
    expect(localStorage.getItem('zweikampf:offline-stand:supabase:a')).toBeNull()
  })

  it('meldet nichts, wenn dem Stand ein Feld fehlt', () => {
    const { schlaf: _schlaf, ...ohneSchlaf } = ANFANG
    localStorage.setItem(
      'zweikampf:offline-stand:supabase:a',
      JSON.stringify({ gespeichertAm: '2026-09-07T16:23:00.000Z', anfang: ohneSchlaf })
    )

    expect(leseStand('supabase:a')).toBeNull()
  })

  it('haelt still, wenn das Kontingent voll ist, und laesst nichts Halbes stehen', () => {
    merkeStand('supabase:a', ANFANG)
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError')
    })

    expect(() => merkeStand('supabase:a', ANFANG)).not.toThrow()
    expect(leseStand('supabase:a')).toBeNull()
  })

  it('vergisst einen Stand auf Verlangen', () => {
    merkeStand('supabase:a', ANFANG)
    vergissStand('supabase:a')

    expect(leseStand('supabase:a')).toBeNull()
  })
})
