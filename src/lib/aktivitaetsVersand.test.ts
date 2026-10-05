import type { sende } from '../../supabase/functions/_shared/webpush'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { versendeAktivitaeten } from '../../supabase/functions/_shared/aktivitaetsVersand'

const kandidat = {
  user_id: 'test',
  art: 'lesen' as const,
  tag: '2026-09-07',
  sendetag: '2026-09-07',
  nachricht: 'lesen?',
  url: './' as const,
}
const key = { oeffentlich: '', privat: '', kontakt: '' }
let rpc: ReturnType<typeof vi.fn>
let senden: ReturnType<typeof vi.fn<typeof sende>>
let update: ReturnType<typeof vi.fn>
type VersandDb = Parameters<typeof versendeAktivitaeten>[0]
let db: VersandDb
const jetzt = () => new Date('2026-09-07T19:00:00Z')

beforeEach(() => {
  rpc = vi.fn().mockImplementation(async (name: string) => ({ data: name === 'reserviere_aktivitaetsversand' ? true : [kandidat], error: null }))
  senden = vi.fn().mockResolvedValue({ status: 201, weg: false, fehler: null })
  update = vi.fn().mockReturnValue({ match: () => ({ select: () => ({ maybeSingle: async () => ({ data: { art: 'lesen' }, error: null }) }) }) })
  db = { rpc, from: () => ({
    select: () => ({ eq: async () => ({ data: [{ endpoint: 'https://web.push.apple.com/test', p256dh: '', auth: '' }], error: null }) }),
    update,
  }) } as unknown as VersandDb
})

