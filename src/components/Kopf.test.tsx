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
      />
    )

    expect(screen.getByRole('heading', { name: 'woche unentschieden' })).toBeInTheDocument()
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })
})
