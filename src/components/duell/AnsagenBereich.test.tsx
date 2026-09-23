/** @vitest-environment jsdom */

import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom/vitest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Ansage } from '../../lib/ansagen'
import type { Zustand } from '../../lib/types'
import { AnsagenBereich } from './AnsagenBereich'

afterEach(cleanup)

const DIENSTAG = new Date(2026, 8, 22, 12)
const leer = (): Zustand => ({ einheiten: {}, gewichte: {}, aufenthalte: [] })
const ansage = (rest: Partial<Ansage> = {}): Ansage => ({
  id: 'a1',
  von: 'koray',
  an: 'erijon',
  feld: 'lesen',
  ab: '2026-09-22',
  bis: '2026-09-26',
  ziel: 2,
  erstelltAm: new Date(2026, 8, 21, 9).toISOString(),
  ...rest,
})

describe('AnsagenBereich', () => {
  it('zeigt drei vorschläge mit ziel, verlauf und spruch', () => {
    render(<AnsagenBereich zustand={leer()} me="erijon" heute={DIENSTAG} ansagen={[]} onSageAn={vi.fn()} />)
    const karten = screen.getAllByRole('button', { name: 'ansagen' })
    expect(karten).toHaveLength(3)
    expect(screen.getByText('1× gym')).toBeInTheDocument()
    expect(screen.getAllByText('letzte 4 wochen: 0 · 0 · 0 · 0')).toHaveLength(3)
    expect(screen.getByText(/koray war sonst fast nie im gym/)).toBeInTheDocument()
    expect(screen.getByText('2 von 2 übrig')).toBeInTheDocument()
  })

  it('fragt vor dem einsatz nach und meldet die ansage', async () => {
    const onSageAn = vi.fn(async () => ({ ansage: ansage({ id: 'neu', von: 'erijon', an: 'koray', feld: 'gym', ziel: 1 }) }))
    render(<AnsagenBereich zustand={leer()} me="erijon" heute={DIENSTAG} ansagen={[]} onSageAn={onSageAn} />)
    await userEvent.click(screen.getAllByRole('button', { name: 'ansagen' })[0]!)
    expect(onSageAn).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: '1 punkt setzen' }))
    expect(onSageAn).toHaveBeenCalledWith('gym')
    expect(await screen.findByText('angesagt: 1× gym bis samstag.')).toBeInTheDocument()
  })

  it('erklärt eine ablehnung mit dem grund', async () => {
    const onSageAn = vi.fn(async () => ({ fehler: 'keinZiel' as const }))
    render(<AnsagenBereich zustand={leer()} me="erijon" heute={DIENSTAG} ansagen={[]} onSageAn={onSageAn} />)
    await userEvent.click(screen.getAllByRole('button', { name: 'ansagen' })[1]!)
    await userEvent.click(screen.getByRole('button', { name: '1 punkt setzen' }))
    expect(await screen.findByText('für dieses feld gibt es gerade kein faires ziel.')).toBeInTheDocument()
  })

  it('zeigt eine laufende ansage gegen dich mit stand und was sie kostet', () => {
    render(<AnsagenBereich zustand={leer()} me="erijon" heute={DIENSTAG} ansagen={[ansage()]} onSageAn={vi.fn()} />)
    const liste = within(screen.getByRole('list', { name: 'ansagen dieser woche' }))
    expect(liste.getByText('2× lesen')).toBeInTheDocument()
    expect(liste.getByText('0/2 · noch 5 tage')).toBeInTheDocument()
    expect(liste.getByLabelText('koray: -1 einsatz')).toHaveTextContent('−1')
    expect(liste.getByText('liefer 2× mehr, dann ist korays einsatz weg.')).toBeInTheDocument()
  })

  it('bietet ab freitag nichts mehr an und zählt verbrauchte ansagen', () => {
    const { rerender } = render(
      <AnsagenBereich zustand={leer()} me="erijon" heute={new Date(2026, 8, 25, 9)} ansagen={[]} onSageAn={vi.fn()} />
    )
    expect(screen.getByText(/ansagen gehen montag bis donnerstag/)).toBeInTheDocument()
    const zwei = [
      ansage({ id: 'x', von: 'erijon', an: 'koray', feld: 'gym' }),
      ansage({ id: 'y', von: 'erijon', an: 'koray', feld: 'boxen' }),
    ]
    rerender(<AnsagenBereich zustand={leer()} me="erijon" heute={DIENSTAG} ansagen={zwei} onSageAn={vi.fn()} />)
    expect(screen.getByText('0 von 2 übrig')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'ansagen' })).toBeNull()
  })
})