describe('aktivitaeten ohne doppelte oder veraltete Pushs', () => {
  it('sendet frisch gelesenen Text mit TTL 0', async () => {
    rpc.mockResolvedValueOnce({ data: [kandidat] }).mockResolvedValueOnce({ data: true })
      .mockResolvedValueOnce({ data: [{ ...kandidat, nachricht: 'aktuell' }] })
    expect(await versendeAktivitaeten(db, key, { senden, jetzt })).toEqual({ gesendet: 1, fehler: 0, uebersprungen: 0 })
    expect(senden).toHaveBeenCalledWith(expect.anything(), expect.stringContaining('aktuell'), key, 0)
  })
  it('unterdrueckt einen parallelen zweiten Aufruf ohne Reservierung', async () => {
    rpc.mockResolvedValueOnce({ data: [kandidat] }).mockResolvedValueOnce({ data: false })
    await versendeAktivitaeten(db, key, { senden, jetzt })
    expect(senden).not.toHaveBeenCalled()
  })
  it('sendet nicht, wenn inzwischen erledigt, ausgeschaltet oder eine Sitzung gestartet wurde', async () => {
    rpc.mockResolvedValueOnce({ data: [kandidat] }).mockResolvedValueOnce({ data: true }).mockResolvedValueOnce({ data: [] })
    await versendeAktivitaeten(db, key, { senden, jetzt })
    expect(senden).not.toHaveBeenCalled()
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ zustand: 'uebersprungen' }))
  })
  it('bricht bei Datenbankfehler vor Versand ab', async () => {
    rpc.mockResolvedValueOnce({ data: [kandidat] }).mockResolvedValueOnce({ data: true })
      .mockResolvedValueOnce({ error: { message: 'offline' } })
    const result = await versendeAktivitaeten(db, key, { senden, jetzt })
    expect(result.fehler).toBe(1)
    expect(senden).not.toHaveBeenCalled()
  })
  it('sendet auch bei veraltetem Kandidaten nach 22 Uhr nicht', async () => {
    await versendeAktivitaeten(db, key, { senden, jetzt: () => new Date('2026-09-07T20:00:00Z') })
    expect(senden).not.toHaveBeenCalled()
  })
  it('meldet den fertigen Wochenbericht nur am Montag zwischen 07 und 21 Uhr', async () => {
    // Der Tag ist der Berichtsmontag, der Sendetag der Montag danach.
    const bericht = {
      ...kandidat,
      art: 'wochenbericht' as const,
      tag: '2026-09-14',
      sendetag: '2026-09-21',
      nachricht: 'dein wochenbericht für letzte woche ist fertig.',
      url: './#/bericht?woche=2026-09-14' as const,
    }
    rpc.mockImplementation(async (name: string) =>
      ({ data: name === 'reserviere_aktivitaetsversand' ? true : [bericht], error: null }))

    // Montag 04:50 Berlin: die Naechte sind da, der Mensch schlaeft noch.
    await versendeAktivitaeten(db, key, { senden, jetzt: () => new Date('2026-09-21T02:50:00Z') })
    expect(senden).not.toHaveBeenCalled()

    // Montag 09:00 Berlin.
    await versendeAktivitaeten(db, key, { senden, jetzt: () => new Date('2026-09-21T07:00:00Z') })
    expect(senden).toHaveBeenCalledWith(expect.anything(),
      expect.stringContaining('./#/bericht?woche=2026-09-14'), key, 0)

    // Dienstag 09:00 Berlin: der Worker ist die letzte Schranke, falls ein
    // Lauf ueber Mitternacht haengt. Eine Montagsmeldung geht dann gar nicht.
    senden.mockClear()
    rpc.mockImplementation(async (name: string) =>
      ({ data: name === 'reserviere_aktivitaetsversand' ? true : [{ ...bericht, sendetag: '2026-09-22' }], error: null }))
    await versendeAktivitaeten(db, key, { senden, jetzt: () => new Date('2026-09-22T07:00:00Z') })
    expect(senden).not.toHaveBeenCalled()
  })
  it('meldet eine ansage am selben tag zwischen 08 und 22 uhr', async () => {
    const ansage = {
      ...kandidat,
      art: 'ansage' as const,
      tag: '2026-09-22',
      sendetag: '2026-09-22',
      nachricht: 'koray sagt an: 2× boxen bis samstag. zeig, dass es geht.',
    }
    rpc.mockImplementation(async (name: string) =>
      ({ data: name === 'reserviere_aktivitaetsversand' ? true : [ansage], error: null }))

    // Dienstag 07:30 Berlin: noch zu früh
    await versendeAktivitaeten(db, key, { senden, jetzt: () => new Date('2026-09-22T05:30:00Z') })
    expect(senden).not.toHaveBeenCalled()

    // Dienstag 12:00 Berlin
    await versendeAktivitaeten(db, key, { senden, jetzt: () => new Date('2026-09-22T10:00:00Z') })
    expect(senden).toHaveBeenCalledWith(expect.anything(), expect.stringContaining('2× boxen'), key, 0)

    // Dienstag 22:00 Berlin: vorbei
    senden.mockClear()
    await versendeAktivitaeten(db, key, { senden, jetzt: () => new Date('2026-09-22T20:00:00Z') })
    expect(senden).not.toHaveBeenCalled()
  })
  it('meldet faellige aufgaben nur morgens zwischen 08:30 und 10 uhr und oeffnet ENI', async () => {
    const faellig = {
      ...kandidat,
      art: 'aufgabe' as const,
      tag: '2026-10-01',
      sendetag: '2026-10-01',
      nachricht: 'heute fällig: Boxhandschuhe waschen',
      url: './#/eni' as const,
    }
    rpc.mockImplementation(async (name: string) =>
      ({ data: name === 'reserviere_aktivitaetsversand' ? true : [faellig], error: null }))

    // Donnerstag 08:20 Berlin: noch zu früh
    await versendeAktivitaeten(db, key, { senden, jetzt: () => new Date('2026-10-01T06:20:00Z') })
    expect(senden).not.toHaveBeenCalled()

    // Donnerstag 08:40 Berlin
    await versendeAktivitaeten(db, key, { senden, jetzt: () => new Date('2026-10-01T06:40:00Z') })
    expect(senden).toHaveBeenCalledWith(expect.anything(), expect.stringContaining('Boxhandschuhe'), key, 0)
    expect(JSON.parse(senden.mock.calls[0]![1] as string)).toMatchObject({ tag: 'aufgabe', url: './#/eni' })

    // Donnerstag 10:00 Berlin: vorbei
    senden.mockClear()
    await versendeAktivitaeten(db, key, { senden, jetzt: () => new Date('2026-10-01T08:00:00Z') })
    expect(senden).not.toHaveBeenCalled()
  })
  it('meldet klausuren abends zwischen 17 und 19 uhr und oeffnet den abi-tab', async () => {
    const klausur = {
      ...kandidat,
      art: 'klausur' as const,
      tag: '2026-11-17',
      sendetag: '2026-11-17',
      nachricht: 'morgen klausur: geschichte lk, 08:00–12:00. koray schreibt sie auch.',
      url: './#/abi' as const,
    }
    rpc.mockImplementation(async (name: string) =>
      ({ data: name === 'reserviere_aktivitaetsversand' ? true : [klausur], error: null }))

    // Dienstag 16:50 Berlin (Winterzeit): noch zu früh
    await versendeAktivitaeten(db, key, { senden, jetzt: () => new Date('2026-11-17T15:50:00Z') })
    expect(senden).not.toHaveBeenCalled()

    // Dienstag 17:30 Berlin
    await versendeAktivitaeten(db, key, { senden, jetzt: () => new Date('2026-11-17T16:30:00Z') })
    expect(senden).toHaveBeenCalledWith(expect.anything(), expect.stringContaining('geschichte lk'), key, 0)
    expect(JSON.parse(senden.mock.calls[0]![1] as string)).toMatchObject({ tag: 'klausur', url: './#/abi' })

    // Dienstag 19:00 Berlin: vorbei
    senden.mockClear()
    await versendeAktivitaeten(db, key, { senden, jetzt: () => new Date('2026-11-17T18:00:00Z') })
    expect(senden).not.toHaveBeenCalled()
  })
  it('schickt den sonntagsstand erst ab 18:10, wenn die ansagen entschieden sind', async () => {
    const sonntag = {
      ...kandidat,
      art: 'wochenblick' as const,
      tag: '2026-10-04',
      sendetag: '2026-10-04',
      nachricht: 'sonntagsstand: du 3, koray 4. dir fehlt 1 punkt. heute noch offen: lesen.',
    }
    rpc.mockImplementation(async (name: string) =>
      ({ data: name === 'reserviere_aktivitaetsversand' ? true : [sonntag], error: null }))
    await versendeAktivitaeten(db, key, { senden, jetzt: () => new Date('2026-10-04T16:05:00Z') })
    expect(senden).not.toHaveBeenCalled()
    await versendeAktivitaeten(db, key, { senden, jetzt: () => new Date('2026-10-04T16:15:00Z') })
    expect(senden).toHaveBeenCalledWith(expect.anything(), expect.stringContaining('dir fehlt 1 punkt'), key, 0)
  })
  it('bewahrt eine unklare Providerantwort ohne Freigabe zum Wiederholen', async () => {
    senden.mockRejectedValue(new Error('timeout'))
    await versendeAktivitaeten(db, key, { senden, jetzt })
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ zustand: 'unbestaetigt' }))
    expect(rpc.mock.calls.filter(([name]) => name === 'reserviere_aktivitaetsversand')).toHaveLength(1)
  })
})
