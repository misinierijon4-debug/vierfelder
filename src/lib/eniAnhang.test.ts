import { describe, expect, it } from 'vitest'
import {
  anhangPfad,
  erkenneArt,
  kuerzeText,
  lesbareGroesse,
  MAX_BILD_KANTE,
  zielmasse,
} from './eniAnhang'

describe('was ENI angehängt bekommen kann', () => {
  it('nimmt bilder an den typen, die deepseek liest', () => {
    expect(erkenneArt('image/jpeg', 'foto.jpg')).toBe('bild')
    expect(erkenneArt('image/png', 'raster.png')).toBe('bild')
    expect(erkenneArt('image/webp', 'x.webp')).toBe('bild')
  })

  it('nimmt text an seinem typ', () => {
    expect(erkenneArt('text/plain', 'notiz.txt')).toBe('text')
    expect(erkenneArt('text/markdown; charset=utf-8', 'plan.md')).toBe('text')
    expect(erkenneArt('application/json', 'daten.json')).toBe('text')
  })

  it('rettet die datei über die endung, wenn das telefon keinen typ meldet', () => {
    // android meldet fuer .md und .ts gern application/octet-stream
    expect(erkenneArt('application/octet-stream', 'plan.md')).toBe('text')
    expect(erkenneArt('', 'auswertung.csv')).toBe('text')
    expect(erkenneArt('', 'foto.HEIC')).toBe('bild')
  })

  it('lehnt ab, was ENI nicht lesen kann', () => {
    expect(erkenneArt('application/pdf', 'zeugnis.pdf')).toBeNull()
    expect(erkenneArt('application/zip', 'alles.zip')).toBeNull()
    expect(erkenneArt('video/mp4', 'runde.mp4')).toBeNull()
  })
})

describe('die maße eines hochgeladenen bildes', () => {
  it('bringt ein großes foto auf die längste kante', () => {
    expect(zielmasse(4032, 3024)).toEqual({ breite: MAX_BILD_KANTE, hoehe: 960 })
    expect(zielmasse(1080, 2400)).toEqual({ breite: 576, hoehe: MAX_BILD_KANTE })
  })

  it('lässt ein kleines bild in ruhe, statt es aufzublasen', () => {
    expect(zielmasse(320, 240)).toEqual({ breite: 320, hoehe: 240 })
  })

  it('bleibt bei einem streifen mindestens ein pixel breit', () => {
    expect(zielmasse(4000, 2).hoehe).toBe(1)
  })
})

describe('der text einer angehängten datei', () => {
  it('bleibt ganz, solange er unter der grenze ist', () => {
    expect(kuerzeText('kurz und gut', 100)).toEqual({ inhalt: 'kurz und gut', gekuerzt: false })
  })

  it('vereinheitlicht zeilenenden', () => {
    expect(kuerzeText('a\r\nb\rc', 100).inhalt).toBe('a\nb\nc')
  })

  it('schreibt den schnitt hin, statt ihn zu verschweigen', () => {
    const ergebnis = kuerzeText('a'.repeat(50), 10)
    expect(ergebnis.gekuerzt).toBe(true)
    expect(ergebnis.inhalt.startsWith('aaaaaaaaaa')).toBe(true)
    expect(ergebnis.inhalt).toContain('zu ende für ENI')
  })
})

describe('der pfad im bucket', () => {
  it('fängt mit dem konto an, damit die policy greift, und endet auf jpg', () => {
    const pfad = anhangPfad('konto-1', 'chat-9')
    expect(pfad.startsWith('konto-1/chat-9/')).toBe(true)
    expect(pfad.endsWith('.jpg')).toBe(true)
  })

  it('vergibt für dasselbe bild nie denselben namen', () => {
    expect(anhangPfad('k', 'c')).not.toBe(anhangPfad('k', 'c'))
  })
})

describe('die größe unter dem dateinamen', () => {
  it('bleibt lesbar über alle größenordnungen', () => {
    expect(lesbareGroesse(512)).toBe('512 B')
    expect(lesbareGroesse(2048)).toBe('2 KB')
    expect(lesbareGroesse(3 * 1024 * 1024)).toBe('3.0 MB')
  })
})
