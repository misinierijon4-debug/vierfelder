/** @vitest-environment jsdom */

import { cleanup, render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EniStrom } from './EniStrom'
import type { EniZeile } from '../../lib/eniSpeicher'

afterEach(cleanup)

const ZEILEN: EniZeile[] = [
  { id: 'z1', rolle: 'mensch', text: 'wie stehe ich gegen koray', erstellt: '2026-09-11T18:00:00.000Z' },
  { id: 'z2', rolle: 'eni', text: 'Du hinkst beim boxen.', erstellt: '2026-09-11T18:00:05.000Z' },
]

function zeichne(onMerken = vi.fn()) {
  render(
    <EniStrom zeilen={ZEILEN} me="erijon" prueft={false} onMerken={onMerken} onAuftakt={vi.fn()} />
  )
  return onMerken
}

describe('notizen im verlauf', () => {
  it('stellt die frage nicht unter jede zeile', () => {
    // vorher standen unter jeder zeile zwei angebote. bei zwanzig zeilen sind
    // das vierzig, und der verlauf liest sich wie ein formular.
    zeichne()
    expect(screen.queryByText('Für später merken')).not.toBeInTheDocument()
    expect(screen.queryByText('Als nächsten Schritt übernehmen')).not.toBeInTheDocument()
  })

  it('zeigt beide wege erst, wenn jemand danach fragt', async () => {
    const nutzer = userEvent.setup()
    const onMerken = zeichne()

    const knoepfe = screen.getAllByRole('button', { name: 'diese zeile notieren' })
    expect(knoepfe).toHaveLength(2)
    await nutzer.click(knoepfe[1]!)

    await nutzer.click(screen.getByText('Als nächsten Schritt übernehmen'))
    expect(onMerken).toHaveBeenCalledWith(ZEILEN[1], 'aufgabe')
    // und danach ist der verlauf wieder ruhig
    expect(screen.queryByText('Als nächsten Schritt übernehmen')).not.toBeInTheDocument()
  })

  it('öffnet immer nur eine zeile und bietet an der eigenen nur das profil an', async () => {
    const nutzer = userEvent.setup()
    zeichne()
    const knoepfe = screen.getAllByRole('button', { name: 'diese zeile notieren' })

    await nutzer.click(knoepfe[0]!)
    expect(screen.getByText('Für später merken')).toBeInTheDocument()
    // die eigene zeile ist kein nächster schritt von ENI
    expect(screen.queryByText('Als nächsten Schritt übernehmen')).not.toBeInTheDocument()

    await nutzer.click(knoepfe[1]!)
    expect(screen.getAllByText('Für später merken')).toHaveLength(1)
    expect(screen.getByText('Als nächsten Schritt übernehmen')).toBeInTheDocument()
  })

  it('lässt den knopf ganz weg, wenn niemand zum merken da ist', () => {
    render(<EniStrom zeilen={ZEILEN} me="erijon" prueft={false} onAuftakt={vi.fn()} />)
    expect(screen.queryByRole('button', { name: 'diese zeile notieren' })).not.toBeInTheDocument()
  })
})

describe('nachrichtenaktionen', () => {
  it('kopiert ENIs und die eigene nachricht nur über das übliche symbol', async () => {
    const nutzer = userEvent.setup()
    const schreiben = vi.spyOn(navigator.clipboard, 'writeText')
    render(<EniStrom zeilen={ZEILEN} me="erijon" prueft={false} onAuftakt={vi.fn()} />)

    const kopieren = screen.getAllByRole('button', { name: 'nachricht kopieren' })
    expect(kopieren).toHaveLength(2)
    expect(screen.queryByText('Kopieren')).not.toBeInTheDocument()

    await nutzer.click(kopieren[0]!)
    await waitFor(() => expect(schreiben).toHaveBeenCalledWith(ZEILEN[0]!.text))
    expect(screen.getByRole('button', { name: 'kopiert' })).toBeInTheDocument()
  })

  it('bearbeitet nur eigene nachrichten und sendet den neuen text weiter', async () => {
    const onBearbeiten = vi.fn()
    const nutzer = userEvent.setup()
    render(
      <EniStrom
        zeilen={ZEILEN}
        me="erijon"
        prueft={false}
        onBearbeiten={onBearbeiten}
        onAuftakt={vi.fn()}
      />
    )

    expect(screen.getAllByRole('button', { name: 'eigene nachricht bearbeiten' })).toHaveLength(1)
    await nutzer.click(screen.getByRole('button', { name: 'eigene nachricht bearbeiten' }))
    const feld = screen.getByRole('textbox', { name: 'eigene nachricht bearbeiten' })
    await nutzer.clear(feld)
    await nutzer.type(feld, 'wie stehe ich diese woche gegen koray')
    await nutzer.click(screen.getByRole('button', { name: 'Neu absenden' }))

    expect(onBearbeiten).toHaveBeenCalledWith(
      ZEILEN[0],
      'wie stehe ich diese woche gegen koray'
    )
  })
})

