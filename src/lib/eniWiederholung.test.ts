import { describe, expect, it, vi } from 'vitest'
import {
  GESAMTFRIST_MS,
  leitungsfehler,
  MAX_WARTEN_MS,
  mitWiederholung,
  Nochmal,
  retryAfter,
  VERSUCHE,
  vorruebergehend,
  type WiederholungsOptionen,
} from '../../supabase/functions/_shared/eniWiederholung.ts'
import { ABLEHNUNG } from '../../supabase/functions/_shared/eniModell.ts'

/**
 * Eine Uhr, die nur vorgeht, wenn jemand wartet. Damit laeuft der Test in
 * Millisekunden ab und prueft trotzdem echte Fristen.
 */
function uhr() {
  let stand = 1_000
  const geschlafen: number[] = []
  const optionen = (weitere: Partial<WiederholungsOptionen> = {}): WiederholungsOptionen => ({
    fristMs: 60_000,
    jetzt: () => stand,
    schlafe: (ms: number) => {
      geschlafen.push(ms)
      stand += ms
      return Promise.resolve()
    },
    ...weitere,
  })
  return { optionen, geschlafen, vor: (ms: number) => (stand += ms) }
}

describe('welcher fehler von selbst weggeht', () => {
  it('zaehlt die grenze je minute und eine ueberlastete gegenstelle dazu', () => {
    expect(vorruebergehend(429)).toBe(true)
    expect(vorruebergehend(500)).toBe(true)
    expect(vorruebergehend(503)).toBe(true)
    expect(vorruebergehend(408)).toBe(true)
  })

  it('zaehlt einen falschen schluessel und eine falsche anfrage nicht dazu', () => {
    expect(vorruebergehend(400)).toBe(false)
    expect(vorruebergehend(401)).toBe(false)
    expect(vorruebergehend(403)).toBe(false)
    expect(vorruebergehend(404)).toBe(false)
  })

  it('erkennt eine abgerissene leitung an ihrem namen', () => {
    const zeit = new Error('zu lange')
    zeit.name = 'TimeoutError'
    expect(leitungsfehler(zeit)).toBe(true)
    expect(leitungsfehler(new TypeError('fetch failed'))).toBe(true)
    expect(leitungsfehler(new Error('irgendwas'))).toBe(false)
  })
})

describe('was die gegenstelle an wartezeit verlangt', () => {
  const mitKopf = (wert: string) =>
    new Response(null, { status: 429, headers: { 'retry-after': wert } })

  it('liest sekunden', () => {
    expect(retryAfter(mitKopf('3'))).toBe(3_000)
  })

  it('liest auch ein datum und rechnet es in wartezeit um', () => {
    const jetzt = Date.parse('2026-09-11T16:33:00Z')
    const gleich = new Date(jetzt + 5_000).toUTCString()
    expect(retryAfter(mitKopf(gleich), jetzt)).toBe(5_000)
  })

  it('sagt nichts, wenn nichts dasteht oder unsinn dasteht', () => {
    expect(retryAfter(new Response(null, { status: 429 }))).toBeNull()
    expect(retryAfter(mitKopf('bald'))).toBeNull()
  })

  it('nimmt eine vergangene zeit als null, nie als negative wartezeit', () => {
    const jetzt = Date.parse('2026-09-11T16:33:00Z')
    const vorhin = new Date(jetzt - 9_000).toUTCString()
    expect(retryAfter(mitKopf(vorhin), jetzt)).toBe(0)
  })
})

