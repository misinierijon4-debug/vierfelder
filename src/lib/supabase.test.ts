import { describe, expect, it } from 'vitest'
import { istFehlendeVonSpalte } from './supabase'

describe('supabase migrationskompatibilitaet', () => {
  it('erkennt fehlende von-spalten aus postgres und postgrest', () => {
    expect(istFehlendeVonSpalte('42703')).toBe(true)
    expect(istFehlendeVonSpalte('PGRST204')).toBe(true)
    expect(istFehlendeVonSpalte('PGRST205')).toBe(false)
    expect(istFehlendeVonSpalte()).toBe(false)
  })
})
