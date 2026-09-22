import { describe, expect, it } from 'vitest'
import { gezeigteVorschlaege } from './ansageSprueche'
import type { AnsageVorschlag } from './ansagen'

const vorschlag = (feld: AnsageVorschlag['feld'], ziel = 2): AnsageVorschlag => ({
  an: 'koray',
  feld,
  ziel,
  ab: '2026-09-22',
  bis: '2026-09-26',
  verlauf: [1, 0, 1, 1],
})

describe('gezeigteVorschlaege', () => {
  const alle = [vorschlag('gym', 3), vorschlag('boxen'), vorschlag('lesen'), vorschlag('gewicht')]

  it('zeigt ENIs auswahl in ENIs reihenfolge, mit den zahlen der app', () => {
    const liste = gezeigteVorschlaege(
      alle,
      [
        { feld: 'lesen', spruch: 'koray und bücher, eine fernbeziehung.' },
        { feld: 'gym', spruch: 'koray kennt das gym vom hörensagen.' },
      ],
      'koray'
    )
    expect(liste.map((v) => [v.feld, v.ziel, v.vonEni])).toEqual([
      ['lesen', 2, true],
      ['gym', 3, true],
    ])
  })

  it('fällt ohne ENI auf die ersten drei mit vorlage zurück', () => {
    const liste = gezeigteVorschlaege(alle, null, 'koray')
    expect(liste.map((v) => v.feld)).toEqual(['gym', 'boxen', 'lesen'])
    expect(liste.every((v) => !v.vonEni && v.spruch.includes('koray'))).toBe(true)
  })

  it('übernimmt nichts, was die app nicht vorgeschlagen hat', () => {
    const liste = gezeigteVorschlaege([vorschlag('boxen')], [{ feld: 'gym', spruch: 'gym!' }], 'koray')
    expect(liste.map((v) => [v.feld, v.vonEni])).toEqual([['boxen', false]])
  })
})