describe('ENI fragt noch einmal', () => {
  it('gibt die antwort des ersten versuchs zurueck, ohne zu warten', async () => {
    const { optionen, geschlafen } = uhr()
    const versuch = vi.fn(() => Promise.resolve('das reicht nicht.'))

    expect(await mitWiederholung(versuch, optionen())).toBe('das reicht nicht.')
    expect(versuch).toHaveBeenCalledTimes(1)
    expect(geschlafen).toEqual([])
  })

  it('holt die antwort, wenn die grenze je minute beim zweiten mal offen ist', async () => {
    const { optionen, geschlafen } = uhr()
    const versuch = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Nochmal('ling antwortet 429'))
      .mockResolvedValueOnce('jetzt aber.')

    expect(await mitWiederholung(versuch, optionen())).toBe('jetzt aber.')
    expect(versuch).toHaveBeenCalledTimes(2)
    expect(geschlafen).toEqual([1_500])
  })

  it('wartet so lange, wie die gegenstelle sagt', async () => {
    const { optionen, geschlafen } = uhr()
    const versuch = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Nochmal('ling antwortet 429', 6_000))
      .mockResolvedValueOnce('gut')

    await mitWiederholung(versuch, optionen())
    expect(geschlafen).toEqual([6_000])
  })

  it('wartet trotzdem nicht laenger als der deckel, egal was verlangt wird', async () => {
    const { optionen, geschlafen } = uhr()
    const versuch = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Nochmal('ling antwortet 429', 3_600_000))
      .mockResolvedValueOnce('gut')

    await mitWiederholung(versuch, optionen())
    expect(geschlafen).toEqual([MAX_WARTEN_MS])
  })

  it('versucht es auch nach einer abgerissenen leitung noch einmal', async () => {
    const { optionen } = uhr()
    const zeit = new Error('zu lange')
    zeit.name = 'TimeoutError'
    const versuch = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(zeit)
      .mockResolvedValueOnce('gut')

    expect(await mitWiederholung(versuch, optionen())).toBe('gut')
  })

  it('gibt einen dauerhaften fehler sofort weiter, statt jemanden warten zu lassen', async () => {
    const { optionen, geschlafen } = uhr()
    const versuch = vi.fn(() => Promise.reject(new Error('ling antwortet 401')))

    await expect(mitWiederholung(versuch, optionen())).rejects.toThrow('ling antwortet 401')
    expect(versuch).toHaveBeenCalledTimes(1)
    expect(geschlafen).toEqual([])
  })

  it('reicht eine ablehnung sofort durch: sie faellt beim zweiten mal genauso aus', async () => {
    const { optionen } = uhr()
    const abgelehnt = new Error('vom filter abgelehnt')
    abgelehnt.name = ABLEHNUNG
    const versuch = vi.fn(() => Promise.reject(abgelehnt))

    await expect(mitWiederholung(versuch, optionen())).rejects.toThrow('vom filter abgelehnt')
    expect(versuch).toHaveBeenCalledTimes(1)
  })

  it('gibt nach dem letzten versuch auf und meldet, woran es lag', async () => {
    const { optionen, geschlafen } = uhr()
    const versuch = vi.fn(() => Promise.reject(new Nochmal('ling antwortet 429')))

    await expect(mitWiederholung(versuch, optionen())).rejects.toThrow('ling antwortet 429')
    expect(versuch).toHaveBeenCalledTimes(VERSUCHE)
    // vor dem letzten versuch wird nicht mehr gewartet
    expect(geschlafen).toHaveLength(VERSUCHE - 1)
  })

  it('hoert auf, wenn die gesamtfrist alle ist, statt ins leere zu warten', async () => {
    const { optionen, geschlafen, vor } = uhr()
    const versuch = vi.fn(() => {
      // eine gegenstelle, die jedes mal fast die ganze frist verhaengt
      vor(GESAMTFRIST_MS - 1_000)
      return Promise.reject(new Nochmal('ling bricht ab'))
    })

    await expect(mitWiederholung(versuch, optionen())).rejects.toThrow('ling bricht ab')
    expect(versuch).toHaveBeenCalledTimes(1)
    expect(geschlafen).toEqual([])
  })

  it('gibt dem naechsten versuch nur die frist, die noch uebrig ist', async () => {
    const { optionen, vor } = uhr()
    const fristen: number[] = []
    const versuch = vi.fn((frist: number) => {
      fristen.push(frist)
      vor(58_000)
      return fristen.length < 2
        ? Promise.reject(new Nochmal('ling antwortet 429'))
        : Promise.resolve('gut')
    })

    expect(await mitWiederholung(versuch, optionen())).toBe('gut')
    // der erste versuch bekommt die volle frist, der zweite nur den rest
    expect(fristen[0]).toBe(60_000)
    expect(fristen[1]).toBe(GESAMTFRIST_MS - 58_000 - 1_500)
  })

  it('meldet jeden zweiten anlauf, damit er in den logs steht', async () => {
    const { optionen } = uhr()
    const gemeldet: string[] = []
    const versuch = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Nochmal('ling antwortet 429'))
      .mockResolvedValueOnce('gut')

    await mitWiederholung(versuch, optionen({ protokoll: (was) => gemeldet.push(was) }))
    expect(gemeldet).toEqual(['ling antwortet 429, versuch 2 in 1500ms'])
  })
})
