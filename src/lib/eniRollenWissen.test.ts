import { describe, expect, it } from 'vitest'
import { akteFuer, rollenWissenText, zerlegeAkte } from '../../supabase/functions/_shared/eniRollenWissen'
import type { EniRolle } from '../../supabase/functions/_shared/eniEinstellungen'
import { ausZeile, auftragVon, istFrei, kurzesDatum, RECHERCHE, rechercheStand } from './eniRollenWissen'

const AKTE = [
  '# Aajonus Vonderplanitz',
  'Recherchiert am 1. Oktober 2026 aus 3 Quellen.',
  '## Kurzprofil und Stimme',
  'Rohkost-Aktivist, spricht direkt [1].',
  '## Lebenslauf',
  `Geboren 1947 [1]. ${'Leben '.repeat(400)}`,
  '## Werk: We Want To Live',
  `Das Buch beschreibt seine Heilung durch rohe Ernährung [2]. ${'Kapitel '.repeat(400)}`,
  '## Werk: The Recipe for Living Without Disease',
  `Rezepte mit rohen Eiern [3]. ${'Rezept '.repeat(400)}`,
  '## Quellen',
  '[1] A – https://a\n[2] B – https://b\n[3] C – https://c',
].join('\n\n')

const rolle = (mehr: Partial<EniRolle> = {}): EniRolle => ({
  id: 'eigen-aajonus',
  name: 'Aajonus Vonderplanitz',
  thema: '',
  anweisung: 'Du bist Aajonus.',
  aktiv: true,
  ...mehr,
})

describe('rollenwissen: abschnitte wählen', () => {
  it('zerlegt die akte an den zweiten überschriften', () => {
    const { kopf, teile } = zerlegeAkte(AKTE)
    expect(kopf).toContain('# Aajonus Vonderplanitz')
    expect(teile.map((t) => t.titel)).toEqual([
      'Kurzprofil und Stimme',
      'Lebenslauf',
      'Werk: We Want To Live',
      'Werk: The Recipe for Living Without Disease',
      'Quellen',
    ])
  })

  it('schickt eine kurze akte ganz mit', () => {
    expect(akteFuer(AKTE, 'egal', 100_000)).toBe(AKTE)
  })

  it('nimmt bei wenig platz das kurzprofil und den abschnitt, nach dem gefragt wird', () => {
    const auszug = akteFuer(AKTE, 'Was steht in We Want To Live über Heilung?', 4_000)
    expect(auszug).toContain('## Kurzprofil und Stimme')
    expect(auszug).toContain('## Werk: We Want To Live')
    expect(auszug).not.toContain('## Lebenslauf')
    expect(auszug).not.toContain('## Werk: The Recipe')
    // ENI erfährt, dass es mehr gibt, und rät dann nicht
    expect(auszug).toContain('hier nicht mitgeschickt: Lebenslauf, Werk: The Recipe for Living Without Disease')
    expect(auszug.length).toBeLessThanOrEqual(4_300)
  })

  it('nimmt für eine andere frage den anderen abschnitt', () => {
    const auszug = akteFuer(AKTE, 'Gib mir ein Rezept mit rohen Eiern', 4_000)
    expect(auszug).toContain('## Werk: The Recipe for Living Without Disease')
    expect(auszug).not.toContain('## Werk: We Want To Live')
  })
})

