import { describe, expect, it, vi } from 'vitest'
import { AnsageAbgelehnt } from './ansagen'
import { aktionsId, beschreibeAktion, fuehreAktionAus, knopfText, liesTag, pruefeAktion } from './eniAktion'

// mittwoch, 30.09.2026, 19 uhr in berlin
const JETZT = new Date(2026, 8, 30, 19, 0)

describe('welcher tag gemeint ist', () => {
  it('versteht heute, gestern und vorgestern und rechnet lokal', () => {
    expect(liesTag(undefined, JETZT)).toBe('2026-09-30')
    expect(liesTag('heute', JETZT)).toBe('2026-09-30')
    expect(liesTag('gestern', JETZT)).toBe('2026-09-29')
    expect(liesTag('vorgestern', JETZT)).toBe('2026-09-28')
  })

  it('nimmt ein datum der letzten sieben tage, keins aus der zukunft und keins davor', () => {
    expect(liesTag('2026-09-24', JETZT)).toBe('2026-09-24')
    expect(liesTag('2026-09-23', JETZT)).toBeNull()
    expect(liesTag('2026-10-01', JETZT)).toBeNull()
    expect(liesTag('2026-02-31', JETZT)).toBeNull()
    expect(liesTag('morgen', JETZT)).toBeNull()
  })
})

describe('einen vorschlag pruefen', () => {
  it('liest eine einheit mit und ohne wert', () => {
    expect(pruefeAktion('{"typ":"einheit","bereich":"lernen","tag":"heute","wert":45}', JETZT)).toEqual({
      ok: true,
      aktion: { typ: 'einheit', bereich: 'lernen', tag: '2026-09-30', wert: 45 },
    })
    expect(pruefeAktion('{"typ":"einheit","bereich":"gym","tag":"gestern"}', JETZT)).toEqual({
      ok: true,
      aktion: { typ: 'einheit', bereich: 'gym', tag: '2026-09-29', wert: null },
    })
  })

  it('lehnt unbekannte bereiche, zu alte tage und unplausible werte ab', () => {
    expect(pruefeAktion('{"typ":"einheit","bereich":"schwimmen"}', JETZT).ok).toBe(false)
    expect(pruefeAktion('{"typ":"einheit","bereich":"lernen","tag":"2026-09-01"}', JETZT).ok).toBe(false)
    expect(pruefeAktion('{"typ":"einheit","bereich":"gym","wert":900}', JETZT).ok).toBe(false)
    expect(pruefeAktion('{"typ":"einheit","bereich":"gym","wert":"viel"}', JETZT).ok).toBe(false)
  })

  it('rundet ein gewicht auf hundert gramm und prueft es', () => {
    expect(pruefeAktion('{"typ":"gewicht","kg":81.44}', JETZT)).toEqual({
      ok: true,
      aktion: { typ: 'gewicht', tag: '2026-09-30', kg: 81.4 },
    })
    expect(pruefeAktion('{"typ":"gewicht","kg":8}', JETZT).ok).toBe(false)
  })

  it('kennt nur die neuen ansagefelder und die drei stufen', () => {
    expect(pruefeAktion('{"typ":"ansage","feld":"lernen","stufe":"mutig"}', JETZT)).toEqual({
      ok: true,
      aktion: { typ: 'ansage', feld: 'lernen', stufe: 'mutig' },
    })
    expect(pruefeAktion('{"typ":"ansage","feld":"gym","stufe":"mutig"}', JETZT).ok).toBe(false)
    expect(pruefeAktion('{"typ":"ansage","feld":"lernen","stufe":"riesig"}', JETZT).ok).toBe(false)
  })

  it('macht aus kaputtem json und unbekannten typen einen ehrlichen satz', () => {
    expect(pruefeAktion('{"typ":"einheit",', JETZT)).toEqual({ ok: false, grund: 'den vorschlag konnte ich nicht lesen.' })
    expect(pruefeAktion('{"typ":"loeschen"}', JETZT)).toEqual({ ok: false, grund: 'das kann ENI nicht eintragen.' })
  })
})

