/** @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { chatTitel, lokalerEniSpeicher } from './eniSpeicher'

beforeEach(() => localStorage.clear())
afterEach(() => localStorage.clear())

describe('der titel eines chats', () => {
  it('ist die erste vorlage, auf eine zeile gebracht', () => {
    expect(chatTitel('  koray   liegt\nvorne  ')).toBe('koray liegt vorne')
  })

  it('kuerzt lange vorlagen, statt die liste zu sprengen', () => {
    const titel = chatTitel('a'.repeat(80))
    expect(titel).toHaveLength(48)
    expect(titel.endsWith('…')).toBe(true)
  })

  it('bleibt lesbar, wenn die vorlage nur leerzeichen war', () => {
    expect(chatTitel('   ')).toBe('ohne titel')
  })
})

describe('der lokale verlauf', () => {
  it('legt einen chat an, schreibt hinein und liest ihn wieder', async () => {
    const speicher = lokalerEniSpeicher('koray')
    expect(await speicher.person()).toBe('koray')
    expect(await speicher.chats()).toEqual([])

    const chat = await speicher.neuerChat('boxen steht')
    await speicher.schreibe(chat.id, 'mensch', 'boxen steht')
    await speicher.schreibe(chat.id, 'eni', 'das war heute.')

    const zeilen = await speicher.nachrichten(chat.id)
    expect(zeilen.map((zeile) => zeile.rolle)).toEqual(['mensch', 'eni'])
    expect(zeilen[1]?.text).toBe('das war heute.')
    expect(await speicher.chats()).toHaveLength(1)
  })

  it('sortiert den verlauf nach der letzten nachricht, nicht nach der anlage', async () => {
    const speicher = lokalerEniSpeicher('erijon')
    const alt = await speicher.neuerChat('alt')
    const neu = await speicher.neuerChat('neu')

    await speicher.schreibe(neu.id, 'mensch', 'zuerst')
    await new Promise((weiter) => setTimeout(weiter, 2))
    await speicher.schreibe(alt.id, 'mensch', 'danach')

    expect((await speicher.chats()).map((chat) => chat.titel)).toEqual(['alt', 'neu'])
  })

  it('nimmt beim loeschen die nachrichten mit', async () => {
    const speicher = lokalerEniSpeicher('erijon')
    const chat = await speicher.neuerChat('weg damit')
    await speicher.schreibe(chat.id, 'mensch', 'weg damit')

    await speicher.loesche(chat.id)

    expect(await speicher.chats()).toEqual([])
    expect(await speicher.nachrichten(chat.id)).toEqual([])
  })

  it('ersetzt eine eigene vorlage und schneidet den spaeteren verlauf ab', async () => {
    const speicher = lokalerEniSpeicher('erijon')
    const chat = await speicher.neuerChat('mein tag')
    const erste = await speicher.schreibe(chat.id, 'mensch', 'ich trainiere heute')
    await speicher.schreibe(chat.id, 'eni', 'gute entscheidung.')
    await speicher.schreibe(chat.id, 'mensch', 'danach esse ich nichts')
    await speicher.schreibe(chat.id, 'eni', 'das waere keine gute idee.')

    const bearbeitet = await speicher.bearbeite(
      chat.id,
      erste.id,
      'ich trainiere morgen'
    )

    expect(bearbeitet).toMatchObject({ id: erste.id, rolle: 'mensch', text: 'ich trainiere morgen' })
    expect(await speicher.nachrichten(chat.id)).toEqual([bearbeitet])
  })

  it('laesst ENIs antworten nicht als eigene vorlage bearbeiten', async () => {
    const speicher = lokalerEniSpeicher('erijon')
    const chat = await speicher.neuerChat('mein tag')
    const eni = await speicher.schreibe(chat.id, 'eni', 'bleib dran.')

    await expect(speicher.bearbeite(chat.id, eni.id, 'anders')).rejects.toThrow(/eigene nachricht/)
    expect(await speicher.nachrichten(chat.id)).toEqual([eni])
  })

  it('trennt die chats der beiden personen nicht selbst, sondern haelt nur den eigenen speicher', async () => {
    // im prototyp gibt es nur ein geraet und einen speicher. die trennung
    // zwischen erijon und koray macht in der echten fassung die row level
    // security in supabase, nicht dieser code hier.
    const speicher = lokalerEniSpeicher('erijon')
    await speicher.neuerChat('einer')
    expect(await lokalerEniSpeicher('koray').chats()).toHaveLength(1)
  })
})

/**
 * Der Stand im Begruessungsschirm. Er zaehlte nur die Zeilen aus `einheiten`
 * und zeigte damit 1:1, wo 5:3 stand: ohne Messungen, ohne Gewicht und ohne
 * Entdopplung. Jetzt zaehlt er wie der Tracker.
 *
 * Die Uhr steht fest, weil der Prototyp seine Messungen als Beispiele einer
 * laufenden Woche erzeugt — an einem Montag stuende sonst etwas anderes da als
 * an einem Freitag.
 */
