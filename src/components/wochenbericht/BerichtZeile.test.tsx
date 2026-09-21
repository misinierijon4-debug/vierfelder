/** @vitest-environment jsdom */

import { cleanup, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { WochenMarke } from '../../lib/wochenbericht'
import { BerichtZeile } from './BerichtZeile'

afterEach(cleanup)

function marke(ueberschreiben: Partial<WochenMarke> = {}): WochenMarke {
  return {
    woche: '2026-09-14',
    punkte: { erijon: 12, koray: 8 },
    sieger: 'erijon',
    laeuft: false,
    ...ueberschreiben,
  }
}

function zeile(m: WochenMarke | undefined, onOeffnen = vi.fn()) {
  render(
    <BerichtZeile
      marke={m}
      kurz="14.–20."
      zeitraum="14.–20. september"
      onOeffnen={onOeffnen}
    />
  )
  return onOeffnen
}

describe('BerichtZeile', () => {
  it('nennt die woche, den stand und wer vorn liegt', () => {
    zeile(marke())

    const knopf = screen.getByRole('button')
    expect(knopf).toHaveAccessibleName('Wochenbericht 14.–20. september, 12 zu 8, erijon vorn')
    // das wort sagt, was hinter der zeile steckt — die zahlen, wie die woche lief
    expect(knopf).toHaveTextContent('bericht · 14.–20.')
    expect(knopf).toHaveTextContent('12')
    expect(knopf).toHaveTextContent('8')
  })

  it('macht aus der laufenden woche keinen fertigen bericht', () => {
    zeile(marke({ laeuft: true }))

    const knopf = screen.getByRole('button')
    expect(knopf).toHaveTextContent('läuft · 14.–20.')
    expect(knopf).toHaveAccessibleName(/woche läuft noch$/)
  })

  it('öffnet den bericht der eigenen woche', async () => {
    const user = userEvent.setup()
    const spion = zeile(marke())

    await user.click(screen.getByRole('button'))
    expect(spion).toHaveBeenCalledWith('2026-09-14')
  })

  it('zeigt ohne marke nichts — ein bericht über nichts ist ein leerer knopf', () => {
    zeile(undefined)
    expect(screen.queryByRole('button')).toBeNull()
  })
})
