import { describe, expect, it } from 'vitest'
import { stamm, stammwoerter } from '../../supabase/functions/_shared/eniWorte'

describe('Stammwörter', () => {
  it('kürzt auf fünf Buchstaben und lässt Kürzeres stehen', () => {
    expect(stamm('rezepte')).toBe('rezep')
    expect(stamm('leber')).toBe('leber')
    expect(stamm('ei')).toBe('ei')
  })

  it('führt Einzahl, Mehrzahl und Beugung zusammen', () => {
    expect(stammwoerter('Rezept')).toEqual(stammwoerter('Rezepte'))
    expect(stammwoerter('Ernährung')).toEqual(stammwoerter('ernähren'))
  })

  it('lässt kurze und ausgeschlossene Wörter weg', () => {
    expect([...stammwoerter('Der Weg ist das Ziel', 4)]).toEqual(['ziel'])
    expect([...stammwoerter('Werk Eins', 4, new Set(['werk']))]).toEqual(['eins'])
  })
})
