/** @vitest-environment jsdom */

import { cleanup, render, screen } from '@testing-library/react'
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