describe('die auftakte im leeren chat', () => {
  function leer(feldBelegt: boolean, onAuftakt = vi.fn()) {
    render(
      <EniStrom
        zeilen={[]}
        me="erijon"
        prueft={false}
        onAuftakt={onAuftakt}
        feldBelegt={feldBelegt}
      />
    )
    return onAuftakt
  }

  it('bietet sie an, solange das feld leer ist', () => {
    leer(false)
    expect(screen.getByRole('button', { name: 'wie stehe ich gegen koray' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'abend planen' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'was soll ich heute essen' })).toBeInTheDocument()
  })

  /*
    Sie sind ein angebot fuer den fall, dass einem nichts einfaellt. Steht
    etwas im feld — angetippt oder selbst geschrieben —, ist das angebot
    angenommen und die uebrigen stehen nur noch im weg.
  */
  it('steht nicht mehr da, sobald etwas im feld steht', () => {
    leer(true)
    expect(screen.queryByRole('button', { name: 'wie stehe ich gegen koray' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'abend planen' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'was soll ich heute essen' })).toBeNull()
  })

  it('laesst den gruss und den stand stehen, die sind kein angebot', () => {
    leer(true)
    expect(screen.getByRole('heading', { level: 2 })).toBeInTheDocument()
  })

  it('bietet das abfragen an und schickt den auftrag so, wie er dasteht', async () => {
    const nutzer = userEvent.setup()
    const onAuftakt = leer(false)
    await nutzer.click(screen.getByRole('button', { name: 'frag mich ab' }))
    expect(onAuftakt).toHaveBeenCalledWith('frag mich ab')
  })

  it('stellt bei einer nahen klausur den lernplan an den anfang', async () => {
    const nutzer = userEvent.setup()
    const onAuftakt = vi.fn()
    render(
      <EniStrom
        zeilen={[]}
        me="erijon"
        prueft={false}
        duellStand={{
          ich: 'erijon', gegner: 'koray', ichName: 'Erijon', gegnerName: 'Koray',
          wocheIch: 3, wocheEr: 2, diff: 1,
          klausur: { fach: 'geschichte lk', datum: '2026-11-18', tage: 5 },
        }}
        onAuftakt={onAuftakt}
        feldBelegt={false}
      />
    )
    const knoepfe = screen.getAllByRole('button')
    const lernplan = screen.getByRole('button', { name: 'lernplan für geschichte lk · in 5 tagen' })
    expect(knoepfe.indexOf(lernplan)).toBeLessThan(knoepfe.indexOf(screen.getByRole('button', { name: 'wie stehe ich gegen koray' })))
    await nutzer.click(lernplan)
    expect(onAuftakt).toHaveBeenCalledWith('mach mir einen lernplan für meine klausur in geschichte lk am mi 18.11.')
  })

  it('bietet ohne nahe klausur keinen lernplan an', () => {
    leer(false)
    expect(screen.queryByRole('button', { name: /lernplan/ })).toBeNull()
  })

  it('reicht den vollen satz weiter, nicht die beschriftung', async () => {
    const nutzer = userEvent.setup()
    const onAuftakt = leer(false)
    await nutzer.click(screen.getByRole('button', { name: 'abend planen' }))
    expect(onAuftakt).toHaveBeenCalledWith(
      'hilf mir den abend planen: schlaf, essen und regeneration'
    )
  })
})

