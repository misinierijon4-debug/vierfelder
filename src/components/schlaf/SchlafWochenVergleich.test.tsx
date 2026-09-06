/** @vitest-environment jsdom */

import { cleanup, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { weekDays } from '../../lib/dates'
import type { Schlafnacht } from '../../lib/types'
import { SchlafWochenVergleich } from './SchlafWochenVergleich'

afterEach(cleanup)

const nacht: Schlafnacht = {
  user: 'erijon',
  nacht: '2026-08-25',
  schlafMinuten: 420,
  einschlafzeit: '2026-08-24T21:30:00.000Z',
  aufwachzeit: '2026-08-25T04:30:00.000Z',
  bettStart: null,
  bettEnde: null,
  bettMinuten: null,
  tiefMinuten: 0,
  remMinuten: 0,
  kernMinuten: 0,
  unspezMinuten: 420,
  wachMinuten: 0,
  zielMinuten: 480,
  phasen: null,
  nachtwert: null,
  scoreKonfidenz: null,
}

function ansicht(onWocheWechseln = vi.fn()) {
  const woche = weekDays(new Date(2026, 7, 24))
  render(
    <SchlafWochenVergleich
      naechte={[nacht]}
      registrierte={new Set(['erijon', 'koray'])}
      woche={woche}
      gewaehlterTag={woche[0]!}
      richtung={0}
      kannVor={true}
      onTagWaehlen={vi.fn()}
      onWocheWechseln={onWocheWechseln}
      onKalenderOeffnen={vi.fn()}
    />
  )
  return { woche, onWocheWechseln }
}

describe('Schlafwochen-Zugänglichkeit', () => {
  it('nennt Datum, Person und echte Dauer statt nur des Wochentags', () => {
    ansicht()
    expect(screen.getByRole('button', {
      name: /montag, 24\. august; erijon 7 stunden; koray keine schlafdaten; ausgewählt/i,
    })).toBeInTheDocument()
  })

  it('blättert per Pfeil nur auf der fokussierten Wochenfläche', async () => {
    const user = userEvent.setup()
    const { onWocheWechseln } = ansicht()
    const tag = screen.getByRole('button', { name: /montag, 24\. august/i })
    tag.focus()
    await user.keyboard('{ArrowRight}')
    expect(onWocheWechseln).not.toHaveBeenCalled()

    const gruppe = screen.getByRole('group', { name: /wochenübersicht/i })
    gruppe.focus()
    await user.keyboard('{ArrowRight}')
    expect(onWocheWechseln).toHaveBeenCalledWith(1)
  })
})
