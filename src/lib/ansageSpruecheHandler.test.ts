import { describe, expect, it, vi } from 'vitest'
import {
  SPRUCH_ANWEISUNG,
  behandleSprueche,
  istUmschrieben,
  pruefeAuswahl,
  redetAn,
  pruefeVorschlaege,
  spruchEingabe,
} from '../../supabase/functions/_shared/ansageSprueche'
import type { SpruchDienste } from '../../supabase/functions/_shared/ansageSprueche'

const vorschlaege = [
  { feld: 'boxen', ziel: 2, verlauf: [1, 0, 1, 1] },
  { feld: 'lesen', ziel: 1, verlauf: [0, 0, 1, 0] },
]
const anfrage = (body: unknown, token = 'Bearer test') =>
  new Request('https://example.test', { method: 'POST', headers: { authorization: token }, body: JSON.stringify(body) })

function dienste(antwort: unknown = { auswahl: [{ feld: 'boxen', spruch: 'koray und boxen, das wird eng.' }] }): SpruchDienste {
  return {
    person: vi.fn(async () => 'erijon' as const),
    schreiben: vi.fn(async () => ({ antwort, modell: 'test' })),
  }
}

describe('ansage-sprueche', () => {
  it('fragt ohne mitgliedschaft kein modell', async () => {
    const d = dienste()
    expect((await behandleSprueche(anfrage({ vorschlaege }, ''), d)).status).toBe(401)
    vi.mocked(d.person).mockResolvedValue(null)
    expect((await behandleSprueche(anfrage({ vorschlaege }), d)).status).toBe(403)
    expect(d.schreiben).not.toHaveBeenCalled()
  })

  it('lehnt vorschläge ab, die die app so nie schickt', () => {
    expect(pruefeVorschlaege(vorschlaege)).toEqual(vorschlaege)
    expect(pruefeVorschlaege([])).toBeNull()
    expect(pruefeVorschlaege([{ feld: 'schlaf', ziel: 1, verlauf: [0, 0, 0, 0] }])).toBeNull()
    expect(pruefeVorschlaege([{ feld: 'lernen', ziel: 1, verlauf: [0, 0, 0, 0], stufe: 'heldenhaft' }])).toBeNull()
    expect(pruefeVorschlaege([{ feld: 'lernen', ziel: 1, verlauf: [0, 0, 0, 0], meinVerlauf: [1] }])).toBeNull()
    const neu = [{ feld: 'lernen', ziel: 2, stufe: 'mutig', verlauf: [0, 1, 0, 1], meinVerlauf: [1, 1, 2, 0] }]
    expect(pruefeVorschlaege(neu)).toEqual(neu)
    expect(spruchEingabe('koray', pruefeVorschlaege(neu)!)).toEqual({
      herausgefordert: 'Koray',
      kandidaten: [{
        feld: 'lernen',
        ziel_bis_sonntag: 2,
        stufe: 'mutig',
        letzte_vier_wochen: [0, 1, 0, 1],
        deine_letzten_vier_wochen: [1, 1, 2, 0],
      }],
    })
    expect(pruefeVorschlaege([{ feld: 'gym', ziel: 9, verlauf: [0, 0, 0, 0] }])).toBeNull()
    expect(pruefeVorschlaege([{ feld: 'gym', ziel: 1, verlauf: [0, 0, 0] }])).toBeNull()
    expect(pruefeVorschlaege([vorschlaege[0], vorschlaege[0]])).toBeNull()
  })

  it('sagt dem modell, wer angesagt wird — immer die andere person', async () => {
    const d = dienste()
    const antwort = await behandleSprueche(anfrage({ vorschlaege }), d)
    expect(antwort.status).toBe(200)
    expect(d.schreiben).toHaveBeenCalledWith(spruchEingabe('koray', pruefeVorschlaege(vorschlaege)!))
    expect(await antwort.json()).toEqual({
      auswahl: [{ feld: 'boxen', spruch: 'koray und boxen, das wird eng.' }],
      modell: 'test',
    })
  })

  it('verwirft sprüche mit ziffern, fremden feldern, doppelten und zu langen', () => {
    const auswahl = pruefeAuswahl(
      {
        auswahl: [
          { feld: 'gym', spruch: 'nicht vorgeschlagen' },
          { feld: 'boxen', spruch: 'koray schafft keine 2' },
          { feld: 'boxen', spruch: 'koray  und   boxen.' },
          { feld: 'boxen', spruch: 'doppelt' },
          { feld: 'lesen', spruch: 'x'.repeat(200) },
        ],
      },
      ['boxen', 'lesen']
    )
    expect(auswahl).toEqual([{ feld: 'boxen', spruch: 'koray und boxen.' }])
  })

  it('verwirft sprüche, die die herausgeforderte person direkt anreden', () => {
    expect(redetAn('koray, beim gym bist du bisher ein phantom', 'koray')).toBe(true)
    expect(redetAn('Koray! zeig mal was', 'koray')).toBe(true)
    expect(redetAn('wettest du, dass du das halten kannst, koray?', 'koray')).toBe(true)
    expect(redetAn('koray war seit wochen nicht im gym. traust du dich?', 'koray')).toBe(false)
    expect(redetAn('das hält koray nie durch.', 'koray')).toBe(false)

    const auswahl = pruefeAuswahl(
      {
        auswahl: [
          { feld: 'boxen', spruch: 'koray, zeig mir, dass du existierst!' },
          { feld: 'lesen', spruch: 'koray liest kaum. traust du dich?' },
        ],
      },
      ['boxen', 'lesen'],
      'koray'
    )
    expect(auswahl).toEqual([{ feld: 'lesen', spruch: 'koray liest kaum. traust du dich?' }])
  })

  it('verwirft sprüche in umschrift, lässt echte ue-wörter aber stehen', () => {
    expect(istUmschrieben('zeig, dass du ueberhaupt existierst')).toBe(true)
    expect(istUmschrieben('boxen laeuft bei koray ploetzlich rund')).toBe(true)
    expect(istUmschrieben('für koray wird das eng')).toBe(false)
    expect(istUmschrieben('fuer koray wird das eng')).toBe(true)
    expect(istUmschrieben('im duell zählt das neue ziel, aktuell offen')).toBe(false)

    const auswahl = pruefeAuswahl(
      { auswahl: [{ feld: 'boxen', spruch: 'boxen laeuft bei koray ploetzlich rund' }] },
      ['boxen']
    )
    expect(auswahl).toEqual([])
  })

  it('verwirft beim server, was die andere person anredet', async () => {
    const antwort = await behandleSprueche(
      anfrage({ vorschlaege }),
      dienste({ auswahl: [{ feld: 'boxen', spruch: 'koray, das wird eng.' }] })
    )
    expect(antwort.status).toBe(502)
  })

  it('verlangt in der anweisung echte umlaute und die sicht der ansagenden person', () => {
    expect(SPRUCH_ANWEISUNG).toContain('echte Umlaute')
    expect(SPRUCH_ANWEISUNG).toContain('liest die ansagende Person')
  })

  it('meldet eine leere auswahl als fehler statt als leere liste', async () => {
    const antwort = await behandleSprueche(anfrage({ vorschlaege }), dienste({ auswahl: [] }))
    expect(antwort.status).toBe(502)
  })
})