describe('quellenlinks aus der websuche', () => {
  const mitQuelle: EniZeile[] = [
    {
      id: 'q1',
      rolle: 'eni',
      text: 'Der Bericht steht seit gestern.\n\nQuellen der Websuche\n\n- [1. Beispiel](https://example.org/artikel)',
      erstellt: '2026-09-11T18:00:05.000Z',
    },
  ]

  it('macht die quelle der gespeicherten antwort anklickbar, ohne das fenster zu verleihen', () => {
    render(<EniStrom zeilen={mitQuelle} me="erijon" prueft={false} onAuftakt={vi.fn()} />)
    const link = screen.getByRole('link', { name: '1. Beispiel' })
    expect(link).toHaveAttribute('href', 'https://example.org/artikel')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  })

  /*
    Waehrend des Streams steht die Antwort noch nicht in der Datenbank, also hat
    auch niemand die Adresse gegen die gefundenen Quellen gehalten. Eine Seite,
    die dem Modell einen Link untergeschoben hat, darf in diesem Moment nicht
    schon anklickbar dastehen.
  */
  it('zeigt im laufenden strom nur die beschriftung, kein ziel', () => {
    render(
      <EniStrom
        zeilen={[]}
        me="erijon"
        prueft={true}
        teilAntwort="Laut [Beispiel](https://untergeschoben.example) ist es so."
        onAuftakt={vi.fn()}
      />
    )
    expect(screen.queryByRole('link')).toBeNull()
    expect(screen.getByText(/Beispiel/)).toBeInTheDocument()
    expect(screen.queryByText(/untergeschoben\.example/)).toBeNull()
  })

  it('laesst eine adresse mit fremdem schema als text stehen', () => {
    render(
      <EniStrom
        zeilen={[{ id: 'q2', rolle: 'eni', text: 'Sieh [hier](javascript:alert(1)) nach.', erstellt: '2026-09-11T18:00:05.000Z' }]}
        me="erijon"
        prueft={false}
        onAuftakt={vi.fn()}
      />
    )
    expect(screen.queryByRole('link')).toBeNull()
  })
})

