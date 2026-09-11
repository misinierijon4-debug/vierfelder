/** @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
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

  it('trennt die chats der beiden personen nicht selbst, sondern haelt nur den eigenen speicher', async () => {
    // im prototyp gibt es nur ein geraet und einen speicher. die trennung
    // zwischen erijon und koray macht in der echten fassung die row level
    // security in supabase, nicht dieser code hier.
    const speicher = lokalerEniSpeicher('erijon')
    await speicher.neuerChat('einer')
    expect(await lokalerEniSpeicher('koray').chats()).toHaveLength(1)
  })
})
