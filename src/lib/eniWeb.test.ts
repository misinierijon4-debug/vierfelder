import { describe, expect, it, vi } from 'vitest'
import {
  sucheWeb,
  bereinigeSuchfrage,
  webBereit,
  webWeg,
  webQuellen,
  tavilyQuellen,
  mitWebQuellen,
  webLage,
  nurGepruefteLinks,
  WEB_RUECKBLICK_BUDGET,
} from '../../supabase/functions/_shared/eniWeb'

const quelle = { type: 'url_citation', url_citation: { url: 'https://example.org/artikel', title: 'Quelle', content: 'Belegter Inhalt' } }
const treffer = { url: 'https://example.org/artikel', title: 'Quelle', content: 'Belegter Inhalt' }

/** eine Umgebung mit genau den Schluesseln, die der Fall braucht */
const mit = (werte: Record<string, string>) => (name: string) => werte[name]
const NUR_TAVILY = mit({ TAVILY_API_KEY: 'tvly-test' })
const NUR_OPENROUTER = mit({ OPENROUTER_API_KEY: 'sk-or-test' })

describe('Eni Websuche', () => {
  it('uebernimmt nur echte Annotationen mit Webadresse und Inhalt, begrenzt und dedupliziert', () => {
    expect(webQuellen([quelle, quelle, { ...quelle, url_citation: { ...quelle.url_citation, url: 'javascript:alert(1)' } }])).toEqual([
      { url: 'https://example.org/artikel', titel: 'Quelle', text: 'Belegter Inhalt' },
    ])
    expect(webQuellen([{ type: 'url_citation', url_citation: { url: 'https://example.org' } }])).toEqual([])
  })

  it('prueft Tavilys Treffer genauso wie die des Web-Plugins', () => {
    expect(tavilyQuellen([treffer, treffer, { ...treffer, url: 'javascript:alert(1)' }])).toEqual([
      { url: 'https://example.org/artikel', titel: 'Quelle', text: 'Belegter Inhalt' },
    ])
    // ohne Auszug keine Quelle: ein blosser Titel belegt nichts
    expect(tavilyQuellen([{ url: 'https://example.org', title: 'Ohne Text', content: '  ' }])).toEqual([])
    expect(tavilyQuellen({ results: [] })).toEqual([])
  })

  /*
    Das Modell war immer kostenlos, bezahlt wurde die Suche. Der freie Weg
    geht deshalb vor, auch wenn beide Schluessel dastehen.
  */
  it('sucht kostenlos bei Tavily und holt keine Seiteninhalte nach', async () => {
    const http = vi.fn().mockResolvedValue(Response.json({ results: [treffer] }))
    const ergebnis = await sucheWeb('Wetter heute', NUR_TAVILY, undefined, http)
    expect(ergebnis).toEqual([{ url: 'https://example.org/artikel', titel: 'Quelle', text: 'Belegter Inhalt' }])
    expect(http).toHaveBeenCalledTimes(1)
    expect(http.mock.calls[0]![0]).toBe('https://api.tavily.com/search')
    const body = JSON.parse(http.mock.calls[0]![1].body)
    expect(body).toEqual({ query: 'Wetter heute', search_depth: 'basic', max_results: 5 })
    // include_raw_content waere ein zweiter Abruf je Seite und wird extra berechnet
    expect(body).not.toHaveProperty('include_raw_content')
    expect(http.mock.calls[0]![1].headers.authorization).toBe('Bearer tvly-test')
  })

  it('nimmt den freien Weg auch dann, wenn beide Schluessel gesetzt sind', async () => {
    const http = vi.fn().mockResolvedValue(Response.json({ results: [treffer] }))
    await sucheWeb('Frage', mit({ TAVILY_API_KEY: 'tvly-test', OPENROUTER_API_KEY: 'sk-or-test' }), undefined, http)
    expect(http.mock.calls[0]![0]).toBe('https://api.tavily.com/search')
  })

  it('sucht einmal und gibt keine generierten Recherchebehauptungen als Quelldaten weiter', async () => {
    const http = vi.fn().mockResolvedValue(Response.json({ choices: [{ message: { content: 'Unbelegtes', annotations: [quelle] } }] }))
    const ergebnis = await sucheWeb('Wetter heute', NUR_OPENROUTER, undefined, http)
    expect(ergebnis[0]?.text).toBe('Belegter Inhalt')
    expect(http).toHaveBeenCalledTimes(1)
    expect(http.mock.calls[0]![0]).toBe('https://openrouter.ai/api/v1/chat/completions')
    const body = JSON.parse(http.mock.calls[0]![1].body)
    expect(body.plugins).toEqual([{ id: 'web', engine: 'exa', max_results: 5 }])
    expect(body.messages[1].content).toBe('Wetter heute')
  })

  it('meldet aufgebrauchte freie Suchen und einen abgelehnten Suchschluessel ehrlich', async () => {
    for (const status of [429, 432, 433]) {
      const voll = vi.fn().mockResolvedValue(new Response('', { status }))
      await expect(sucheWeb('Frage', NUR_TAVILY, undefined, voll)).rejects.toThrow('aufgebraucht')
    }
    const falsch = vi.fn().mockResolvedValue(new Response('', { status: 401 }))
    await expect(sucheWeb('Frage', NUR_TAVILY, undefined, falsch)).rejects.toThrow('TAVILY_API_KEY')
    const leer = vi.fn().mockResolvedValue(Response.json({ results: [] }))
    await expect(sucheWeb('Frage', NUR_TAVILY, undefined, leer)).rejects.toThrow('keine auswertbaren Quellen')
  })

  it('meldet fehlendes Guthaben und leere Quellen ehrlich', async () => {
    const kosten = vi.fn().mockResolvedValue(new Response('', { status: 402 }))
    await expect(sucheWeb('Frage', NUR_OPENROUTER, undefined, kosten)).rejects.toThrow('Guthaben')
    const leer = vi.fn().mockResolvedValue(Response.json({ choices: [{ message: { content: 'Eine erfundene Antwort' } }] }))
    await expect(sucheWeb('Frage', NUR_OPENROUTER, undefined, leer)).rejects.toThrow('keine auswertbaren Quellen')
  })

  it('ruft ohne Key oder Suchfrage keinen Dienst auf', async () => {
    const http = vi.fn()
    await expect(sucheWeb('Frage', () => undefined, undefined, http)).rejects.toThrow('TAVILY_API_KEY')
    await expect(sucheWeb('', NUR_TAVILY, undefined, http)).rejects.toThrow('Suchfrage')
    expect(http).not.toHaveBeenCalled()
  })

  it('meldet Internet als bereit, sobald einer der beiden Schluessel steht', () => {
    expect(webBereit(NUR_TAVILY)).toBe(true)
    expect(webBereit(NUR_OPENROUTER)).toBe(true)
    expect(webBereit(mit({ TAVILY_API_KEY: '   ' }))).toBe(false)
    expect(webBereit(() => undefined)).toBe(false)
  })

  /* Die Oberflaeche schreibt „kostenlos" oder „kostet Guthaben" darunter. */
  it('nennt den Weg, nicht nur dass es einen gibt', () => {
    expect(webWeg(NUR_TAVILY)).toBe('tavily')
    expect(webWeg(NUR_OPENROUTER)).toBe('openrouter')
    expect(webWeg(mit({ TAVILY_API_KEY: 'tvly-test', OPENROUTER_API_KEY: 'sk-or-test' }))).toBe('tavily')
    expect(webWeg(() => undefined)).toBe(null)
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

  it('bereinigt den Botnamen Eni aus der Suchanfrage, damit Suchmaschinen nicht nach der Erdoelfirma suchen', () => {
    expect(bereinigeSuchfrage('Schau dir bitte die datei erstmal an Eni')).toBe('Schau dir bitte die datei erstmal an')
    expect(bereinigeSuchfrage('Eni, wie viele Kalorien hat ein Ei?')).toBe('wie viele Kalorien hat ein Ei?')
    expect(bereinigeSuchfrage('Hey Eni: was kostet Kreatin?')).toBe('was kostet Kreatin?')
    expect(bereinigeSuchfrage('kannst du Eni mal nachschauen')).toBe('kannst du mal nachschauen')
    expect(bereinigeSuchfrage('Eni')).toBe('Eni')
    expect(bereinigeSuchfrage('schau, Eni, mal nach dem Preis')).toBe('schau, mal nach dem Preis')
  })

  it('laesst Fragen zum Konzern Eni S.p.A. unangetastet', () => {
    // Ohne Anrede im Satz ist "Eni" das Thema und nicht der Angesprochene.
    // Wer es hier streicht, sucht nach "Aktienkurs heute" und findet nichts.
    expect(bereinigeSuchfrage('Aktienkurs Eni heute')).toBe('Aktienkurs Eni heute')
    expect(bereinigeSuchfrage('Wer ist Eni S.p.A.?')).toBe('Wer ist Eni S.p.A.?')
    expect(bereinigeSuchfrage('Aktienkurs Eni')).toBe('Aktienkurs Eni')
    expect(bereinigeSuchfrage('Eni Quartalszahlen 2026')).toBe('Eni Quartalszahlen 2026')
    // Enigma, Denim und Co. waren nie gemeint.
    expect(bereinigeSuchfrage('Was macht Enigma?')).toBe('Was macht Enigma?')
  })
})
