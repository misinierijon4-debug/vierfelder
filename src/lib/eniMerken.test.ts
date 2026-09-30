import { describe, expect, it } from 'vitest'
import { liesMerkEntwurf, liesMerkAenderung, merkBezug, merkNachrichten, willMerken } from '../../supabase/functions/_shared/eniMerken'

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

describe('natuerliche Formulierungen und enger Chatbezug', () => {
  it.each([
    'Ich stehe manchmal samstags um 5 Uhr auf. Kannst du dir das merken',
    'Ich lese gerne abends, kannst du dir das bitte merken?',
    'Bitte behalte das im Kopf: Ich esse gerne Reis.',
    'Das bitte speichern.', 'Das solltest du dir merken.',
    'Könntest du dir das bitte merken?',
  ])('erkennt %s', text => expect(willMerken(text)).toBe(true))
  it.each([
    'Wenn ich dich bitte, merk dir das.', 'Er sagt merk dir das.',
    'Du sollst dir das nicht merken.',
    'Ich frage nur als Beispiel: merk dir das.',
  ])('veraendert nichts bei %s', text => {
    expect(willMerken(text)).toBe(false)
  })
  const verlauf = [
    { id: 'alt', rolle: 'mensch' as const, text: 'Ich lerne eine halbe Stunde.' },
    { id: 'arbeit', rolle: 'mensch' as const, text: 'Ich stehe manchmal um 5 Uhr für die Arbeit auf.' },
    { id: 'auftrag', rolle: 'mensch' as const, text: 'Merk dir das' },
    { id: 'best', rolle: 'eni' as const, text: 'Gemerkt: Ich stehe um 5 Uhr auf.' },
  ]
  it('ordnet kurze Korrekturen nur einer gerade bestaetigten Erinnerung zu', () => {
    expect(merkBezug('Nein ohne das Lernen', verlauf)).toEqual({ id: 'auftrag', loeschen: false })
    expect(merkBezug('Vergiss das bitte', verlauf)).toEqual({ id: 'auftrag', loeschen: true })
    expect(merkBezug('Nein ohne das Lernen', [...verlauf, { id: 'e2', rolle: 'eni', text: 'Welches Buch magst du?' }])).toBeNull()
    expect(merkBezug('Wenn ich nein sage, ändere die Erinnerung', verlauf)).toBeNull()
  })
  it('ueberspringt den reinen Merkauftrag beim erneuten Bezug', () => {
    expect(merkNachrichten('Merk dir das', verlauf).map(z => z.text)).toEqual([verlauf[1]!.text, 'Merk dir das'])
  })
  it('akzeptiert keine unaufgeforderte Loeschung und keine Modell-IDs', () => {
    expect(() => liesMerkAenderung('{"aktion":"loeschen"}', false)).toThrow()
    expect(liesMerkAenderung('{"aktion":"loeschen"}', true)).toBe('loeschen')
    expect(liesMerkAenderung('{"aktion":"aendern","text":"Ich mag Reis.","art":"profil","id":"fremd"}', false))
      .toEqual({ text: 'Ich mag Reis.', art: 'profil' })
  })
})

it('schickt bei neuen eigenen Angaben keine alten Themen an die Zusammenfassung', () => {
  expect(merkNachrichten('Ich muss in den Ferien um 5 Uhr aufstehen. Kannst du dir das merken?', [
    { id: 'lernen', rolle: 'mensch', text: 'Ich lerne eine halbe Stunde.' },
  ]).map(z => z.text)).toEqual(['Ich muss in den Ferien um 5 Uhr aufstehen. Kannst du dir das merken?'])
})
