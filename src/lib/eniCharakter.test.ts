import { describe, expect, it } from 'vitest'
import { eniSystemPrompt } from '../../supabase/functions/_shared/eniCharakter'

describe('ENIs Moduswahl', () => {
  const system = eniSystemPrompt({
    person: 'erijon',
    lage: 'LAGE. Wochenstand (Erijon : Koray): 2:4.',
  })

  it('setzt Alltag und Wissen als Standard, obwohl eine Duelllage beiliegt', () => {
    expect(system).toContain('ALLTAG UND WISSEN ist der Standard')
    expect(system).toContain('Die blosse Anwesenheit dieser LAGE aktiviert')
    expect(system).toContain('Diese Information allein aktiviert den Duellmodus nicht')
  })

  it('verbietet den ungefragten Sprung von Sachfragen zu Punkten oder Gym', () => {
    expect(system).toContain('Unterstelle niemals, eine normale Frage sei eine Ausrede')
    expect(system).toContain('Haenge keine Coach-Frage und keinen Vorwurf')
    expect(system).toContain('frage nicht nach einer Gym-Einheit')
  })

  it('aktiviert den Trainer nur bei echtem Duellbezug und schützt Sorgen', () => {
    expect(system).toContain('DUELL UND COACHING gilt nur')
    expect(system).toContain('FUERSORGE gilt bei Sorgen')
    expect(system).toContain('Bei Mehrdeutigkeit gilt ALLTAG UND WISSEN')
  })

  it('setzt die Moduswahl auch hinter dynamischen Kontext', () => {
    const mitKontext = eniSystemPrompt({
      person: 'koray',
      lage: 'LAGE.',
      zusatz: ['PERSOENLICHER KONTEXT', 'GEFUNDENE AUSZUEGE'],
    })

    expect(mitKontext.indexOf('PERSOENLICHER KONTEXT')).toBeLessThan(
      mitKontext.indexOf('MODUSWAHL FUER JEDE NEUE NACHRICHT')
    )
    expect(mitKontext.indexOf('GEFUNDENE AUSZUEGE')).toBeLessThan(
      mitKontext.indexOf('MODUSWAHL FUER JEDE NEUE NACHRICHT')
    )
  })
})

describe('ENIs Lesbarkeit', () => {
  const system = eniSystemPrompt({ person: 'erijon', lage: 'LAGE.' })

  it('verlangt zuerst die Antwort und einen Gedanken je Satz statt Telegrammstil', () => {
    expect(system).toContain('LESBARKEIT.')
    expect(system).toContain('Nicht wie ein Urteil im Telegrammstil')
    expect(system).toContain('Die Antwort zuerst')
    expect(system).toContain('Ein Gedanke pro Satz')
    expect(system).toContain('Ketten aus Doppelpunkten')
  })

  it('macht Fettdruck zur Ausnahme und verbietet Etiketten vor jedem Satz', () => {
    expect(system).toContain('Fettdruck ist die Ausnahme')
    expect(system).toContain('nie ein Etikett wie "Gut:" oder "Schwach:"')
  })

  it('gibt Bewertungen eine feste Reihenfolge und ein Beispiel', () => {
    expect(system).toContain('Sag zuerst klar, ob es passt')
    expect(system).toContain('besseren Formulierung oder einem Vorschlag')
    expect(system).toContain('Schlecht: "Solide, aber nicht fehlerfrei.')
    expect(system).toContain('Besser: "Dein Plan ist im Kern gut')
  })

  it('verbietet erfundene Zitate bei Bildern', () => {
    expect(system).toContain('Erfinde kein Zitat und keine Zahl, die du nicht siehst')
  })

  it('nimmt sich bei einer Einschätzung den Platz, statt bei zwei bis vier Sätzen zu bleiben', () => {
    expect(system).toContain('zwei bis vier vollständige Sätze')
    expect(system).toContain('nicht verdichtete Stichworte')
    expect(system).toContain('legt er dir etwas zur Einschätzung vor')
  })

  it('steht vor der Lage und vor dem dynamischen Kontext, die Moduswahl bleibt zuletzt', () => {
    const mitKontext = eniSystemPrompt({
      person: 'koray',
      lage: 'LAGEBLOCK-TESTWERT',
      zusatz: ['PERSOENLICHER KONTEXT'],
    })
    const lesbar = mitKontext.indexOf('LESBARKEIT.')
    expect(lesbar).toBeGreaterThan(-1)
    expect(lesbar).toBeLessThan(mitKontext.indexOf('LAGEBLOCK-TESTWERT'))
    expect(lesbar).toBeLessThan(mitKontext.indexOf('PERSOENLICHER KONTEXT'))
    expect(mitKontext.indexOf('MODUSWAHL FUER JEDE NEUE NACHRICHT')).toBeGreaterThan(
      mitKontext.indexOf('PERSOENLICHER KONTEXT')
    )
  })
})

