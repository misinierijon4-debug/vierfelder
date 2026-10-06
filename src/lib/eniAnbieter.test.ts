import { describe, expect, it } from 'vitest'
import { ANBIETER, findeAnbieter, mitVordenken, systemFuer, verfuegbareAnbieter } from '../../supabase/functions/_shared/eniAnbieter'

describe('anpassungen je modell', () => {
  it('haengt den zusatz nur bei mimo hinten an die systemanweisung', () => {
    const mimo = findeAnbieter('mimo-infron')!
    expect(systemFuer(mimo, 'CHARAKTER')).toMatch(/^CHARAKTER\n\nHINWEISE FÜR DIESES MODELL\n/)
    // genau die fehler aus der messung: woertliche LAGE und ein tagesstand, der nicht zurueckspringt
    expect(mimo.systemZusatz).toContain('nie wörtlich')
    expect(mimo.systemZusatz).toContain('bei 0:0')
    for (const anbieter of ANBIETER.filter((a) => a.id !== 'mimo-infron')) {
      expect(systemFuer(anbieter, 'CHARAKTER')).toBe('CHARAKTER')
    }
  })

  it('drueckt nur bei mimo die temperatur und behaelt sie in beiden denkstellungen', () => {
    const mimo = findeAnbieter('mimo-infron')!
    expect(mitVordenken(mimo, false).parameter).toEqual({ temperature: 0.3, top_p: 0.9 })
    expect(mitVordenken(mimo, true).parameter).toEqual({ temperature: 0.3, top_p: 0.9 })
    expect(ANBIETER.filter((a) => a.parameter).map((a) => a.id)).toEqual(['mimo-infron'])
  })

  it('schickt zusatz und parameter nie an den browser', () => {
    const liste = verfuegbareAnbieter(() => 'schluessel')
    expect(JSON.stringify(liste)).not.toContain('HINWEISE')
    expect(JSON.stringify(liste)).not.toContain('temperature')
  })
})
