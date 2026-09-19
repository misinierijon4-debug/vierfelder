/** @vitest-environment jsdom */

import { cleanup, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { afterEach, describe, expect, it } from 'vitest'
import { EniDiagramm, liesEniDiagramm } from './EniDiagramm'

afterEach(cleanup)

const SAEULEN = JSON.stringify({
  typ: 'saeulen',
  titel: 'Jev vs. Frontier-LLM',
  untertitel: 'LLM = 1x als Referenz.',
  einheit: 'x',
  serien: [
    { name: 'Untergrenze', farbe: 'gruen' },
    { name: 'Obergrenze', farbe: 'blau' },
  ],
  daten: [
    { kategorie: 'Frontier-LLM', werte: [1, 1] },
    { kategorie: 'Jev', werte: [40, 200] },
  ],
  fussnote: 'Herstellerangabe; bislang kein unabhaengiger Benchmark.',
})

describe('ENIs natives Diagramm', () => {
  it('rendert Titel, Legende, Werte, Kategorien und Quelle als zugaengliche Saeulen', () => {
    const { container } = render(<EniDiagramm quelltext={SAEULEN} />)

    expect(screen.getByRole('figure', { name: /Diagramm: Jev vs\. Frontier-LLM/ })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Jev vs. Frontier-LLM' })).toBeInTheDocument()
    expect(screen.getByText('LLM = 1x als Referenz.')).toBeInTheDocument()
    expect(screen.getByRole('list', { name: 'Legende' })).toHaveTextContent('Untergrenze')
    expect(screen.getByRole('list', { name: 'Legende' })).toHaveTextContent('Obergrenze')
    expect(screen.getAllByText('1x')).toHaveLength(2)
    expect(screen.getByText('40x')).toBeInTheDocument()
    expect(screen.getByText('200x')).toBeInTheDocument()
    expect(screen.getAllByText('Frontier-LLM').length).toBeGreaterThan(0)
    expect(screen.getByText('Herstellerangabe; bislang kein unabhaengiger Benchmark.')).toBeInTheDocument()

    const saeule = container.querySelector('rect[data-kategorie="Jev"][data-serie="Obergrenze"]')
    expect(saeule).toHaveAttribute('rx')
    expect(container.querySelector('svg[data-ausrichtung="saeulen"]')).not.toBeNull()
  })

  it('rendert horizontale Balken samt negativen und positiven Werten', () => {
    const { container } = render(
      <EniDiagramm
        quelltext={JSON.stringify({
          typ: 'balken',
          titel: 'Punktedifferenz',
          einheit: 'Punkte',
          serien: [{ name: 'Woche', farbe: '#57b8a5' }],
          daten: [
            { kategorie: 'Erijon', werte: [-2] },
            { kategorie: 'Koray', werte: [5] },
          ],
        })}
      />
    )

    expect(container.querySelector('svg[data-ausrichtung="balken"]')).not.toBeNull()
    expect(screen.getByText('-2 Punkte')).toBeInTheDocument()
    expect(screen.getByText('5 Punkte')).toBeInTheDocument()
    expect(screen.getByRole('figure')).toHaveAccessibleName(/Erijon: Woche -2 Punkte/)
  })

  it('faengt unfertiges Streaming-JSON und unpassende Daten ruhig ab', () => {
    expect(liesEniDiagramm('{"typ":"saeulen","titel":')).toBeNull()
    expect(liesEniDiagramm(JSON.stringify({
      typ: 'saeulen',
      titel: 'Unvollstaendig',
      serien: [{ name: 'A' }, { name: 'B' }],
      daten: [{ kategorie: 'Heute', werte: [1] }],
    }))).toBeNull()

    const { container } = render(<EniDiagramm quelltext={'{"typ":"saeulen","titel":'} />)
    expect(container).toBeEmptyDOMElement()
  })
})