describe('die struktur einer antwort', () => {
  /** der verlauf ist selbst eine liste; die antwort steht in ihrem eintrag */
  const zeichneAntwort = (text: string) => {
    const { container } = render(
      <EniStrom
        zeilen={[{ id: 'a1', rolle: 'eni', text, erstellt: '2026-09-11T18:00:05.000Z' }]}
        me="erijon"
        prueft={false}
        onAuftakt={vi.fn()}
      />
    )
    return container.querySelector('li')!
  }

  it('stellt eine ueberschrift als ueberschrift dar, statt die rauten zu zeigen', () => {
    zeichneAntwort('## Trainingsplan\n\nDrei einheiten die woche.')
    expect(screen.getByRole('heading', { name: 'Trainingsplan' })).toBeInTheDocument()
    expect(screen.queryByText(/##/)).toBeNull()
  })

  it('macht aus einer trennlinie eine linie, keine drei striche', () => {
    const nachricht = zeichneAntwort('Erster teil.\n\n---\n\nZweiter teil.')
    expect(nachricht.querySelector('hr')).not.toBeNull()
    expect(screen.queryByText('---')).toBeNull()
  })

  it('behaelt die reihenfolge einer nummerierten liste', () => {
    // vorher fiel die zahl weg und jeder punkt bekam denselben aufzaehlungspunkt.
    // bei einer anleitung ist die reihenfolge die halbe aussage.
    const nachricht = zeichneAntwort('1. aufwaermen\n2. grunduebung\n3. auslaufen')
    const liste = nachricht.querySelector('ol')
    expect(liste).not.toBeNull()
    expect(liste!.querySelectorAll('li')).toHaveLength(3)
    expect(liste!.textContent).toContain('1.')
    expect(liste!.textContent).toContain('3.')
    expect(screen.getByText('grunduebung')).toBeInTheDocument()
  })

  it('zaehlt weiter, wo das modell zu zaehlen anfaengt', () => {
    const nachricht = zeichneAntwort('3. dritter schritt\n4. vierter schritt')
    const punkte = [...nachricht.querySelectorAll('ol li')].map((li) => li.textContent)
    expect(punkte).toEqual(['3.dritter schritt', '4.vierter schritt'])
  })

  it('laesst eine aufzaehlung ohne zahlen eine aufzaehlung bleiben', () => {
    const nachricht = zeichneAntwort('- schlaf\n- essen\n- ruhe')
    expect(nachricht.querySelector('ol')).toBeNull()
    expect(nachricht.querySelectorAll('ul li')).toHaveLength(3)
    expect(screen.queryByText(/^- /)).toBeNull()
  })

  it('trennt ueberschrift und liste auch ohne leerzeile dazwischen', () => {
    const nachricht = zeichneAntwort('## Woche 1\n- montag gym\n- mittwoch boxen')
    expect(screen.getByRole('heading', { name: 'Woche 1' })).toBeInTheDocument()
    expect(nachricht.querySelectorAll('ul li')).toHaveLength(2)
  })

  it('laesst einen kurzen satz ein kurzer satz bleiben', () => {
    const nachricht = zeichneAntwort('Das reicht nicht.')
    expect(nachricht.querySelectorAll('ul, ol, hr')).toHaveLength(0)
    expect(screen.getByText('Das reicht nicht.')).toBeInTheDocument()
  })

  describe('der kernsatz', () => {
    const LANGER_ABSATZ =
      'Solide, aber nicht fehlerfrei. Die Form bleibt gleich, die Technik kommt vor dem Gewicht, und schlechte Tage werden nicht mit Gewicht bestraft. ' +
      'Schwach ist nur, dass "niemals sechs" zu absolut klingt, denn sechs schwere Wiederholungen sind ein normaler Kraftbereich.'

    it('setzt einen kurzen ersten satz als schlagzeile', () => {
      zeichneAntwort('Ja, das passt.\n\nDie Form bleibt gleich und das Gewicht steigt nur bei sauberer Technik.')
      expect(screen.getByText('Ja, das passt.')).toHaveClass('display', 'font-semibold')
      expect(screen.getByText(/^Die Form bleibt gleich/)).not.toHaveClass('font-semibold')
    })

    it('setzt einen langen ersten absatz nicht in halbfett', () => {
      // vorher stand der ganze erste absatz einer antwort als halbfette schlagzeile da
      zeichneAntwort(`${LANGER_ABSATZ}\n\nNaechster schritt: Bereich sechs bis zehn festlegen.`)
      const erster = screen.getByText(/^Solide, aber nicht fehlerfrei/)
      expect(erster).not.toHaveClass('font-semibold')
      expect(erster).not.toHaveClass('display')
    })

    it('setzt auch einen einzelnen langen absatz als normalen text', () => {
      zeichneAntwort(LANGER_ABSATZ)
      expect(screen.getByText(/^Solide, aber nicht fehlerfrei/)).not.toHaveClass('font-semibold')
    })

    it('macht einen absatz hinter einer ueberschrift nicht zur schlagzeile', () => {
      zeichneAntwort('## Plan\n\nDrei einheiten die woche.\n\nDazu einen ruhigen tag.')
      expect(screen.getByText('Drei einheiten die woche.')).not.toHaveClass('font-semibold')
    })
  })

  it('rendert einen diagramm-block zwischen normalem erklaerungstext', () => {
    const json = JSON.stringify({
      typ: 'saeulen',
      titel: 'Tempovergleich',
      einheit: 'x',
      serien: [
        { name: 'Untergrenze', farbe: 'gruen' },
        { name: 'Obergrenze', farbe: 'blau' },
      ],
      daten: [
        { kategorie: 'LLM', werte: [1, 1] },
        { kategorie: 'Jev', werte: [40, 200] },
      ],
    }, null, 2)
    zeichneAntwort(`Die Werte sind Herstellerangaben.\n\n\`\`\`diagramm\n${json}\n\`\`\`\n\nDarum ist die Quelle wichtig.`)

    expect(screen.getByText('Die Werte sind Herstellerangaben.')).toBeInTheDocument()
    expect(screen.getByRole('figure', { name: /Tempovergleich/ })).toBeInTheDocument()
    expect(screen.getByText('200x')).toBeInTheDocument()
    expect(screen.getByText('Darum ist die Quelle wichtig.')).toBeInTheDocument()
  })

  it('laesst normale codebloecke code und aktiviert darin kein diagramm', () => {
    const nachricht = zeichneAntwort('Beispiel:\n\n```json\n{"typ":"saeulen","titel":"Nur Code"}\n```')
    const code = nachricht.querySelector('pre code')

    expect(code).toHaveAttribute('data-sprache', 'json')
    expect(code).toHaveTextContent('{"typ":"saeulen","titel":"Nur Code"}')
    expect(screen.queryByRole('figure')).toBeNull()
  })

  it('zeigt bei einem unfertigen diagramm-strom keinen fehler und kein rohes json', () => {
    render(
      <EniStrom
        zeilen={[]}
        me="erijon"
        prueft={true}
        teilAntwort={'Ein Vergleich entsteht.\n\n```diagramm\n{"typ":"saeulen","titel":'}
        onAuftakt={vi.fn()}
      />
    )

    expect(screen.getByText('Ein Vergleich entsteht.')).toBeInTheDocument()
    expect(screen.queryByRole('figure')).toBeNull()
    expect(screen.queryByText(/"typ"/)).toBeNull()
  })
})

/*
  Fuers Lernen: Formeln setzt der Browser als MathML, Tabellen stehen als
  Tabelle statt als Zeilen voller senkrechter Striche.
*/
describe('formeln und tabellen in einer antwort', () => {
  const zeichneAntwort = (text: string) => {
    const { container } = render(
      <EniStrom
        zeilen={[{ id: 'a1', rolle: 'eni', text, erstellt: '2026-09-11T18:00:05.000Z' }]}
        me="erijon"
        prueft={false}
        onAuftakt={vi.fn()}
      />
    )
    return container.querySelector('li')!
  }

  it('setzt eine formel im satz als mathml, ohne dollarzeichen', () => {
    const nachricht = zeichneAntwort('Die Fläche ist $A = \\pi r^2$ bei jedem Kreis, also auch bei deinem Beispiel hier.')
    const formel = nachricht.querySelector('math')
    expect(formel).not.toBeNull()
    expect(formel!.namespaceURI).toBe('http://www.w3.org/1998/Math/MathML')
    expect(formel!.querySelector('msup')).not.toBeNull()
    expect(nachricht.textContent).not.toContain('$')
  })

  it('setzt eine abgesetzte formel als eigenen block', () => {
    const nachricht = zeichneAntwort('Die Lösung:\n\n$$x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}$$\n\nDas ist die Mitternachtsformel.')
    const formel = nachricht.querySelector('math[display="block"]')
    expect(formel).not.toBeNull()
    expect(formel!.querySelector('mfrac msqrt')).not.toBeNull()
    expect(screen.getByText('Das ist die Mitternachtsformel.')).toBeInTheDocument()
  })

  it('setzt binomialkoeffizienten im satz und abgesetzt als mathml', () => {
    // so stand die antwort zum binomischen lehrsatz da: \\binom als quelltext
    const nachricht = zeichneAntwort(
      'Dabei ist $\\binom{n}{k}$ der Binomialkoeffizient.\n\n$$\\binom{n}{k} = \\frac{n!}{k!\\,(n-k)!}$$\n\nDas Ausrufezeichen ist die Fakultät.'
    )
    expect(nachricht.querySelectorAll('math')).toHaveLength(2)
    expect(nachricht.querySelector('math[display="block"]')).not.toBeNull()
    expect(nachricht.querySelector('pre')).toBeNull()
    expect(nachricht.textContent).not.toContain('\\binom')
  })

  it('setzt fettdruck auch dann, wenn eine formel darin steht', () => {
    const nachricht = zeichneAntwort(
      'Die Rechnung von vorhin geht so weiter, Schritt für Schritt.\n\n**Beispiel mit $(a+b)^3$.** Hier ist $n=3$, du gehst $k$ von 0 bis 3 durch.'
    )
    const fett = nachricht.querySelector('strong')
    expect(fett).not.toBeNull()
    expect(fett).toHaveTextContent('Beispiel mit')
    expect(fett!.querySelector('math msup')).not.toBeNull()
    expect(nachricht.textContent).not.toContain('**')
    expect(nachricht.querySelectorAll('math')).toHaveLength(3)
  })

  it('liest sternchen in einer formel nicht als fettdruck', () => {
    const nachricht = zeichneAntwort('Das Produkt $a**b$ ist hier gemeint und **nicht** etwas anderes, das musst du beachten.')
    expect(nachricht.querySelectorAll('strong')).toHaveLength(1)
    expect(nachricht.querySelector('strong')).toHaveTextContent('nicht')
  })

  it('zeigt eine unverstandene formel als quelltext statt halb richtig', () => {
    const nachricht = zeichneAntwort('Hier steht $\\gibtsnicht{x}$ drin, und der Rest des Satzes bleibt ganz normal lesbar.')
    expect(nachricht.querySelector('math')).toBeNull()
    expect(nachricht.querySelector('code')).toHaveTextContent('$\\gibtsnicht{x}$')
  })

  it('laesst geldbetraege mit dollarzeichen text bleiben', () => {
    const nachricht = zeichneAntwort('Das kostet 5 $ und das andere 10 $, beides ist also eher günstig für dich.')
    expect(nachricht.querySelector('math')).toBeNull()
    expect(nachricht.textContent).toContain('5 $ und das andere 10 $')
  })

  it('macht aus einer markdown-tabelle eine tabelle mit kopfzeile', () => {
    const nachricht = zeichneAntwort(
      'So vergleichen sich die beiden:\n\n| Fach | Note | Trend |\n|---|:---:|---:|\n| Mathe | 11 | **+2** |\n| Bio | 9 | −1 |\n\nMathe läuft.'
    )
    const tabelle = nachricht.querySelector('table')
    expect(tabelle).not.toBeNull()
    expect(screen.getAllByRole('columnheader').map((z) => z.textContent)).toEqual(['Fach', 'Note', 'Trend'])
    expect(screen.getAllByRole('row')).toHaveLength(3)
    expect(screen.getByRole('cell', { name: '11' })).toHaveStyle({ textAlign: 'center' })
    // inline-formatierung gilt auch in zellen
    expect(tabelle!.querySelector('strong')).toHaveTextContent('+2')
    expect(nachricht.textContent).not.toContain('|---')
    expect(screen.getByText('Mathe läuft.')).toBeInTheDocument()
  })

  it('laesst eine zeile mit strichen ohne trennzeile normalen text bleiben', () => {
    const nachricht = zeichneAntwort('Entweder a | b oder c, das entscheidest du selbst nach dem Training.')
    expect(nachricht.querySelector('table')).toBeNull()
  })
})

describe('der wartetext am takt', () => {
  it('sagt ohne genaueren stand, dass ENI nachdenkt', () => {
    render(<EniStrom zeilen={[]} me="erijon" prueft={true} onAuftakt={vi.fn()} />)
    expect(screen.getByRole('status')).toHaveTextContent('ENI denkt nach …')
  })

  it('nimmt den genaueren stand, statt einen zweiten satz danebenzustellen', () => {
    // vorher standen drei texte gleichzeitig: "ENI prüft", "denkt nach …" und
    // "Eni sucht im Web …" ueber dem eingabefeld.
    render(
      <EniStrom
        zeilen={[]}
        me="erijon"
        prueft={true}
        wartetext="ENI sucht im Web …"
        onAuftakt={vi.fn()}
      />
    )
    const stand = screen.getByRole('status')
    expect(stand).toHaveTextContent('ENI sucht im Web …')
    expect(stand).not.toHaveTextContent('denkt nach')
  })
})

/*
  ENI schlaegt vor, die Person entscheidet. Erst der Tipp schreibt, mit einer
  festen id je Vorschlag, damit ein zweiter Tipp nichts doppelt anlegt.
*/
describe('vorschlaege von ENI', () => {
  const block = '```aktion\n{"typ":"einheit","bereich":"lernen","tag":"heute","wert":45}\n```'
  const zeichne = (text: string, onAktion?: (aktion: unknown, id: string) => Promise<void>, erstellt = new Date().toISOString()) =>
    render(
      <EniStrom
        zeilen={[{ id: 'antwort-1', rolle: 'eni', text, erstellt }]}
        me="erijon"
        prueft={false}
        onAuftakt={vi.fn()}
        onAktion={onAktion}
      />
    )

  beforeEach(() => {
    try { localStorage.clear() } catch { /* ohne speicher auch gut */ }
  })

  it('zeigt den vorschlag als karte und schreibt erst nach dem tipp', async () => {
    const nutzer = userEvent.setup()
    const onAktion = vi.fn().mockResolvedValue(undefined)
    zeichne(`Gut gemacht.\n\n${block}`, onAktion)

    expect(screen.getByText('45 min lernen · heute')).toBeInTheDocument()
    expect(screen.queryByText(/"typ"/)).toBeNull()
    expect(onAktion).not.toHaveBeenCalled()

    const knopf = await screen.findByRole('button', { name: 'eintragen' })
    await waitFor(() => expect(knopf).toBeEnabled())
    await nutzer.click(knopf)

    expect(onAktion).toHaveBeenCalledTimes(1)
    const [aktion, id] = onAktion.mock.calls[0]!
    expect(aktion).toMatchObject({ typ: 'einheit', bereich: 'lernen', wert: 45 })
    expect(id).toMatch(/^[0-9a-f-]{36}$/)
    expect(await screen.findByRole('status')).toHaveTextContent('eingetragen')
    expect(screen.queryByRole('button', { name: 'eintragen' })).toBeNull()
  })

  it('zeigt den grund, wenn es nicht geklappt hat, und laesst den knopf stehen', async () => {
    const nutzer = userEvent.setup()
    const onAktion = vi.fn().mockRejectedValue(new Error('ab freitag 18 uhr gibt es keine ansagen mehr — montag wieder.'))
    zeichne('```aktion\n{"typ":"ansage","feld":"lernen","stufe":"mutig"}\n```', onAktion)

    const knopf = await screen.findByRole('button', { name: 'ansagen' })
    await waitFor(() => expect(knopf).toBeEnabled())
    await nutzer.click(knopf)
    expect(await screen.findByRole('alert')).toHaveTextContent('ab freitag 18 uhr')
    expect(screen.getByRole('button', { name: 'ansagen' })).toBeInTheDocument()
  })

  it('zeigt eine aufgabe mit frist als karte und meldet sie danach als vorgemerkt', async () => {
    const nutzer = userEvent.setup()
    const onAktion = vi.fn().mockResolvedValue(undefined)
    zeichne('Mach ich.\n\n```aktion\n{"typ":"erinnerung","art":"aufgabe","text":"Referat vorbereiten","bis":"morgen"}\n```', onAktion)

    expect(screen.getByText('aufgabe · Referat vorbereiten · bis morgen')).toBeInTheDocument()
    const knopf = await screen.findByRole('button', { name: 'vormerken' })
    await waitFor(() => expect(knopf).toBeEnabled())
    await nutzer.click(knopf)

    expect(onAktion).toHaveBeenCalledWith(
      { typ: 'erinnerung', art: 'aufgabe', text: 'Referat vorbereiten', bis: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) },
      expect.stringMatching(/^[0-9a-f-]{36}$/),
    )
    expect(await screen.findByRole('status')).toHaveTextContent('vorgemerkt')
  })

  it('bietet einen alten vorschlag nicht mehr zum tippen an', () => {
    zeichne(block, vi.fn(), '2026-09-01T10:00:00.000Z')
    expect(screen.getByText('nicht mehr aktuell')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'eintragen' })).toBeNull()
  })

  it('macht aus einem unpassenden vorschlag einen satz statt eines knopfs', () => {
    zeichne('```aktion\n{"typ":"einheit","bereich":"schwimmen"}\n```', vi.fn())
    expect(screen.getByText('diesen bereich gibt es nicht.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'eintragen' })).toBeNull()
  })

  it('zeigt im laufenden strom noch keinen knopf und kein json', () => {
    render(
      <EniStrom
        zeilen={[]}
        me="erijon"
        prueft={true}
        teilAntwort={'Trag ich dir ein.\n\n```aktion\n{"typ":"einheit",'}
        onAuftakt={vi.fn()}
        onAktion={vi.fn()}
      />
    )
    expect(screen.getByText('ENI bereitet einen vorschlag vor …')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'eintragen' })).toBeNull()
    expect(screen.queryByText(/"typ"/)).toBeNull()
  })
})
