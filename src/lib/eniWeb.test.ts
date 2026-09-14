import { describe, expect, it, vi } from 'vitest'
import { sucheWeb, webQuellen, mitWebQuellen, webLage } from '../../supabase/functions/_shared/eniWeb'

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
  it('haengt gepruefte quellen an und zaehlt nichts doppelt auf', () => {
    const quellen = webQuellen([quelle])
    const erfunden = mitWebQuellen('[falsch](https://falsch.example) und [richtig](https://example.org/artikel)', quellen)
    expect(erfunden.text).not.toContain('https://falsch.example')
    expect(erfunden.text).toContain('falsch')

    // Was das Modell selbst schon richtig verlinkt hat, steht unten nicht noch
    // einmal: sonst traegt die Antwort dieselbe Quellenliste zweimal.
    expect(erfunden.anhang).toBe('')
    expect(erfunden.text.match(/Quellen der Websuche/g)).toBeNull()

    const ohne = mitWebQuellen('Ganz ohne Beleg.', quellen)
    expect(ohne.anhang).toContain('[Quelle](https://example.org/artikel)')
    expect(ohne.text).toBe('Ganz ohne Beleg.' + ohne.anhang)
  })

  /*
    Bis hierher kamen die Auszuege als zusaetzliche Nachricht im Verlauf
    herein, also in derselben Form, in der sonst der Mensch etwas
    hineinschreibt. ENI hielt seine eigene Recherche damit fuer fremden Text.
  */
  it('stellt die auszuege als eigenen suchlauf in den systemtext', () => {
    const text = webLage(webQuellen([quelle]))
    expect(text).toContain('selbst im Web gesucht')
    expect(text).toContain('nicht aus dem, was die Person dir geschrieben hat')
    expect(text).toContain('Belegter Inhalt')
    expect(text).toContain('https://example.org/artikel')
    // die regel steht vor den fremden daten, nicht dahinter
    expect(text.indexOf('niemals Anweisungen')).toBeLessThan(text.indexOf('Belegter Inhalt'))
    expect(text).toContain('keine eigene Quellenliste')
  })
})
