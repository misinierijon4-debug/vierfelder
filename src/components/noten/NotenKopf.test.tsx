/** @vitest-environment jsdom */

import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { Fach, Note, Notenstand } from '../../lib/types'
import { NotenKopf } from './NotenKopf'

afterEach(cleanup)

function fach(
  id: string,
  kursart: Fach['kursart'],
  pruefungsfach: number | null = null,
  user: Fach['user'] = 'erijon',
): Fach {
  return {
    id,
    user,
    name: id,
    kursart,
    pruefungsfach,
    sortierung: 0,
  }
}

function note(fachId: string, punkte: number, user: Note['user'] = 'erijon'): Note {
  return {
    id: `note-${fachId}`,
    user,
    fachId,
    art: 'klausur',
    punkte,
    gewicht: 10,
    datum: '2026-09-04',
    titel: '',
  }
}

const FAECHER = [
  fach('bio', 'lk'),
  fach('englisch', 'lk'),
  fach('geschichte', 'lk'),
  fach('mathe', 'gk', 4),
]

function stand(punkte: number, anzahl = FAECHER.length): Notenstand {
  return {
    faecher: FAECHER,
    noten: FAECHER.slice(0, anzahl).map((f) => note(f.id, punkte)),
  }
}

describe('NotenKopf Abiprognose', () => {
  it('zeigt aus unvollstaendigen Fachdaten keine erfundene Abinote', () => {
    render(<NotenKopf stand={stand(15, 1)} me="erijon" />)
    const abi = within(screen.getByRole('group', { name: 'abiprognose' }))

    expect(abi.getByText('für 1 von 4 fächern liegen noten vor')).toBeTruthy()
    expect(abi.queryByText('1,0')).toBeNull()
  })

  it('zeigt bei gerissenen Mindesthuerden keine bestandene 4,0', () => {
    render(<NotenKopf stand={stand(4)} me="erijon" />)
    const abi = within(screen.getByRole('group', { name: 'abiprognose' }))

    expect(abi.getByText('keine belastbare abiturnote')).toBeTruthy()
    expect(abi.queryByText('4,0')).toBeNull()
    expect(screen.getByText(/block i unter 200 punkten/)).toBeTruthy()
  })

  it('zeigt 4,0 erst fuer die bestandene 300-Punkte-Prognose', () => {
    render(<NotenKopf stand={stand(5)} me="erijon" />)
    const abi = within(screen.getByRole('group', { name: 'abiprognose' }))

    expect(abi.getByText('4,0')).toBeTruthy()
    expect(abi.queryByText('keine belastbare abiturnote')).toBeNull()
  })

  it('nutzt fuer Korays Warnzustand die Petrolfarbe und kuendigt Aenderungen an', () => {
    const faecher = FAECHER.map((f) => ({ ...f, user: 'koray' as const }))
    const korayStand = { faecher, noten: faecher.map((f) => note(f.id, 4, 'koray')) }
    render(<NotenKopf stand={korayStand} me="koray" />)
    const abiGruppe = screen.getByRole('group', { name: 'abiprognose' })
    const abi = within(abiGruppe)
    const warnung = abi.getByText('keine belastbare abiturnote')

    expect(warnung.style.color).toBe('var(--koray)')
    expect(abiGruppe.getAttribute('aria-live')).toBe('polite')
  })
})
