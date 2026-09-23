/** @vitest-environment jsdom */

import { cleanup, render, screen, within } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
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
      me="erijon"
      heute={heute}
      match={berechneDuell(zustand, woche, woche[0]!, 'erijon')}
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

  it('kennzeichnet unverändert übernommene clientarchive sichtbar als legacy', () => {
    const alt = { ...archiv('2026-08-17'), archivQuelle: 'legacy_client' as const }
    zeige(new Date(2026, 7, 24, 12), leer(), [alt])

    expect(screen.getByText('legacy-archiv')).toBeTruthy()
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

describe('DuellTab ansagen', () => {
  it('zeigt den bereich nur, wenn das backend ansagen kennt', async () => {
    const heute = new Date(2026, 8, 22, 12)
    const woche = weekDays(heute)
    const basis = {
      zustand: leer(), me: 'erijon' as const, heute,
      match: berechneDuell(leer(), woche, woche[1]!, 'erijon'),
      abrechnung: null, abrechnungen: [], abschlussStatus: 'idle' as const,
    }
    const { rerender } = render(<DuellTab {...basis} />)
    expect(screen.queryByRole('heading', { name: /ansagen/i })).toBeNull()
    rerender(<DuellTab {...basis} ansagen={[]} onSageAn={vi.fn()} />)
    expect(await screen.findByRole('heading', { name: /ansagen/i })).toBeInTheDocument()
  })

  it('zeigt ansagen zuoberst, darunter belegquote und ewige bilanz', async () => {
    const heute = new Date(2026, 8, 22, 12)
    const woche = weekDays(heute)
    render(
      <DuellTab
        zustand={leer()} me="erijon" heute={heute}
        match={berechneDuell(leer(), woche, woche[1]!, 'erijon')}
        abrechnung={null} abrechnungen={[]} abschlussStatus="idle"
        ansagen={[]} onSageAn={vi.fn()}
      />
    )
    await screen.findByRole('heading', { name: /ansagen/i })

    const titel = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent?.trim().toLowerCase())
    expect(titel).toEqual(['ansagen', 'belegquote', 'ewige bilanz'])
    expect(screen.queryByText(/fronten/i)).toBeNull()
    expect(screen.queryByText('rechner')).toBeNull()
    expect(screen.queryByText('aktivitätsfeed')).toBeNull()
    expect(screen.queryByText('wetteinsatz')).toBeNull()
  })
})
