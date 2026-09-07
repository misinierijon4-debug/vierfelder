/** @vitest-environment jsdom */

import { cleanup, render, screen, within } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { afterEach, describe, expect, it } from 'vitest'
import type { Schlafnacht, UserId } from '../../lib/types'
import { SchlafRhythmus } from './SchlafRhythmus'

afterEach(cleanup)

function nacht(user: UserId, schlafMinuten: number, nachtwert: number): Schlafnacht {
  return {
    user,
    nacht: '2026-09-04',
    schlafMinuten,
    einschlafzeit: '2026-09-03T21:30:00.000Z',
    aufwachzeit: '2026-09-04T05:30:00.000Z',
    bettStart: null,
    bettEnde: null,
    bettMinuten: null,
    tiefMinuten: 0,
    remMinuten: 0,
    kernMinuten: 0,
    unspezMinuten: schlafMinuten,
    wachMinuten: 0,
    zielMinuten: 480,
    phasen: [{ art: 'unspez', start: 0, dauer: schlafMinuten }],
    nachtwert,
    scoreKonfidenz: 100,
  }
}

describe('SchlafRhythmus Reflow und Siegerhinweis', () => {
  it('stapelt die Bezeichnung im engen Reflow und markiert den Sieger nicht nur farbig', () => {
    render(
      <SchlafRhythmus
        naechte={[nacht('erijon', 480, 90), nacht('koray', 420, 80)]}
        registrierte={new Set<UserId>(['erijon', 'koray'])}
        woche={['2026-09-03']}
      />
    )

    const zeile = screen.getByText('nachtwert').parentElement!
    expect(zeile).toHaveClass('grid-cols-2')
    expect(zeile.className).toContain('min-[240px]:grid-cols-')
    const sieger = within(zeile).getByText(/90/)
    expect(sieger).toHaveClass('underline')
    expect(sieger).toHaveTextContent('besserer wert')
  })
})
