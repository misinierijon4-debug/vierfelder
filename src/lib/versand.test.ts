import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  fehlerausgang,
  versende,
  type Fehlerausgang,
} from '../../supabase/functions/_shared/versand'
import type { Sendeergebnis } from '../../supabase/functions/_shared/webpush'

const SCHLUESSEL = {
  oeffentlich: 'nicht benoetigt',
  privat: 'nicht benoetigt',
  kontakt: 'mailto:test@example.com',
}

const TOKEN = '11111111-1111-4111-8111-111111111111'
const NACHRICHT = { titel: 'zweikampf', text: 'probe', tag: 'probe', url: './' }
const ABO = {
  endpoint: 'https://web.push.apple.com/QH/eins',
  p256dh: 'nicht benoetigt',
  auth: 'nicht benoetigt',
}

type RpcAntwort = { data: boolean | null; error: { code?: string } | null }
type RpcAntworten = Record<string, RpcAntwort | RpcAntwort[] | undefined>

function antwort(data: boolean | null, fehler = false): RpcAntwort {
  return { data, error: fehler ? { code: 'XX000' } : null }
}

function szenario(
  optionen: {
    abos?: (typeof ABO)[]
    aboFehler?: boolean
    rpcAntworten?: RpcAntworten
    sendeergebnisse?: Sendeergebnis[]
    sendeWirft?: boolean
    geloeschteEndpunkte?: string[]
    loeschFehler?: boolean
  } = {}
) {
  const abos = optionen.abos ?? [ABO]
  const antwortlisten = new Map<string, RpcAntwort[]>()
  for (const [name, wert] of Object.entries(optionen.rpcAntworten ?? {})) {
    if (wert) antwortlisten.set(name, Array.isArray(wert) ? [...wert] : [wert])
  }

  const rpc = vi.fn(async (name: string, _parameter: Record<string, string>) => {
    const liste = antwortlisten.get(name)
    return liste?.shift() ?? antwort(true)
  })
  const loeschSelect = vi.fn(async (_spalten: string) => ({
    data: (optionen.geloeschteEndpunkte ?? []).map((endpoint) => ({ endpoint })),
    error: optionen.loeschFehler ? { code: 'XX000' } : null,
  }))
  const endpunkteWaehlen = vi.fn((_spalte: string, _werte: string[]) => ({
    select: loeschSelect,
  }))
  const from = vi.fn((tabelle: string) => {
    if (tabelle !== 'push_abos') throw new Error(`unerwartete tabelle ${tabelle}`)
    return {
      select: () => ({
        eq: async () => ({
          data: optionen.aboFehler ? null : abos,
          error: optionen.aboFehler ? { code: 'XX000' } : null,
        }),
      }),
      delete: () => ({ in: endpunkteWaehlen }),
    }
  })

  const ergebnisse = [...(optionen.sendeergebnisse ?? [{ status: 201, weg: false, fehler: null }])]
  const sender = vi.fn(async () => {
    if (optionen.sendeWirft) throw new Error('geheimer providertext')
    const ergebnis = ergebnisse.shift()
    if (!ergebnis) throw new Error('test ohne sendeergebnis')
    return ergebnis
  })

  return { db: { from, rpc } as never, rpc, sender, endpunkteWaehlen, loeschSelect }
}

async function ausfuehren(test: ReturnType<typeof szenario>) {
  return versende(
    test.db,
    'gewicht',
    '2026-09-06',
    ['user-1'],
    NACHRICHT,
    SCHLUESSEL,
    { sende: test.sender, erzeugeToken: () => TOKEN }
  )
}

