/** @vitest-environment jsdom */

import { cleanup, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { afterEach, describe, expect, it } from 'vitest'
import type { Fach, Note, Notenstand, UserId } from '../../lib/types'
import { NotenVergleich } from './NotenVergleich'

afterEach(cleanup)

function fach(id: string, user: UserId): Fach {
  return {
    id,
    user,
    name: 'mathe',
    kursart: 'lk',
    pruefungsfach: user === 'erijon' ? 1 : 2,
    sortierung: 0,
  }
}

function note(id: string, user: UserId, fachId: string, punkte: number): Note {
  return {
    id,
    user,
    fachId,
    art: 'klausur',
    punkte,
    gewicht: 10,
    datum: '2026-09-01',
    titel: '',
  }
}

describe('NotenVergleich Reflow und Hervorhebung', () => {
  it('stapelt Fachzeilen im engen Reflow und markiert den hoeheren Schnitt nicht nur farbig', () => {
    const faecher = [fach('e-mathe', 'erijon'), fach('k-mathe', 'koray')]
    const stand: Notenstand = {
      faecher,
      noten: [
        note('e-note', 'erijon', 'e-mathe', 12),
        note('k-note', 'koray', 'k-mathe', 8),
      ],
    }
    render(<NotenVergleich stand={stand} />)

    const fachzeile = screen.getByText('mathe').closest('li')!
    expect(fachzeile).toHaveClass('grid-cols-2')
    expect(fachzeile.className).toContain('min-[240px]:grid-cols-')

    const hervorgehoben = screen.getByText(/höherer schnitt/).parentElement!
    expect(hervorgehoben).toHaveClass('underline')
    expect(hervorgehoben).toHaveTextContent('12,0')
  })
})
