/** @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AppStartzustand } from './App'

afterEach(cleanup)

describe('AppStartzustand', () => {
  it('zeigt beim Start einen benannten und nicht bedienbaren Ladezustand', () => {
    render(<AppStartzustand status="laden" />)

    expect(screen.getByRole('status')).toHaveAttribute('aria-busy', 'true')
    expect(screen.getByRole('heading', { name: 'gemeinsamer stand wird geladen' })).toBeInTheDocument()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('bietet im Vollfehler Retry und sichere Abmeldung inline an', async () => {
    const user = userEvent.setup()
    const erneut = vi.fn()
    const abmelden = vi.fn()
    render(
      <AppStartzustand
        status="fehler"
        fehler="daten konnten nicht geladen werden."
        onErneut={erneut}
        onAbmelden={abmelden}
      />
    )

    expect(screen.getByRole('alert')).toHaveTextContent('daten konnten nicht geladen werden.')
    await user.click(screen.getByRole('button', { name: 'erneut versuchen' }))
    await user.click(screen.getByRole('button', { name: 'sicher abmelden' }))
    expect(erneut).toHaveBeenCalledOnce()
    expect(abmelden).toHaveBeenCalledOnce()
  })

  it('behauptet bei fehlgeschlagener Abmeldung keinen Erfolg', async () => {
    const user = userEvent.setup()
    render(
      <AppStartzustand
        status="fehler"
        onAbmelden={vi.fn().mockRejectedValue(new Error('netz'))}
      />
    )

    await user.click(screen.getByRole('button', { name: 'sicher abmelden' }))
    expect(await screen.findByText(/abmeldung konnte nicht bestätigt werden/i)).toBeInTheDocument()
  })
})