describe('klassifikation nicht angenommener pushs', () => {
  it.each<[Sendeergebnis, Fehlerausgang]>([
    [{ status: 0, weg: false, fehler: 'antwort verloren' }, 'unbestaetigt'],
    [{ status: 408, weg: false, fehler: 'abgelehnt' }, 'wiederholen'],
    [{ status: 425, weg: false, fehler: 'abgelehnt' }, 'wiederholen'],
    [{ status: 429, weg: false, fehler: 'abgelehnt' }, 'wiederholen'],
    [{ status: 500, weg: false, fehler: 'abgelehnt' }, 'unbestaetigt'],
    [{ status: 502, weg: false, fehler: 'abgelehnt' }, 'unbestaetigt'],
    [{ status: 503, weg: false, fehler: 'abgelehnt' }, 'unbestaetigt'],
    [{ status: 504, weg: false, fehler: 'abgelehnt' }, 'unbestaetigt'],
    [{ status: 599, weg: false, fehler: 'abgelehnt' }, 'unbestaetigt'],
    [{ status: 400, weg: false, fehler: 'abgelehnt' }, 'fehlgeschlagen'],
    [{ status: 401, weg: false, fehler: 'abgelehnt' }, 'fehlgeschlagen'],
    [{ status: 403, weg: false, fehler: 'abgelehnt' }, 'fehlgeschlagen'],
    [{ status: 413, weg: false, fehler: 'abgelehnt' }, 'fehlgeschlagen'],
    [{ status: 410, weg: true, fehler: null }, 'fehlgeschlagen'],
    [{ status: 0, weg: true, fehler: 'ungueltiger endpoint' }, 'fehlgeschlagen'],
  ])('ordnet %# ohne freie providertexte ein', (ergebnis, erwartet) => {
    expect(fehlerausgang([ergebnis])).toBe(erwartet)
  })

  it('behandelt einen unklaren ausgang strenger als eine weitere transiente antwort', () => {
    expect(
      fehlerausgang([
        { status: 429, weg: false, fehler: 'abgelehnt' },
        { status: 0, weg: false, fehler: 'antwort verloren' },
      ])
    ).toBe('unbestaetigt')
  })
})