describe('was auf der karte steht', () => {
  it('beschreibt jeden vorschlag in einem satzteil', () => {
    expect(beschreibeAktion({ typ: 'einheit', bereich: 'lernen', tag: '2026-09-30', wert: 45 }, JETZT)).toBe('45 min lernen · heute')
    expect(beschreibeAktion({ typ: 'einheit', bereich: 'lesen', tag: '2026-09-29', wert: 30 }, JETZT)).toBe('30 seiten lesen · gestern')
    expect(beschreibeAktion({ typ: 'einheit', bereich: 'gym', tag: '2026-09-27', wert: null }, JETZT)).toBe('gym · am 27.9.')
    expect(beschreibeAktion({ typ: 'gewicht', tag: '2026-09-30', kg: 81.4 }, JETZT)).toBe('81,4 kg · heute')
    expect(beschreibeAktion({ typ: 'ansage', feld: 'lernen', stufe: 'allin' }, JETZT)).toBe('ansage lernen · all-in')
    expect(knopfText({ typ: 'ansage', feld: 'lernen', stufe: 'mutig' })).toBe('ansagen')
    expect(knopfText({ typ: 'gewicht', tag: '2026-09-30', kg: 80 })).toBe('eintragen')
  })
})

describe('die feste id je vorschlag', () => {
  it('ist fuer dieselbe stelle immer dieselbe, sonst eine andere, und eine gueltige uuid', async () => {
    const a = await aktionsId('nachricht-1', 0)
    expect(a).toBe(await aktionsId('nachricht-1', 0))
    expect(a).not.toBe(await aktionsId('nachricht-1', 1))
    expect(a).not.toBe(await aktionsId('nachricht-2', 0))
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  })
})

describe('einen bestaetigten vorschlag ausfuehren', () => {
  const backend = () => ({
    schreibeEinheit: vi.fn().mockResolvedValue(undefined),
    schreibeGewicht: vi.fn().mockResolvedValue(undefined),
    sageAn: vi.fn().mockResolvedValue({}),
  })

  it('schreibt eine einheit mit der festen id fuer die eigene person', async () => {
    const b = backend()
    await fuehreAktionAus({ typ: 'einheit', bereich: 'lernen', tag: '2026-09-30', wert: 45 }, 'feste-id', b, 'koray', JETZT)
    expect(b.schreibeEinheit).toHaveBeenCalledWith({
      id: 'feste-id',
      user: 'koray',
      area: 'lernen',
      tag: '2026-09-30',
      wert: 45,
      erfasst: JETZT.toISOString(),
      von: null,
    })
  })

  it('schreibt gewicht und ansage ueber dieselben wege wie die app', async () => {
    const b = backend()
    await fuehreAktionAus({ typ: 'gewicht', tag: '2026-09-30', kg: 81.4 }, 'x', b, 'erijon', JETZT)
    expect(b.schreibeGewicht).toHaveBeenCalledWith('2026-09-30', 81.4)
    await fuehreAktionAus({ typ: 'ansage', feld: 'lernen', stufe: 'mutig' }, 'ansage-id', b, 'erijon', JETZT)
    expect(b.sageAn).toHaveBeenCalledWith('ansage-id', 'lernen', 'mutig')
  })

  it('sagt bei einer abgelehnten ansage den grund der regel, sonst einen allgemeinen satz', async () => {
    const b = backend()
    b.sageAn.mockRejectedValue(new AnsageAbgelehnt('zuSpaet'))
    await expect(fuehreAktionAus({ typ: 'ansage', feld: 'lernen', stufe: 'mutig' }, 'x', b, 'erijon', JETZT))
      .rejects.toThrow('ab freitag 18 uhr gibt es keine ansagen mehr')
    b.schreibeGewicht.mockRejectedValue(new Error('netz weg'))
    await expect(fuehreAktionAus({ typ: 'gewicht', tag: '2026-09-30', kg: 81 }, 'x', b, 'erijon', JETZT))
      .rejects.toThrow('hat nicht geklappt')
  })
})
