import { describe, expect, it } from 'vitest'
import {
  fristText,
  kurzDatum,
  ordneWissen,
  passtZurSuche,
  schnellwahl,
  standText,
} from './eniWissenAnsicht'
import { waehleWissen, type Erinnerung } from '../../supabase/functions/_shared/eniWissen'

const HEUTE = '2026-09-29'

const eintrag = (werte: Partial<Erinnerung> = {}): Erinnerung => ({
  id: '1',
  user_id: 'ich',
  text: 'Ich lerne Mathe.',
  art: 'profil',
  gemeinsam: false,
  bis: null,
  erledigt: false,
  erstellt: '2026-09-11T10:00:00Z',
  geaendert: '2026-09-11T10:00:00Z',
  ...werte,
})

describe('ordneWissen', () => {
  it('legt ruhend genau das ab, was ENI beim antworten aussortiert', () => {
    const liste = [
      eintrag({ id: 'profil' }),
      eintrag({ id: 'abgelaufen', art: 'aktuell', bis: '2026-09-28' }),
      eintrag({ id: 'bis-heute', art: 'aktuell', bis: HEUTE }),
      eintrag({ id: 'erledigt', art: 'aufgabe', erledigt: true }),
      eintrag({ id: 'ueberfaellig', art: 'aufgabe', bis: '2026-09-20' }),
      eintrag({ id: 'geteilt', user_id: 'anderer', gemeinsam: true }),
    ]
    const ansicht = ordneWissen(liste, 'ich', HEUTE)
    const aktiv = ansicht.abschnitte.flatMap((a) => a.eintraege.map((e) => e.id)).sort()
    const eni = waehleWissen(liste, 'ich', '', HEUTE).map((e) => e.id).sort()
    expect(aktiv).toEqual(eni)
    expect(ansicht.ruht.map((e) => e.id)).toEqual(['abgelaufen', 'erledigt'])
    expect(ansicht.aktiv).toBe(4)
  })

  it('zeigt vom anderen nur geteiltes und nie seinen ton', () => {
    const ansicht = ordneWissen(
      [
        eintrag({ id: 'privat', user_id: 'anderer' }),
        eintrag({ id: 'stil', user_id: 'anderer', art: 'stil', gemeinsam: true }),
        eintrag({ id: 'geteilt', user_id: 'anderer', gemeinsam: true }),
        eintrag({ id: 'meins', gemeinsam: true }),
      ],
      'ich',
      HEUTE,
    )
    expect(ansicht.abschnitte.find((a) => a.art === 'profil')!.eintraege.map((e) => e.id)).toEqual([
      'meins',
      'geteilt',
    ])
    expect(ansicht.zahlen.stil).toBe(0)
    expect(ansicht).toMatchObject({ aktiv: 2, geteilt: 1, fremd: 1 })
  })

  it('ordnet schritte nach fälligkeit und lässt gerade abgehakte stehen', () => {
    const ansicht = ordneWissen(
      [
        eintrag({ id: 'ohne', art: 'aufgabe', geaendert: '2026-09-28T10:00:00Z' }),
        eintrag({ id: 'spaet', art: 'aufgabe', bis: '2026-10-10' }),
        eintrag({ id: 'frueh', art: 'aufgabe', bis: '2026-09-30' }),
        eintrag({ id: 'eben', art: 'aufgabe', bis: '2026-09-29', erledigt: true }),
      ],
      'ich',
      HEUTE,
      new Set(['eben']),
    )
    const schritte = ansicht.abschnitte.find((a) => a.art === 'aufgabe')!
    expect(schritte.eintraege.map((e) => e.id)).toEqual(['frueh', 'spaet', 'ohne', 'eben'])
    expect(ansicht.zahlen.aufgabe).toBe(3)
    expect(ansicht.ruht).toEqual([])
  })

  it('führt alle fünf bereiche in fester reihenfolge, auch leere', () => {
    expect(ordneWissen([], 'ich', HEUTE).abschnitte.map((a) => a.art)).toEqual([
      'stil',
      'profil',
      'aktuell',
      'erfahrung',
      'aufgabe',
    ])
  })
})

