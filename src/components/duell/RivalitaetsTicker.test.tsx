/** @vitest-environment jsdom */

import { cleanup, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { afterEach, describe, expect, it } from 'vitest'
import type { Zustand } from '../../lib/types'
import { RivalitaetsTicker } from './RivalitaetsTicker'

afterEach(cleanup)

const ZUSTAND: Zustand = {
  einheiten: {},
  gewichte: {},
  aufenthalte: [
    {
      id: 'gym-1',
      user: 'erijon',
      bereich: 'gym',
      ort: 'fitnessstudio',
      ankunft: '2026-09-06T08:00:00.000+02:00',
      abgang: '2026-09-06T09:00:00.000+02:00',
    },
  ],
}

describe('RivalitaetsTicker Reflow', () => {
  it('darf den kompakten Messhinweis umbrechen und versteckt sein Icon', () => {
    const { container } = render(
      <RivalitaetsTicker
        zustand={ZUSTAND}
        woche={['2026-09-06']}
        me="erijon"
        kompakt
      />
    )

    expect(container.firstElementChild).toHaveClass('flex-wrap')
    expect(screen.getByText('gemessen').querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
  })

  it('darf im vollstaendigen Feed Zeit und Inhalt getrennt umbrechen', () => {
    render(
      <RivalitaetsTicker zustand={ZUSTAND} woche={['2026-09-06']} me="erijon" />
    )

    const status = screen.getByText('verifiziert')
    expect(status.parentElement?.parentElement).toHaveClass('flex-wrap')
    expect(status.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
  })
})
