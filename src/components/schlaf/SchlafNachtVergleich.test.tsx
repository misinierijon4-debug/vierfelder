/** @vitest-environment jsdom */

import { cleanup, render, screen } from '@testing-library/react'
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
})
