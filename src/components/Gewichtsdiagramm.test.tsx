/** @vitest-environment jsdom */

import { cleanup, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { Gewichtsdiagramm } from './Gewichtsdiagramm'

afterEach(cleanup)

describe('Gewichtsdiagramm Fensterwahl', () => {
  it('benennt die Filter vollstaendig und bietet 44-Pixel-Trefferflaechen', () => {
    render(<Gewichtsdiagramm gewichte={{}} heute="2026-09-06" />)

    for (const name of ['letzte 30 tage', 'letzte 90 tage', 'gesamter zeitraum']) {
      expect(screen.getByRole('button', { name })).toHaveClass('min-h-11', 'min-w-11')
    }
  })

  it('kennzeichnet die Auswahl zusaetzlich zur Farbe und aria-pressed', async () => {
    const user = userEvent.setup()
    render(<Gewichtsdiagramm gewichte={{}} heute="2026-09-06" />)

    const dreissig = screen.getByRole('button', { name: 'letzte 30 tage' })
    const neunzig = screen.getByRole('button', { name: 'letzte 90 tage' })
    expect(dreissig).toHaveAttribute('aria-pressed', 'true')
    expect(dreissig).toHaveClass('underline')

    await user.click(neunzig)

    expect(neunzig).toHaveAttribute('aria-pressed', 'true')
    expect(neunzig).toHaveClass('underline')
    expect(dreissig).toHaveAttribute('aria-pressed', 'false')
    expect(dreissig).not.toHaveClass('underline')
  })
})
