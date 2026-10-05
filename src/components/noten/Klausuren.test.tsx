/** @vitest-environment jsdom */

import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom/vitest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Fach, Klausur, Notenstand, UserId } from '../../lib/types'
import { Klausuren } from './Klausuren'

afterEach(cleanup)

const fach = (id: string, user: UserId, name: string, kursart: Fach['kursart'] = 'gk'): Fach =>
  ({ id, user, name, kursart, pruefungsfach: null, sortierung: 0 })
const klausur = (id: string, user: UserId, fachId: string, datum: string, beginn: string | null, ende: string | null): Klausur =>
  ({ id, user, fachId, art: 'klausur', kurs: null, datum, beginn, ende, bemerkung: '' })

const STAND: Notenstand = {
  faecher: [
    fach('ed', 'erijon', 'deutsch'),
    fach('es', 'erijon', 'sozialkunde'),
    fach('eg', 'erijon', 'geschichte', 'lk'),
    fach('ks', 'koray', 'sozialkunde'),
    fach('kp', 'koray', 'physik', 'lk'),
  ],
  noten: [],
  klausuren: [
    klausur('1', 'erijon', 'ed', '2026-09-30', '08:45', '11:20'),
    klausur('2', 'erijon', 'es', '2026-10-27', '09:45', '11:20'),
    klausur('3', 'erijon', 'eg', '2026-11-18', '08:00', '12:00'),
    klausur('4', 'koray', 'ks', '2026-10-27', null, null),
    klausur('5', 'koray', 'kp', '2026-12-03', '08:00', '12:00'),
  ],
}

describe('Klausuren im abi-tab', () => {
  it('zeigt die nächste eigene klausur mit countdown, den rest darunter und die fehlende note', async () => {
    const offnen = vi.fn()
    render(<Klausuren stand={STAND} me="erijon" heute="2026-10-05" onFachOeffnen={offnen} />)
    const bereich = screen.getByRole('region', { name: 'klausuren' })
    expect(within(bereich).getByText('sozialkunde')).toBeInTheDocument()
    expect(within(bereich).getByText(/di 27\.10\. · 09:45–11:20/)).toBeInTheDocument()
    expect(within(bereich).getByText('koray schreibt sie auch')).toBeInTheDocument()
    expect(within(bereich).getByText('22')).toBeInTheDocument()
    expect(within(bereich).getByText('geschichte lk')).toBeInTheDocument()
    expect(within(bereich).getByText('in 44 tagen')).toBeInTheDocument()

    await userEvent.click(within(bereich).getByRole('button', { name: 'deutsch, geschrieben mi 30.09.: note eintragen' }))
    expect(offnen).toHaveBeenCalledWith('ed')
  })

  it('schaltet auf den plan der anderen person um, ohne note-hinweise', async () => {
    render(<Klausuren stand={STAND} me="erijon" heute="2026-10-26" onFachOeffnen={() => {}} />)
    await userEvent.click(screen.getByRole('button', { name: 'koray' }))
    expect(screen.getByRole('button', { name: 'koray' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText(/uhrzeit offen/)).toBeInTheDocument()
    expect(screen.getByText('morgen')).toBeInTheDocument()
    expect(screen.getByText('erijon schreibt sie auch')).toBeInTheDocument()
    expect(screen.queryByText(/note eintragen/)).not.toBeInTheDocument()
  })

  it('bleibt weg, solange es keinen klausurplan gibt', () => {
    const { container } = render(<Klausuren stand={{ faecher: [], noten: [] }} me="erijon" heute="2026-10-05" onFachOeffnen={() => {}} />)
    expect(container).toBeEmptyDOMElement()
  })
})
