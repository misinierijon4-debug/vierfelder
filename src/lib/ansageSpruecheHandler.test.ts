import { describe, expect, it, vi } from 'vitest'
import {
  behandleSprueche,
  pruefeAuswahl,
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
    expect(pruefeVorschlaege([{ feld: 'lernen', ziel: 1, verlauf: [0, 0, 0, 0] }])).toBeNull()
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

  it('meldet eine leere auswahl als fehler statt als leere liste', async () => {
    const antwort = await behandleSprueche(anfrage({ vorschlaege }), dienste({ auswahl: [] }))
    expect(antwort.status).toBe(502)
  })
})
