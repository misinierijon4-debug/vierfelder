import { describe, expect, it, vi } from 'vitest'
import { sucheWeb, webQuellen, mitWebQuellen, webLage, nurGepruefteLinks, WEB_RUECKBLICK_BUDGET } from '../../supabase/functions/_shared/eniWeb'

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

describe('Eni Rueckblick auf eigene Suchlaeufe', () => {
  const lauf = (nr: number, text = 'Alter Beleg ' + nr) => ({
    wann: '2026-09-1' + nr + ' 12:00',
    quellen: [{ titel: 'Quelle ' + nr, url: 'https://example.org/' + nr, text }],
  })

  it('nennt fruehere treffer als eigene und sagt, dass diesmal nicht gesucht wurde', () => {
    const text = webLage([], [lauf(1), lauf(2)])
    expect(text).toContain('FRUEHER IN DIESEM CHAT GESUCHT')
    expect(text).toContain('schon selbst gefunden')
    expect(text).toContain('Fuer die aktuelle Frage hast du nicht gesucht')
    expect(text).toContain('Alter Beleg 1')
    expect(text).toContain('Alter Beleg 2')
    // aelteste zuerst, in der reihenfolge der antworten
    expect(text.indexOf('Alter Beleg 1')).toBeLessThan(text.indexOf('Alter Beleg 2'))
  })

  it('sagt bei frischer suche, welche treffer die neueren sind', () => {
    const text = webLage(webQuellen([quelle]), [lauf(1)])
    expect(text.indexOf('GEFUNDENE AUSZUEGE')).toBeLessThan(text.indexOf('FRUEHER IN DIESEM CHAT'))
    expect(text).toContain('Widersprechen sie sich, gilt der neuere')
    expect(text).not.toContain('Fuer die aktuelle Frage hast du nicht gesucht')
  })

  /*
    Das Budget gehoert dem juengsten Suchlauf. Titel und Adresse bleiben
    trotzdem stehen: sonst wuesste ENI nicht einmal mehr, dass er die Seite
    gelesen hat.
  */
  it('kuerzt alte auszuege zuerst und laesst titel und adresse stehen', () => {
    const lang = 'x'.repeat(WEB_RUECKBLICK_BUDGET)
    const text = webLage([], [lauf(1, 'Sehr alter Beleg'), lauf(2, lang)])
    expect(text).toContain('https://example.org/1')
    expect(text).toContain('Quelle 1')
    expect(text).not.toContain('Sehr alter Beleg')
    expect(text).toContain('[Auszug hier nicht mehr mitgeschickt.]')
  })

  it('entfernt ohne gepruefte adresse jeden link, behaelt aber die beschriftung', () => {
    const ohne = nurGepruefteLinks('Steht [hier](https://erfunden.example) drin.', [])
    expect(ohne.text).toBe('Steht hier drin.')
    expect(ohne.verlinkt.size).toBe(0)

    const mit = nurGepruefteLinks('Steht [hier](https://example.org/1) drin.', ['https://example.org/1'])
    expect(mit.text).toContain('[hier](https://example.org/1)')
    expect(mit.verlinkt.has('https://example.org/1')).toBe(true)
  })

  it('laesst eine frueher gefundene adresse verlinkt, haengt sie aber nicht noch einmal an', () => {
    const bekannt = [{ titel: 'Quelle 1', url: 'https://example.org/1', text: 'Alt' }]
    const ergebnis = mitWebQuellen('wie gesagt, [Quelle 1](https://example.org/1).', [], bekannt)
    expect(ergebnis.text).toContain('[Quelle 1](https://example.org/1)')
    expect(ergebnis.anhang).toBe('')
  })
})
