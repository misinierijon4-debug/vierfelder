/** @vitest-environment jsdom */

import { useRef, useState } from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useDialogFokus } from './dialogFokus'

afterEach(cleanup)

function Dialog({ onSchliessen }: { onSchliessen: () => void }) {
  const root = useRef<HTMLElement>(null)
  const start = useRef<HTMLButtonElement>(null)
  useDialogFokus(root, start, onSchliessen)
  return (
    <div data-testid="overlay">
      <section ref={root} role="dialog" aria-modal="true" tabIndex={-1}>
        <button ref={start}>schließen</button>
        <input aria-label="wert" />
        <button>speichern</button>
      </section>
    </div>
  )
}

function Beispiel({ geschlossen = vi.fn() }: { geschlossen?: () => void }) {
  const [offen, setOffen] = useState(false)
  return (
    <div>
      <main data-testid="hintergrund">
        <button onClick={() => setOffen(true)}>öffnen</button>
      </main>
      {offen && <Dialog onSchliessen={() => { geschlossen(); setOffen(false) }} />}
    </div>
  )
}

describe('useDialogFokus', () => {
  it('sperrt den Hintergrund und gibt den Fokus an den Öffner zurück', async () => {
    const user = userEvent.setup()
    render(<Beispiel />)
    const oeffner = screen.getByRole('button', { name: 'öffnen' })
    await user.click(oeffner)

    expect(screen.getByTestId('hintergrund')).toHaveAttribute('inert')
    expect(screen.getByTestId('hintergrund')).toHaveAttribute('aria-hidden', 'true')
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'schließen' }))

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(oeffner).toHaveFocus()
    expect(screen.getByTestId('hintergrund')).not.toHaveAttribute('inert')
    expect(screen.getByTestId('hintergrund')).not.toHaveAttribute('aria-hidden')
  })

  it('hält Tab und Shift+Tab im Dialog', async () => {
    const user = userEvent.setup()
    render(<Beispiel />)
    await user.click(screen.getByRole('button', { name: 'öffnen' }))

    const erstes = screen.getByRole('button', { name: 'schließen' })
    const letztes = screen.getByRole('button', { name: 'speichern' })
    letztes.focus()
    await user.tab()
    expect(erstes).toHaveFocus()
    await user.tab({ shift: true })
    expect(letztes).toHaveFocus()
  })
})
