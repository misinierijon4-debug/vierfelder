/** @vitest-environment jsdom */

import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { analysiereSchlafnacht } from '../../lib/schlafPhasen'
import type { Schlafnacht } from '../../lib/types'
import { PhasenZeitstrahl } from './PhasenZeitstrahl'

afterEach(cleanup)

function analyse(phasen: Schlafnacht['phasen']) {
  return analysiereSchlafnacht({
    user: 'erijon',
    nacht: '2026-09-03',
    schlafMinuten: 480,
    einschlafzeit: '2026-09-02T21:30:00.000Z',
    aufwachzeit: '2026-09-03T05:30:00.000Z',
    bettStart: null,
    bettEnde: null,
    bettMinuten: null,
    tiefMinuten: 0,
    remMinuten: 0,
    kernMinuten: 0,
    unspezMinuten: 480,
    wachMinuten: 0,
    zielMinuten: 480,
    phasen,
    nachtwert: 80,
    scoreKonfidenz: 100,
  })
}

describe('PhasenZeitstrahl Lade- und Fehlerzustaende', () => {
  it('behauptet waehrend des Ladens nicht, Health habe keine Phasen geliefert', () => {
    render(
      <PhasenZeitstrahl
        analyse={analyse(null)}
        ladezustand={{ status: 'loading' }}
        onErneut={vi.fn()}
      />
    )

    expect(screen.getByRole('status').textContent).toContain('wird geladen')
    expect(screen.queryByText(/health hat/i)).toBeNull()
  })

  it('zeigt einen Inline-Fehler und startet den Retry ueber die Taste', async () => {
    const onErneut = vi.fn()
    render(
      <PhasenZeitstrahl
        analyse={analyse(null)}
        ladezustand={{ status: 'error', text: 'verlauf konnte nicht geladen werden.' }}
        onErneut={onErneut}
      />
    )

    expect(screen.getByRole('alert').textContent).toContain('konnte nicht geladen werden')
    await userEvent.click(screen.getByRole('button', { name: 'erneut versuchen' }))
    expect(onErneut).toHaveBeenCalledTimes(1)
  })

  it('zeigt den Health-Leerzustand erst nach einem erfolgreichen leeren Abruf', () => {
    render(
      <PhasenZeitstrahl
        analyse={analyse([])}
        ladezustand={{ status: 'empty' }}
        onErneut={vi.fn()}
      />
    )

    expect(screen.getByText('keine schlafphasen erfasst')).toBeTruthy()
    expect(screen.getByText(/health hat.*keine schlafstadien/i)).toBeTruthy()
  })
})