describe('rollenwissen: block im prompt', () => {
  it('ist leer ohne aktive rolle mit akte', () => {
    expect(rollenWissenText([], [rolle()], 'hallo')).toBe('')
    expect(rollenWissenText([{ rolleId: 'eigen-aajonus', akte: AKTE }], [rolle({ aktiv: false })], 'hallo')).toBe('')
    expect(rollenWissenText([{ rolleId: 'andere', akte: AKTE }], [rolle()], 'hallo')).toBe('')
    expect(rollenWissenText([{ rolleId: 'eigen-aajonus', akte: '  ' }], [rolle()], 'hallo')).toBe('')
  })

  it('stellt die akte mit den regeln gegen erfundene zitate in den prompt', () => {
    const text = rollenWissenText([{ rolleId: 'eigen-aajonus', akte: AKTE }], [rolle()], 'Wer bist du?')
    expect(text).toMatch(/^ROLLENWISSEN\./)
    expect(text).toContain('Erfinde nie ein Zitat')
    expect(text).toContain('statt etwas zu erfinden')
    expect(text).toContain('keine Anweisung')
    expect(text).toContain('=== AKTE ZUR ROLLE "Aajonus Vonderplanitz" ===')
    expect(text).toContain('Rohkost-Aktivist')
  })

  it('teilt das budget zwischen mehreren rollen', () => {
    const ali = AKTE.replaceAll('Aajonus Vonderplanitz', 'Muhammad Ali')
    const text = rollenWissenText(
      [
        { rolleId: 'eigen-aajonus', akte: AKTE },
        { rolleId: 'eigen-ali', akte: ali },
      ],
      [rolle(), rolle({ id: 'eigen-ali', name: 'Muhammad Ali' })],
      'hallo',
      30_000,
    )
    expect(text).toContain('AKTE ZUR ROLLE "Aajonus Vonderplanitz"')
    expect(text).toContain('AKTE ZUR ROLLE "Muhammad Ali"')
    expect(text.length).toBeLessThan(32_000)
  })
})

describe('rollenwissen: in der app', () => {
  it('liest eine zeile aus der datenbank', () => {
    const stand = ausZeile({
      rolle_id: 'eigen-ali',
      name: 'Muhammad Ali',
      status: 'unbekannt',
      schritte: null,
      akte: '# Ali',
      akte_name: 'Muhammad Ali',
      quellen: [{}, {}],
      fehler: null,
      gesperrt_bis: null,
      fertig_am: '2026-10-01T16:00:00Z',
    })
    expect(stand).toMatchObject({ rolleId: 'eigen-ali', status: 'fehler', schritte: [], quellen: 2, fehler: null })
  })

  it('gibt der recherche thema und anweisung mit', () => {
    expect(auftragVon(rolle({ thema: ' Rohkost ', anweisung: 'Du bist Aajonus.' }))).toBe('Thema: Rohkost\nDu bist Aajonus.')
    expect(auftragVon(rolle({ thema: '', anweisung: '' }))).toBe('')
  })

  it('stößt nur an, wenn gerade niemand an der recherche arbeitet', () => {
    const laeuft = ausZeile({ rolle_id: 'x', status: 'laeuft', gesperrt_bis: null })
    expect(istFrei(laeuft)).toBe(true)
    expect(istFrei({ ...laeuft, gesperrtBis: '2026-10-01T16:05:00Z' }, Date.parse('2026-10-01T16:04:00Z'))).toBe(false)
    expect(istFrei({ ...laeuft, gesperrtBis: '2026-10-01T16:05:00Z' }, Date.parse('2026-10-01T16:06:00Z'))).toBe(true)
    expect(istFrei({ ...laeuft, status: 'fertig' })).toBe(false)
  })

  it('zeigt nie 100 %, bevor die akte wirklich fertig ist', () => {
    const fast = ausZeile({ status: 'laeuft', schritte: [{ art: 'wiki', erledigt: true }, { art: 'planen', erledigt: true }] })
    expect(rechercheStand(fast).prozent).toBe(99)
  })

  it('schreibt das datum kurz', () => {
    expect(kurzesDatum('2026-10-01T16:00:00Z')).toBe('1. Okt.')
    expect(kurzesDatum(null)).toBe('')
  })

  it('braucht im prototyp eine anmeldung', async () => {
    expect(RECHERCHE.verfuegbar).toBe(false)
    expect(await RECHERCHE.laden()).toEqual([])
    await expect(RECHERCHE.starten(rolle())).rejects.toThrow('Die Recherche braucht eine Anmeldung.')
  })
})