describe('passtZurSuche', () => {
  it('verlangt jedes wort, egal ob gross oder klein', () => {
    const e = eintrag({ text: 'Kurze Lernblöcke nach der Schule' })
    expect(passtZurSuche(e, 'schule KURZE')).toBe(true)
    expect(passtZurSuche(e, 'schule abend')).toBe(false)
    expect(passtZurSuche(e, '   ')).toBe(true)
  })
})

describe('datum und frist', () => {
  it('schreibt tage kurz und das jahr nur, wenn es ein anderes ist', () => {
    expect(kurzDatum('2026-10-05', HEUTE)).toBe('mo 05.10.')
    expect(kurzDatum('2027-01-03', HEUTE)).toBe('so 03.01.2027')
  })

  it('sagt, wie alt ein stand ist', () => {
    expect(standText('2026-09-29T08:00:00+02:00', HEUTE)).toBe('heute')
    expect(standText('2026-09-28T23:30:00+02:00', HEUTE)).toBe('gestern')
    expect(standText('2026-09-25T12:00:00+02:00', HEUTE)).toBe('vor 4 tagen')
    expect(standText('2026-09-11T12:00:00+02:00', HEUTE)).toBe('am 11.09.')
    expect(standText('2025-12-30T12:00:00+01:00', HEUTE)).toBe('am 30.12.2025')
  })

  it('nennt fällig und überfällig als wort', () => {
    const schritt = (bis: string | null, erledigt = false) =>
      fristText(eintrag({ art: 'aufgabe', bis, erledigt }), HEUTE)
    expect(schritt('2026-09-27')).toEqual({ text: 'überfällig seit so 27.09.', dringend: true })
    expect(schritt(HEUTE)).toEqual({ text: 'heute fällig', dringend: true })
    expect(schritt('2026-09-30')).toEqual({ text: 'morgen fällig', dringend: false })
    expect(schritt('2026-10-02')?.text).toBe('fällig fr 02.10.')
    expect(schritt('2026-09-27', true)?.text).toBe('erledigt')
    expect(schritt(null)).toBeNull()
  })

  it('sagt bei kontext, bis wann er gilt oder dass er abgelaufen ist', () => {
    expect(fristText(eintrag({ art: 'aktuell', bis: '2026-10-04' }), HEUTE)?.text).toBe('gilt bis so 04.10.')
    expect(fristText(eintrag({ art: 'aktuell', bis: HEUTE }), HEUTE)?.text).toBe('gilt bis heute')
    expect(fristText(eintrag({ art: 'aktuell', bis: '2026-09-14' }), HEUTE)?.text).toBe('abgelaufen mo 14.09.')
    expect(fristText(eintrag(), HEUTE)).toBeNull()
  })
})

describe('schnellwahl', () => {
  it('rechnet in lokaler zeit, sonntag eingeschlossen', () => {
    const dienstag = new Date(2026, 8, 29, 23, 30)
    expect(schnellwahl('aktuell', dienstag)).toEqual([
      { text: 'ohne ende', bis: null },
      { text: 'bis sonntag', bis: '2026-10-04' },
      { text: '4 wochen', bis: '2026-10-27' },
    ])
    expect(schnellwahl('aufgabe', dienstag).map((w) => w.bis)).toEqual([
      null,
      '2026-09-29',
      '2026-09-30',
      '2026-10-04',
    ])
  })

  it('meint am sonntag selbst den heutigen tag', () => {
    expect(schnellwahl('aktuell', new Date(2026, 9, 4, 12))[1]).toEqual({
      text: 'bis sonntag',
      bis: '2026-10-04',
    })
  })
})