describe('der duellstand im prototyp', () => {
  // donnerstag, 10:00 in Berlin. die woche beginnt am montag, dem 14.09.
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-17T08:00:00Z'))
  })
  afterEach(() => vi.useRealTimers())

  const einheit = (user: string, area: string, tag: string) => ({
    id: `${user}-${area}-${tag}`,
    user,
    area,
    tag,
    wert: null,
    erfasst: `${tag}T09:00:00.000Z`,
  })

  /**
   * die beispielmessungen der woche, die jeder prototyp-zustand mitbringt:
   * erijon gym am montag, boxen und lernen am dienstag, gym heute — vier
   * punkte. koray gym am montag, gym und lesen am mittwoch — drei.
   */
  it('zaehlt die messungen mit, die der tracker auch zaehlt', async () => {
    const stand = await lokalerEniSpeicher('erijon').duellStand!()
    expect(stand).toMatchObject({ wocheIch: 4, wocheEr: 3, diff: 1 })
  })

  it('nimmt das gewicht als fuenftes feld dazu', async () => {
    localStorage.setItem('vierfelder.gewicht.v1', JSON.stringify({ 'erijon|2026-09-17': 81.4 }))
    const stand = await lokalerEniSpeicher('erijon').duellStand!()
    expect(stand).toMatchObject({ wocheIch: 5, wocheEr: 3, diff: 2 })
  })

  it('gibt fuer einen haken auf einer gemessenen einheit keinen zweiten punkt', async () => {
    // erijon hat heute eine gemessene gym-einheit. der haken daneben zaehlt nicht
    localStorage.setItem(
      'vierfelder.einheiten.v1',
      JSON.stringify([einheit('erijon', 'gym', '2026-09-17')])
    )
    const stand = await lokalerEniSpeicher('erijon').duellStand!()
    expect(stand?.wocheIch).toBe(4)
  })

  it('zaehlt einen getippten bereich, den keine messung deckt, genau einmal', async () => {
    localStorage.setItem(
      'vierfelder.einheiten.v1',
      JSON.stringify([
        einheit('erijon', 'lesen', '2026-09-17'),
        // zweimal derselbe bereich am selben tag bleibt ein punkt
        { ...einheit('erijon', 'lesen', '2026-09-17'), id: 'zweiter-haken' },
      ])
    )
    const stand = await lokalerEniSpeicher('erijon').duellStand!()
    expect(stand?.wocheIch).toBe(5)
  })

  it('dreht die seiten um, wenn koray fragt', async () => {
    const stand = await lokalerEniSpeicher('koray').duellStand!()
    expect(stand).toMatchObject({
      ich: 'koray',
      gegner: 'erijon',
      ichName: 'Koray',
      wocheIch: 3,
      wocheEr: 4,
      diff: -1,
    })
  })
})
