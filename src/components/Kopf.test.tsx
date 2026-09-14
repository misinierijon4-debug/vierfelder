/** @vitest-environment jsdom */

import { cleanup, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { afterEach, describe, expect, it } from 'vitest'
import { berechneDuell } from '../lib/duell'
import { weekDays } from '../lib/dates'
import type { Zustand } from '../lib/types'
import { Kopf } from './Kopf'

afterEach(cleanup)

const ZUSTAND: Zustand = { einheiten: {}, gewichte: {}, aufenthalte: [] }

describe('Kopf Icons', () => {
  it('versteckt den rein dekorativen Pokal vor Hilfstechnologien', () => {
    const heute = new Date(2026, 8, 6, 19)
    const woche = weekDays(heute)
    const match = berechneDuell(ZUSTAND, woche, woche[6]!, 'erijon')
    const { container } = render(
      <Kopf
        heute={heute}
        woche={woche}
        zustand={ZUSTAND}
        me="erijon"
        match={match}
        bilanzzeit
        onEni={() => {}}
      />
    )

    expect(screen.getByRole('heading', { name: 'woche unentschieden' })).toBeInTheDocument()
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })

  it('nennt den tagesstand genau einmal und haelt den schmalen reflow', () => {
    const heute = new Date(2026, 8, 7, 12)
    const woche = weekDays(heute)
    const match = berechneDuell(ZUSTAND, woche, woche[0]!, 'erijon')
    render(
      <Kopf
        heute={heute}
        woche={woche}
        zustand={ZUSTAND}
        me="erijon"
        match={match}
        bilanzzeit={false}
        onEni={() => {}}
      />
    )

    /*
     * Der Tagesstand stand dreifach im Kopf: als eigener Kasten, in den
     * Klammern unter den Namen und noch einmal als Satz in der Statuszeile.
     * Der Kasten ist weg; die beiden Personenzeilen tragen ihn jetzt allein.
     */
    const tagesstaende = screen.getAllByText(
      (_, element) => /^heute \d+\/5$/.test(element?.textContent ?? '')
    )
    expect(tagesstaende).toHaveLength(2)

    const wochenmitte = screen.getByText('woche').parentElement
    expect(wochenmitte?.parentElement).toHaveClass(
      'grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]',
      'max-[239px]:gap-1'
    )
  })
})
