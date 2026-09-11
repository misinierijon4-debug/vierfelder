import { describe, expect, it } from 'vitest'
import { ERSTER_SATZ, eniAntwort } from './eni'

describe('enis urteil', () => {
  it('nennt die eigene herkunft, statt eine modellverbindung vorzutaeuschen', () => {
    const antwort = eniAntwort('bist du echt eine ki?', 0)
    expect(antwort).toContain('Stimmenprobe')
    expect(antwort).toContain('kein Modell im Netz')
  })

  it('nimmt den aufschub nicht an', () => {
    for (const satz of ['ich mache das morgen', 'heute keine zeit', 'bin zu müde']) {
      expect(eniAntwort(satz, 0)).toContain('Aufschub')
    }
  })

  it('behauptet ohne modellverbindung keine zahl, sondern verweist ans raster', () => {
    const antwort = eniAntwort('wer führt gerade?', 0)
    expect(antwort).toContain('Raster')
    expect(antwort).toContain('sehe die Zahlen in dieser Fassung nicht')
  })

  it('gibt in der lokalen Stimmenprobe keine pauschalen Ernährungsempfehlungen', () => {
    const antwort = eniAntwort('was soll ich heute essen', 0)
    expect(antwort).toContain('nicht individuell beurteilen')
    expect(antwort).not.toContain('Rohe Leber')
  })

  it('feiert einen einzelnen tag nicht als woche', () => {
    expect(eniAntwort('lernen ist erledigt', 0)).toContain('sieben Tage')
  })

  it('rotiert die nachfragen, wenn keine regel greift, und bleibt dabei berechenbar', () => {
    const ohneTreffer = 'blaugrün quadrat'
    const erste = eniAntwort(ohneTreffer, 0)
    const zweite = eniAntwort(ohneTreffer, 1)
    expect(erste).not.toBe(zweite)
    expect(eniAntwort(ohneTreffer, 3)).toBe(erste)
    expect(eniAntwort(ohneTreffer, 0)).toBe(erste)
  })

  it('antwortet auch auf eine leere vorlage, ohne zu raten', () => {
    expect(eniAntwort('   ', 2)).toContain('Nenn den Bereich')
  })
})

describe('enis schreibweise', () => {
  it('schreibt in normaler gross- und kleinschreibung, nur der name steht in versalien', () => {
    const saetze = [ERSTER_SATZ, eniAntwort('was soll ich heute essen', 0), eniAntwort('xyz', 0)]
    for (const satz of saetze) {
      // ein satzanfang gross und irgendwo ein grossbuchstabe im satzinneren:
      // durchgehende kleinschreibung faellt damit auf, versalien allein nicht
      expect(satz[0]).toBe(satz[0]!.toUpperCase())
      expect(satz.replace('ENI', '')).toMatch(/\s[A-ZÄÖÜ]/)
    }
  })
})

describe('der erste satz', () => {
  it('stellt ENI als schiedsrichter vor, ohne hilfe anzubieten', () => {
    expect(ERSTER_SATZ).toContain('Ich bin ENI')
    expect(ERSTER_SATZ).toContain('nach Punkten, nicht nach Sympathie')
    expect(ERSTER_SATZ.toLowerCase()).not.toContain('helfen')
  })
})