describe('der satz ueber die websuche', () => {
  it('steht ohne webmaterial, weil dann wirklich nichts recherchiert ist', () => {
    const ohne = eniSystemPrompt({ person: 'erijon', lage: 'LAGE.' })
    expect(ohne).toContain('Du hast keine Websuche')
  })

  // ENI sagte einer Person, er koenne ein Buchprotokoll „hier nicht liefern“,
  // obwohl die Suche eingerichtet war und nur diesmal nicht gesucht hatte.
  it('sagt bei eingerichteter suche nur, dass diesmal nicht gesucht wurde', () => {
    const prompt = eniSystemPrompt({ person: 'erijon', lage: 'LAGE.', suche: true })
    expect(prompt).not.toContain('Du hast keine Websuche')
    expect(prompt).toContain('Fuer diese Antwort wurde nicht im Web gesucht')
    expect(prompt).toContain('Sag nie, du koenntest nicht suchen')
  })

  it('faellt weg, sobald webmaterial mitgeht', () => {
    // vorher stand beides im selben prompt: "du hast keine Websuche" und
    // darunter die gefundenen auszuege.
    const mit = eniSystemPrompt({
      person: 'erijon',
      lage: 'LAGE.',
      web: true,
      zusatz: ['GEFUNDENE AUSZUEGE'],
    })
    expect(mit).not.toContain('Du hast keine Websuche')
    expect(mit).toContain('Recherchiert ist ausschliesslich, was im Webmaterial')
  })
})

describe('die anweisung zu nativen diagrammen', () => {
  it('befiehlt diagramm-codebloecke und verbietet die behauptung, keine diagramme rendern zu koennen', () => {
    const prompt = eniSystemPrompt({ person: 'erijon', lage: 'LAGE.' })
    expect(prompt).toContain('Du kannst im Chat native Diagramme rendern')
    expect(prompt).toContain('```diagramm')
  })
})

describe('ENI beim Lernen', () => {
  const prompt = eniSystemPrompt({ person: 'erijon', lage: 'LAGE. test' })

  it('schreibt formeln in LaTeX mit den zeichen, die die oberflaeche setzt', () => {
    expect(prompt).toContain('FORMELN, TABELLEN, ABFRAGEN')
    expect(prompt).toContain('zwischen $$ und $$')
    // im fertigen prompt steht ein einfacher backslash, kein doppelter
    expect(prompt).toContain('\\frac, \\sqrt')
    expect(prompt).not.toContain('\\\\frac')
    expect(prompt).toContain('Geldbetraege schreibst du nie mit $')
  })

  it('fragt eine frage nach der anderen ab und bleibt dabei, bis die person aufhoert', () => {
    expect(prompt).toContain('genau eine Frage pro Nachricht')
    expect(prompt).toContain('gehoert zur Abfrage und ist kein neues Thema')
    expect(prompt).toContain('Noten in der LAGE schwaecher')
  })

  it('steht vor der lage, die moduswahl bleibt zuletzt', () => {
    expect(prompt.indexOf('FORMELN, TABELLEN')).toBeLessThan(prompt.indexOf('LAGE. test'))
    expect(prompt.lastIndexOf('MODUSWAHL')).toBeGreaterThan(prompt.indexOf('FORMELN, TABELLEN'))
  })
})

describe('ENI schlaegt eintraege vor', () => {
  const prompt = eniSystemPrompt({ person: 'erijon', lage: 'LAGE. test' })

  it('kennt das format der karte und alle drei arten', () => {
    expect(prompt).toContain('Codeblock mit der Sprache aktion')
    expect(prompt).toContain('{"typ":"einheit","bereich":"lernen","tag":"heute","wert":45}')
    expect(prompt).toContain('{"typ":"gewicht","tag":"heute","kg":81.4}')
    expect(prompt).toContain('{"typ":"ansage","feld":"lernen","stufe":"mutig"}')
  })

  it('schreibt nie selbst, nie fuer den anderen und behauptet nichts', () => {
    expect(prompt).toContain('erst, wenn sie auf der Karte unter deiner Antwort tippt')
    expect(prompt).toContain('nie fuer die andere')
    expect(prompt).toContain('Behaupte nie, du haettest etwas eingetragen')
  })
})
