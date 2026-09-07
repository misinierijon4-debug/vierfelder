/** @vitest-environment jsdom */

import { cleanup, render, screen, within } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { phasenLadeKey } from '../../lib/schlafLaden'
import type { Schlafnacht, UserId } from '../../lib/types'
import { SchlafNachtVergleich } from './SchlafNachtVergleich'

afterEach(cleanup)

function nacht(user: UserId): Schlafnacht {
  return {
    user,
    nacht: '2026-09-04',
    schlafMinuten: 480,
    einschlafzeit: '2026-09-03T21:30:00.000Z',
    aufwachzeit: '2026-09-04T05:30:00.000Z',
    bettStart: null,
    bettEnde: null,
    bettMinuten: null,
    tiefMinuten: 0,
    remMinuten: 0,
    kernMinuten: 0,
    unspezMinuten: 480,
    wachMinuten: 0,
    zielMinuten: 480,
    phasen: [{ art: 'unspez', start: 0, dauer: 480 }],
    nachtwert: 80,
    scoreKonfidenz: 80,
  }
}

describe('SchlafNachtVergleich Verlaufstatus', () => {
  it('zeigt unspezifische geladene Phasen als unvollstaendig statt als leeren Block', () => {
    const naechte = [nacht('erijon'), nacht('koray')]
    render(
      <SchlafNachtVergleich
        naechte={naechte}
        gewaehlterTag="2026-09-03"
        phasenLadezustaende={{
          [phasenLadeKey('erijon', '2026-09-04')]: { status: 'loaded' },
          [phasenLadeKey('koray', '2026-09-04')]: { status: 'loaded' },
        }}
        onVerlaufBrauchen={vi.fn()}
        onVerlaufErneut={vi.fn()}
      />
    )

    const text = screen.getByRole('status').textContent ?? ''
    expect(text.match(/geladene phasen reichen nicht/gi)).toHaveLength(2)
  })

  it('bricht die Vergleichszeilen bei schmalem Reflow um und markiert Sieger nicht nur farbig', () => {
    const erijon = { ...nacht('erijon'), nachtwert: 90 }
    const koray = { ...nacht('koray'), nachtwert: 80 }
    render(
      <SchlafNachtVergleich
        naechte={[erijon, koray]}
        gewaehlterTag="2026-09-03"
        phasenLadezustaende={{}}
        onVerlaufBrauchen={vi.fn()}
        onVerlaufErneut={vi.fn()}
      />
    )

    const zeile = screen.getByText('nachtwert').parentElement!
    expect(zeile).toHaveClass('grid-cols-3')
    expect(zeile.className).toContain('min-[260px]:grid-cols-')
    const sieger = within(zeile).getByText(/90/)
    expect(sieger).toHaveClass('underline')
    expect(sieger).toHaveTextContent('besserer wert')
  })

  it('gibt dem Retry eine 44-Pixel-Trefferflaeche', () => {
    const naechte = [nacht('erijon'), nacht('koray')].map((wert) => ({
      ...wert,
      phasen: null,
    }))
    render(
      <SchlafNachtVergleich
        naechte={naechte}
        gewaehlterTag="2026-09-03"
        phasenLadezustaende={{
          [phasenLadeKey('erijon', '2026-09-04')]: { status: 'error', text: 'netz' },
          [phasenLadeKey('koray', '2026-09-04')]: { status: 'error', text: 'netz' },
        }}
        onVerlaufBrauchen={vi.fn()}
        onVerlaufErneut={vi.fn()}
      />
    )

    for (const retry of screen.getAllByRole('button', { name: 'erneut' })) {
      expect(retry).toHaveClass('min-h-11', 'min-w-11')
    }
  })
})
