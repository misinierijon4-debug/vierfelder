import { describe, expect, it } from 'vitest'
import {
  FELDER,
  messungZaehlt,
  neuePunktetafel,
  tafelAusZeilen,
} from '../../supabase/functions/_shared/duellPunkte'
import { toKey } from './dates'

const KONTEN: Record<string, string> = { 'k-erijon': 'erijon', 'k-koray': 'koray' }
const wer = (id: unknown) => KONTEN[String(id)] ?? null

const MONTAG = '2026-09-14'
const HEUTE = '2026-09-17'

/** eine abgeschlossene messung, in minuten */
function messung(user_id: string, bereich: string, tag: string, minuten: number) {
  const ankunft = `${tag}T12:00:00Z`
  return {
    user_id,
    bereich,
    ankunft,
    abgang: new Date(Date.parse(ankunft) + minuten * 60_000).toISOString(),
  }
}

function tafel(quellen: Parameters<typeof tafelAusZeilen>[0]) {
  return tafelAusZeilen(quellen, wer, toKey, MONTAG, HEUTE)
}

describe('die mindestdauer einer messung', () => {
  it('zaehlt ab 20 minuten, beim lesen ab 10', () => {
    expect(messungZaehlt('gym', 19)).toBe(false)
    expect(messungZaehlt('gym', 20)).toBe(true)
    expect(messungZaehlt('lesen', 9)).toBe(false)
    expect(messungZaehlt('lesen', 10)).toBe(true)
  })

  it('zaehlt nichts, was kein bereich ist oder keine zahl ergibt', () => {
    expect(messungZaehlt('gewicht', 90)).toBe(false)
    expect(messungZaehlt('gym', Number.NaN)).toBe(false)
  })
})

describe('die punktetafel', () => {
  it('gibt einen punkt je person, bereich und tag, egal wie viele einheiten', () => {
    const t = tafel({
      einheiten: [
        { user_id: 'k-erijon', bereich: 'gym', tag: '2026-09-15' },
        { user_id: 'k-erijon', bereich: 'gym', tag: '2026-09-15' },
        { user_id: 'k-erijon', bereich: 'gym', tag: '2026-09-16' },
      ],
    })
    expect(t.anzahl('erijon', 'gym')).toBe(2)
    expect(t.anzahl('erijon', 'gym', '2026-09-15')).toBe(1)
  })

  it('nimmt messungen erst ab der mindestdauer und nur abgeschlossen', () => {
    const t = tafel({
      aufenthalte: [
        messung('k-koray', 'gym', '2026-09-15', 19),
        messung('k-koray', 'boxen', '2026-09-15', 20),
        messung('k-koray', 'lesen', '2026-09-16', 10),
        { user_id: 'k-koray', bereich: 'gym', ankunft: '2026-09-16T12:00:00Z', abgang: null },
      ],
    })
    expect(t.anzahl('koray')).toBe(2)
    expect(t.anzahl('koray', 'gym')).toBe(0)
  })

  it('zaehlt das gewicht als fuenftes feld mit', () => {
    const t = tafel({ gewicht: [{ user_id: 'k-erijon', tag: '2026-09-17' }] })
    expect(t.anzahl('erijon')).toBe(1)
    expect(t.felderAm('erijon', '2026-09-17')).toEqual(['gewicht'])
  })

  it('zaehlt messung und haken desselben tages nur einmal', () => {
    // genau der fall aus dem alltag: der fokus laeuft, man tippt trotzdem an
    const t = tafel({
      einheiten: [{ user_id: 'k-erijon', bereich: 'gym', tag: '2026-09-16' }],
      aufenthalte: [messung('k-erijon', 'gym', '2026-09-16', 74)],
    })
    expect(t.anzahl('erijon')).toBe(1)
  })

  it('laesst weg, was vor dem montag oder nach heute liegt', () => {
    const t = tafel({
      einheiten: [
        { user_id: 'k-erijon', bereich: 'gym', tag: '2026-09-13' },
        { user_id: 'k-erijon', bereich: 'gym', tag: '2026-09-18' },
        { user_id: 'k-erijon', bereich: 'gym', tag: MONTAG },
      ],
    })
    expect(t.anzahl('erijon')).toBe(1)
  })

  it('ordnet eine messung am UTC-sonntag dem berliner montag zu', () => {
    const t = tafel({
      aufenthalte: [{
        user_id: 'k-koray',
        bereich: 'boxen',
        ankunft: '2026-09-13T22:10:00Z',
        abgang: '2026-09-13T23:10:00Z',
      }],
    })
    expect(t.anzahl('koray', 'boxen', MONTAG)).toBe(1)
  })

  it('ueberspringt zeilen, die zu keiner person gehoeren', () => {
    const t = tafel({ einheiten: [{ user_id: 'k-fremd', bereich: 'gym', tag: '2026-09-15' }] })
    expect(t.anzahl('erijon')).toBe(0)
    expect(t.anzahl('koray')).toBe(0)
  })

  it('nennt die felder eines tages in der reihenfolge der app', () => {
    const t = tafel({
      einheiten: [
        { user_id: 'k-erijon', bereich: 'lesen', tag: HEUTE },
        { user_id: 'k-erijon', bereich: 'lernen', tag: HEUTE },
      ],
      gewicht: [{ user_id: 'k-erijon', tag: HEUTE }],
    })
    expect(t.felderAm('erijon', HEUTE)).toEqual(['lernen', 'lesen', 'gewicht'])
    expect(FELDER).toEqual(['lernen', 'gym', 'boxen', 'lesen', 'gewicht'])
  })
})

describe('eine leere tafel', () => {
  it('zaehlt null, statt zu raten', () => {
    const leer = neuePunktetafel(MONTAG, HEUTE)
    expect(leer.anzahl('erijon')).toBe(0)
    expect(leer.felderAm('erijon', HEUTE)).toEqual([])
  })
})
