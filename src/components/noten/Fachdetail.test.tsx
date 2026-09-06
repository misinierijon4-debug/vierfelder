/** @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Fach, Note } from '../../lib/types'
import { Fachdetail } from './Fachdetail'

afterEach(() => {
  vi.useRealTimers()
  cleanup()
})

const FACH: Fach = {
  id: 'fach-mathe',
  user: 'erijon',
  name: 'mathe',
  kursart: 'gk',
  pruefungsfach: 4,
  sortierung: 0,
}
const NOTE: Note = {
  id: 'note-1',
  user: 'erijon',
  fachId: FACH.id,
  art: 'klausur',
  punkte: 12,
  gewicht: 1,
  datum: '2026-09-05',
  titel: 'analysis',
}

function renderDetail(overrides: Partial<Parameters<typeof Fachdetail>[0]> = {}) {
  const props: Parameters<typeof Fachdetail>[0] = {
    fach: FACH,
    noten: [NOTE],
    heute: '2026-09-06',
    onSchliessen: vi.fn(),
    onPruefungsfach: vi.fn(),
    onNote: vi.fn(),
    onNoteLoeschen: vi.fn(() => NOTE),
    onNoteWiederherstellen: vi.fn(() => true),
    ...overrides,
  }
  render(<Fachdetail {...props} />)
  return props
}

describe('Fachdetail sichere Mutationen', () => {
  it('laesst das einzige vierte Pruefungsfach nicht vollstaendig abwaehlen', () => {
    renderDetail()

    expect(screen.getByRole('status', { name: /mathe ist als mündliches prüfungsfach gewählt/i }))
      .toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /mathe als mündliches prüfungsfach wählen/i }))
      .toBeNull()
  })

  it('bietet Sport nicht als viertes Pruefungsfach an', () => {
    renderDetail({ fach: { ...FACH, id: 'sport', name: 'sport', pruefungsfach: null } })

    expect(screen.getByText(/sport ist .* nicht als viertes prüfungsfach zulässig/i))
      .toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /als mündliches prüfungsfach wählen/i }))
      .toBeNull()
  })

  it('stellt eine geloeschte Note mit derselben UUID sichtbar wieder her', async () => {
    const user = userEvent.setup()
    const onNoteLoeschen = vi.fn(() => NOTE)
    const onNoteWiederherstellen = vi.fn(() => true)
    renderDetail({ onNoteLoeschen, onNoteWiederherstellen })

    await user.click(screen.getByRole('button', { name: /klausur vom 2026-09-05.*löschen/i }))
    expect(onNoteLoeschen).toHaveBeenCalledWith(NOTE.id)
    expect(screen.getByText('note gelöscht').closest('[role="status"]')).toHaveTextContent('note gelöscht')

    await user.click(screen.getByRole('button', { name: 'rückgängig' }))
    expect(onNoteWiederherstellen).toHaveBeenCalledWith(NOTE)
  })

  it('behaelt Eingabe und Undo, wenn der Store eine Mutation synchron sperrt', async () => {
    const user = userEvent.setup()
    renderDetail({
      onNote: vi.fn(() => null),
      onNoteWiederherstellen: vi.fn(() => false),
    })

    const titel = screen.getByRole('textbox', { name: 'titel der note' })
    await user.type(titel, 'bleibt erhalten')
    await user.click(screen.getByRole('button', { name: /^12 punkte/i }))
    expect(titel).toHaveValue('bleibt erhalten')

    await user.click(screen.getByRole('button', { name: /klausur vom 2026-09-05.*löschen/i }))
    await user.click(screen.getByRole('button', { name: 'rückgängig' }))
    expect(screen.getByRole('button', { name: 'rückgängig' })).toBeInTheDocument()
  })

  it('haelt den Fokus im Dialog, wenn das Undo-Fenster ablaeuft', async () => {
    vi.useFakeTimers()
    renderDetail()

    fireEvent.click(screen.getByRole('button', { name: /klausur vom 2026-09-05.*löschen/i }))
    await act(async () => { await vi.advanceTimersByTimeAsync(20) })
    expect(screen.getByRole('button', { name: 'rückgängig' })).toHaveFocus()

    await act(async () => { await vi.advanceTimersByTimeAsync(7000) })
    await act(async () => { await vi.advanceTimersByTimeAsync(20) })

    expect(screen.queryByRole('button', { name: 'rückgängig' })).toBeNull()
    expect(screen.getByRole('dialog')).toHaveFocus()
  })
})
