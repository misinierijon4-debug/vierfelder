/** @vitest-environment jsdom */

import { cleanup, render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
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
