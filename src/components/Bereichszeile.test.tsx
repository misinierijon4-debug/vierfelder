/** @vitest-environment jsdom */

import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AREAS } from '../lib/types'
import { Bereichszeile } from './Bereichszeile'

afterEach(cleanup)

function renderZeile(
  disabled = false,
  quelle: 'getippt' | 'gemessen' | 'gemischt' = 'getippt',
  zeigeUndo = true
) {
  const onTap = vi.fn()
  const onUndo = vi.fn()
  const onWert = vi.fn()
  const onNeueEinheit = vi.fn()

  render(
    <Bereichszeile
      area={AREAS[0]!}
      index={0}
      gesetzt={true}
      wocheIch={3}
      abstand={1}
      streak={2}
      wert={45}
      hatWert={true}
      einheitWert={45}
      anzahl={1}
      mehrfachMoeglich={true}
      quelle={quelle}
      messungMinuten={quelle === 'getippt' ? null : 60}
      farbe="gold"
      farbeEr="petrol"
      zeigeUndo={zeigeUndo}
      disabled={disabled}
      onTap={onTap}
      onUndo={onUndo}
      onWert={onWert}
      onNeueEinheit={onNeueEinheit}
    />
  )

  return { onTap, onUndo, onWert, onNeueEinheit }
}

describe('Bereichszeile', () => {
  it.each([
    ['Enter', '{Enter}'],
    ['Leertaste', ' '],
  ])(
    'loescht den Tag bei %s auf dem Plusknopf nicht versehentlich',
    async (_name, taste) => {
      const user = userEvent.setup()
      const { onTap, onWert } = renderZeile()
      const plus = screen.getByRole('button', { name: 'lernen um 15 min erhöhen' })

      plus.focus()
      await user.keyboard(taste)

      expect(onWert).toHaveBeenCalledTimes(1)
      expect(onWert).toHaveBeenCalledWith(15)
      expect(onTap).not.toHaveBeenCalled()
    }
  )

  it('verschachtelt die Wertaktionen nicht in der Tagesaktion', () => {
    renderZeile()
    const plus = screen.getByRole('button', { name: 'lernen um 15 min erhöhen' })

    expect(plus.parentElement?.closest('[role="button"]')).toBeNull()
  })

  it.each([
    ['Enter', '{Enter}'],
    ['Leertaste', ' '],
  ])('aktiviert die Tagesaktion mit %s genau einmal', async (_name, taste) => {
    const user = userEvent.setup()
    const { onTap } = renderZeile()
    const tag = screen.getByRole('button', { name: 'lernen, heute eingetragen' })

    tag.focus()
    await user.keyboard(taste)

    expect(onTap).toHaveBeenCalledTimes(1)
  })

  it('sperrt beim Laden jede Aktion der Zeile', async () => {
    const user = userEvent.setup()
    const { onTap, onUndo, onWert, onNeueEinheit } = renderZeile(true)

    for (const button of screen.getAllByRole('button')) {
      expect(button).toHaveProperty('disabled', true)
      await user.click(button)
    }

    expect(onTap).not.toHaveBeenCalled()
    expect(onUndo).not.toHaveBeenCalled()
    expect(onWert).not.toHaveBeenCalled()
    expect(onNeueEinheit).not.toHaveBeenCalled()
  })

  it('laesst bei gemischter Herkunft die manuellen Eingaben erreichbar', async () => {
    const user = userEvent.setup()
    const { onTap, onWert, onNeueEinheit } = renderZeile(false, 'gemischt', false)

    expect(screen.getByText(/gemessen \+ getippt/)).not.toBeNull()
    const tag = screen.getByRole('button', {
      name: /gemessen und manuell eingetragen; manuelle eintraege entfernen/,
    })
    await user.click(screen.getByRole('button', { name: 'lernen um 15 min erhöhen' }))
    await user.click(screen.getByRole('button', { name: 'weitere einheit lernen eintragen' }))
    await user.click(tag)

    expect(onWert).toHaveBeenCalledWith(15)
    expect(onNeueEinheit).toHaveBeenCalledTimes(1)
    expect(onTap).toHaveBeenCalledTimes(1)
  })

  it('haelt nach einer gemischten Aktion neue Einheiten und Rückgängig parallel erreichbar', async () => {
    const user = userEvent.setup()
    const { onUndo, onNeueEinheit } = renderZeile(false, 'gemischt')

    await user.click(screen.getByRole('button', { name: 'weitere einheit lernen eintragen' }))
    await user.click(screen.getByRole('button', { name: 'rückgängig' }))
    expect(onNeueEinheit).toHaveBeenCalledOnce()
    expect(onUndo).toHaveBeenCalledOnce()
  })
})
