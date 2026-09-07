/** @vitest-environment jsdom */

import { cleanup, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Gewichtszeile } from './Gewichtszeile'

afterEach(cleanup)

function zeige(kg: number | null = 80.2) {
  const onSetze = vi.fn()
  render(
    <Gewichtszeile
      kg={kg}
      letzte={kg === null ? null : { tag: '2026-09-05', kg }}
      kgEr={79.1}
      nameEr="koray"
      farbe="var(--erijon)"
      farbeEr="var(--koray)"
      streak={1}
      quelle="getippt"
      onSetze={onSetze}
    />
  )
  return onSetze
}

describe('Gewichtszeile Eingabe', () => {
  it('erklaert ungueltige Werte inline und behaelt den Entwurf', async () => {
    const user = userEvent.setup()
    const onSetze = zeige()

    const oeffnen = screen.getByRole('button', { name: 'gewicht 80,2 kilogramm ändern' })
    expect(oeffnen).toHaveClass('min-h-11', 'min-w-11')
    await user.click(oeffnen)

    const feld = screen.getByRole('textbox', { name: 'gewicht in kilogramm' })
    await user.clear(feld)
    await user.type(feld, '29')
    await user.tab()

    const fehler = screen.getByRole('alert')
    expect(feld).toHaveAttribute('aria-invalid', 'true')
    expect(feld).toHaveAttribute('aria-describedby', fehler.id)
    expect(feld).toHaveAttribute('aria-errormessage', fehler.id)
    expect(fehler).toHaveTextContent('zwischen 30,0 und 300,0 kg')
    expect(onSetze).not.toHaveBeenCalled()
  })

  it('uebernimmt danach einen gueltigen Kommawert und entfernt den Fehler', async () => {
    const user = userEvent.setup()
    const onSetze = zeige()

    await user.click(screen.getByRole('button', { name: 'gewicht 80,2 kilogramm ändern' }))
    const feld = screen.getByRole('textbox', { name: 'gewicht in kilogramm' })
    await user.clear(feld)
    await user.type(feld, '80,3')
    await user.keyboard('{Enter}')

    expect(onSetze).toHaveBeenCalledOnce()
    expect(onSetze).toHaveBeenCalledWith(80.3)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: 'gewicht in kilogramm' })).not.toBeInTheDocument()
  })

  it('versteckt dekorative Schritt-Icons vor Hilfstechnologien', () => {
    zeige()

    for (const name of [
      'gewicht um 100 gramm verringern',
      'gewicht um 100 gramm erhöhen',
    ]) {
      expect(screen.getByRole('button', { name }).querySelector('svg')).toHaveAttribute(
        'aria-hidden',
        'true'
      )
    }
  })
})
