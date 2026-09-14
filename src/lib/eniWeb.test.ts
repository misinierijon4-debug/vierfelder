import { describe, expect, it, vi } from 'vitest'
import { sucheWeb, webQuellen, mitWebQuellen } from '../../supabase/functions/_shared/eniWeb'

const quelle = { type: 'url_citation', url_citation: { url: 'https://example.org/artikel', title: 'Quelle', content: 'Belegter Inhalt' } }
describe('Eni Websuche', () => {
  it('uebernimmt nur echte Annotationen mit Webadresse und Inhalt, begrenzt und dedupliziert', () => {
    expect(webQuellen([quelle, quelle, { ...quelle, url_citation: { ...quelle.url_citation, url: 'javascript:alert(1)' } }])).toEqual([
      { url: 'https://example.org/artikel', titel: 'Quelle', text: 'Belegter Inhalt' },
    ])
    expect(webQuellen([{ type: 'url_citation', url_citation: { url: 'https://example.org' } }])).toEqual([])
  })
  it('sucht einmal und gibt keine generierten Recherchebehauptungen als Quelldaten weiter', async () => {
    const http = vi.fn().mockResolvedValue(Response.json({ choices: [{ message: { content: 'Unbelegtes', annotations: [quelle] } }] }))
    const ergebnis = await sucheWeb('Wetter heute', () => 'test-key', undefined, http)
    expect(ergebnis[0]?.text).toBe('Belegter Inhalt')
    expect(http).toHaveBeenCalledTimes(1)
    const body = JSON.parse(http.mock.calls[0]![1].body)
    expect(body.plugins).toEqual([{ id: 'web', engine: 'exa', max_results: 5 }])
    expect(body.messages[1].content).toBe('Wetter heute')
  })
  it('meldet fehlendes Guthaben und leere Quellen ehrlich', async () => {
    const kosten = vi.fn().mockResolvedValue(new Response('', { status: 402 }))
    await expect(sucheWeb('Frage', () => 'test', undefined, kosten)).rejects.toThrow('Guthaben')
    const leer = vi.fn().mockResolvedValue(Response.json({ choices: [{ message: { content: 'Eine erfundene Antwort' } }] }))
    await expect(sucheWeb('Frage', () => 'test', undefined, leer)).rejects.toThrow('keine auswertbaren Quellen')
  })
  it('ruft ohne Key oder Suchfrage keinen Dienst auf', async () => {
    const http = vi.fn()
    await expect(sucheWeb('Frage', () => undefined, undefined, http)).rejects.toThrow('OPENROUTER_API_KEY')
    await expect(sucheWeb('', () => 'test', undefined, http)).rejects.toThrow('Suchfrage')
    expect(http).not.toHaveBeenCalled()
  })
  it('speichert nachgewiesene Quellen und entfernt erfundene Markdown-Links', () => {
    const text = mitWebQuellen('[falsch](https://falsch.example) und [richtig](https://example.org/artikel)', webQuellen([quelle]))
    expect(text).not.toContain('https://falsch.example')
    expect(text).toContain('Quellen der Websuche')
    expect(text).toContain('[1. Quelle](https://example.org/artikel)')
  })
})