describe('gemeinsamer erinnerungsversand', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('reserviert und startet mit demselben fencing-token vor dem ersten provideraufruf', async () => {
    const test = szenario()

    const ergebnis = await ausfuehren(test)

    expect(ergebnis).toEqual({ gesendet: 1, uebersprungen: 0, entfernt: 0, fehler: 0 })
    expect(test.rpc.mock.calls.map(([name]) => name)).toEqual([
      'reserviere_erinnerungsversand',
      'starte_erinnerungsversand',
      'bestaetige_erinnerungsversand',
    ])
    for (const [, parameter] of test.rpc.mock.calls) {
      expect(parameter).toMatchObject({
        p_user_id: 'user-1',
        p_art: 'gewicht',
        p_tag: '2026-09-06',
        p_lease_token: TOKEN,
      })
    }
    expect(test.rpc.mock.invocationCallOrder[1]!).toBeLessThan(
      test.sender.mock.invocationCallOrder[0]!
    )
  })

  it('sendet ohne aktives abo nicht und legt auch keine outbox-zeile an', async () => {
    const test = szenario({ abos: [] })

    expect(await ausfuehren(test)).toEqual({
      gesendet: 0,
      uebersprungen: 1,
      entfernt: 0,
      fehler: 0,
    })
    expect(test.rpc).not.toHaveBeenCalled()
    expect(test.sender).not.toHaveBeenCalled()
  })

  it('ueberspringt eine bereits beanspruchte oder abgeschlossene erinnerung', async () => {
    const test = szenario({
      rpcAntworten: { reserviere_erinnerungsversand: antwort(false) },
    })

    expect(await ausfuehren(test)).toEqual({
      gesendet: 0,
      uebersprungen: 1,
      entfernt: 0,
      fehler: 0,
    })
    expect(test.sender).not.toHaveBeenCalled()
    expect(test.rpc).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['reservierung', 'reserviere_erinnerungsversand', antwort(null)],
    ['sendebeginn', 'starte_erinnerungsversand', antwort(false)],
  ])('ruft bei nicht bestaetigter %s keinen provider auf', async (_text, rpcName, rpcAntwort) => {
    const test = szenario({ rpcAntworten: { [rpcName]: rpcAntwort } })
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    const ergebnis = await ausfuehren(test)

    expect(ergebnis).toEqual({ gesendet: 0, uebersprungen: 0, entfernt: 0, fehler: 1 })
    expect(test.sender).not.toHaveBeenCalled()
    expect(log).toHaveBeenCalledTimes(1)
  })

  it('bewahrt mindestens-ein-geraet-semantik und wiederholt teilfehler nicht', async () => {
    const test = szenario({
      abos: [ABO, { ...ABO, endpoint: 'https://fcm.googleapis.com/fcm/send/zwei' }],
      sendeergebnisse: [
        { status: 201, weg: false, fehler: null },
        { status: 503, weg: false, fehler: 'abgelehnt' },
      ],
    })

    expect(await ausfuehren(test)).toEqual({
      gesendet: 1,
      uebersprungen: 0,
      entfernt: 0,
      fehler: 0,
    })
    expect(test.rpc.mock.calls.map(([name]) => name)).toEqual([
      'reserviere_erinnerungsversand',
      'starte_erinnerungsversand',
      'bestaetige_erinnerungsversand',
    ])
  })

  it('behauptet trotz providerannahme keinen erfolg ohne bestaetigten abschluss', async () => {
    const test = szenario({
      rpcAntworten: { bestaetige_erinnerungsversand: antwort(false) },
    })
    vi.spyOn(console, 'error').mockImplementation(() => undefined)

    expect(await ausfuehren(test)).toEqual({
      gesendet: 0,
      uebersprungen: 0,
      entfernt: 0,
      fehler: 1,
    })
  })

  it.each<[Sendeergebnis, Fehlerausgang]>([
    [{ status: 0, weg: false, fehler: 'antwort verloren' }, 'unbestaetigt'],
    [{ status: 503, weg: false, fehler: 'abgelehnt' }, 'unbestaetigt'],
    [{ status: 400, weg: false, fehler: 'abgelehnt' }, 'fehlgeschlagen'],
  ])('schreibt fuer einen nicht angenommenen push nur den ausgang %s', async (sendefehler, ausgang) => {
    const test = szenario({ sendeergebnisse: [sendefehler] })

    expect(await ausfuehren(test)).toEqual({
      gesendet: 0,
      uebersprungen: 0,
      entfernt: 0,
      fehler: 1,
    })
    expect(test.rpc).toHaveBeenLastCalledWith('melde_erinnerungsversand_fehler', {
      p_user_id: 'user-1',
      p_art: 'gewicht',
      p_tag: '2026-09-06',
      p_lease_token: TOKEN,
      p_ausgang: ausgang,
    })
  })

  it('behandelt auch eine geworfene sendeausnahme als unbestaetigt und loggt keinen fremdtext', async () => {
    const test = szenario({ sendeWirft: true })
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    await ausfuehren(test)

    expect(test.rpc).toHaveBeenLastCalledWith(
      'melde_erinnerungsversand_fehler',
      expect.objectContaining({ p_ausgang: 'unbestaetigt' })
    )
    expect(log.mock.calls.flat().join(' ')).not.toContain('geheimer providertext')
    expect(log.mock.calls.flat().join(' ')).not.toContain(ABO.endpoint)
  })

  it('entfernt einen unzulaessigen alt-endpunkt ohne netzwerkzugriff und beendet dauerhaft', async () => {
    const endpoint = 'https://127.0.0.1/interner-dienst'
    const rpc = vi.fn(async () => antwort(true))
    const loeschSelect = vi.fn(async () => ({ data: [{ endpoint }], error: null }))
    const endpunkteWaehlen = vi.fn(() => ({ select: loeschSelect }))
    const from = vi.fn(() => ({
      select: () => ({
        eq: async () => ({ data: [{ endpoint, p256dh: 'egal', auth: 'egal' }], error: null }),
      }),
      delete: () => ({ in: endpunkteWaehlen }),
    }))
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const ergebnis = await versende(
      { from, rpc } as never,
      'gewicht',
      '2026-09-06',
      ['user-1'],
      NACHRICHT,
      SCHLUESSEL,
      { erzeugeToken: () => TOKEN }
    )

    expect(ergebnis).toEqual({ gesendet: 0, uebersprungen: 0, entfernt: 1, fehler: 1 })
    expect(endpunkteWaehlen).toHaveBeenCalledWith('endpoint', [endpoint])
    expect(loeschSelect).toHaveBeenCalledWith('endpoint')
    expect(rpc).toHaveBeenLastCalledWith(
      'melde_erinnerungsversand_fehler',
      expect.objectContaining({ p_ausgang: 'fehlgeschlagen' })
    )
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('behauptet keine abo-loeschung, wenn die datenbank null zeilen bestaetigt', async () => {
    const endpoint = 'https://localhost/intern'
    const test = szenario({
      abos: [{ ...ABO, endpoint }],
      sendeergebnisse: [{ status: 0, weg: true, fehler: 'ungueltiger endpoint' }],
      geloeschteEndpunkte: [],
    })
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    expect(await ausfuehren(test)).toEqual({
      gesendet: 0,
      uebersprungen: 0,
      entfernt: 0,
      fehler: 2,
    })
    expect(log).toHaveBeenCalledWith(
      'gewicht-erinnerung: alte abos konnten nicht vollständig entfernt werden'
    )
  })
})
