import { describe, expect, it } from 'vitest'
import { liesMerkEntwurf, willMerken } from '../../supabase/functions/_shared/eniMerken'

describe('ausdruecklich im chat merken', () => {
  it.each([
    'Merk dir bitte, dass ich vor dem Schlafen lese.',
    'Bitte merke dir: Ich esse gerne Reis.', 'ENI, merk dir das.',
    'Amy, kannst du dir bitte merken, dass ich gerne lese?',
    'Speichere das bitte als Erinnerung: Ich mag Reis.',
  ])('erkennt den auftrag %s', (text) => expect(willMerken(text)).toBe(true))
  it.each([
    'Ich lese vor dem Schlafen.', 'Merk dir nicht meine Adresse.',
    'Bitte merke dir bitte nichts.', 'Was passiert, wenn ich „merk dir das“ sage?',
    '„Merk dir, dass ich Reis mag“', 'Er sagte: Merk dir das.',
    'Vergiss bitte diese Erinnerung.',
  ])('speichert nicht bei %s', (text) => expect(willMerken(text)).toBe(false))
  it('liest nur begrenzte textdaten, nie nutzer oder freigaben vom modell', () => {
    expect(liesMerkEntwurf('```json\n{"text":" Ich mag Reis. ","art":"profil","user_id":"fremd","gemeinsam":true}\n```'))
      .toEqual({ text: 'Ich mag Reis.', art: 'profil' })
    expect(liesMerkEntwurf('{"text":null}')).toBeNull()
    for (const roh of ['{}', '{"text":"","art":"profil"}', '{"text":"Hallo","art":"aufgabe"}',
      JSON.stringify({ text: 'a'.repeat(601), art: 'profil' }), 'kein JSON']) {
      expect(() => liesMerkEntwurf(roh)).toThrow()
    }
  })
})
