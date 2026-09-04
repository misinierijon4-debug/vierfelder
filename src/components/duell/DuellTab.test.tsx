/** @vitest-environment jsdom */

import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { berechneDuell } from '../../lib/duell'
import { weekDays } from '../../lib/dates'
import { tickKey } from '../../lib/types'
import type { Abrechnung, Zustand } from '../../lib/types'
import { DuellTab } from './DuellTab'

afterEach(cleanup)

function leer(): Zustand {
  return { einheiten: {}, gewichte: {}, aufenthalte: [] }
}

function archiv(woche: string): Abrechnung {
  return {
    woche,
    sieger: 'koray',
    grund: 'punkte',
    differenz: -2,
    belegErijon: 1,
    belegKoray: 3,
    wette: null,
    abgeschlossen: '2026-08-23T16:00:00.000Z',
  }
}

function zeige(
  heute: Date,
  zustand: Zustand,
  abrechnungen: Abrechnung[] = [],
  abschlussStatus: 'idle' | 'speichern' | 'fehler' | 'gespeichert' = 'idle'
) {
  const woche = weekDays(heute)
  return render(
    <DuellTab
      zustand={zustand}
      woche={woche}
      me="erijon"
      heute={heute}
      match={berechneDuell(zustand, woche, woche[0]!, 'erijon')}
      wette=""
      onWette={vi.fn()}
      onZumTracker={vi.fn()}
      abrechnung={abrechnungen.find((a) => a.woche === woche[0]) ?? null}
      abrechnungen={abrechnungen}
      abschlussStatus={abschlussStatus}
      onAbschluss={vi.fn()}
    />
  )
}

describe('DuellTab Archive und Abschlussstatus', () => {
  it('zeigt fuer ein Archiv nur gespeicherte Evidenz statt neu erfundener Punktestaende', () => {
    const heute = new Date(2026, 7, 24, 12)
    const zustand = leer()
    zustand.einheiten[tickKey('erijon', 'gym', '2026-08-17')] = [
      { id: 'spaet', user: 'erijon', area: 'gym', tag: '2026-08-17', wert: 60, erfasst: null },
    ]
    zeige(heute, zustand, [archiv('2026-08-17')])
    const bilanz = screen.getByRole('heading', { name: /ewige bilanz/i }).closest('section')!
    const inBilanz = within(bilanz)

    expect(inBilanz.getByText('archiviert')).toBeTruthy()
    const abstand = inBilanz.getByLabelText('archivierter abstand aus deiner sicht: -2')
    expect(abstand.textContent).toContain('-2')
    expect(inBilanz.queryByLabelText('1 zu 0')).toBeNull()
  })

  it('zeigt einen unbestaetigten Abschluss als laufend und sperrt Doppelklicks', () => {
    zeige(new Date(2026, 7, 30, 19), leer(), [], 'speichern')

    expect(screen.getByRole('status').textContent).toContain('abschluss wird gespeichert')
    expect((screen.getByRole('button', { name: 'wird gespeichert …' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('bietet nach einem Abschlussfehler denselben sicheren Versuch erneut an', () => {
    zeige(new Date(2026, 7, 30, 19), leer(), [], 'fehler')

    expect(screen.getByRole('status').textContent).toContain('abschluss nicht gespeichert')
    expect((screen.getByRole('button', { name: 'erneut versuchen' }) as HTMLButtonElement).disabled).toBe(false)
  })
})
