/** @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { WochenEinladung } from '../lib/wochenEinladung'

const mock = vi.hoisted(() => ({
  laden: vi.fn(),
  schliessen: vi.fn(),
  oeffnen: vi.fn(),
}))

vi.mock('../lib/wochenEinladung', () => ({
  ladeEniWochenEinladungen: mock.laden,
  schliesseEniWochenEinladung: mock.schliessen,
}))
vi.mock('../lib/eniRoute', () => ({ oeffneEniWoche: mock.oeffnen }))

import { WochenRueckblickEinladung } from './WochenRueckblickEinladung'

const JETZT = new Date('2026-09-20T20:05:00+02:00')

function einladung(
  wochenbeginn: string,
  faelligAm = '2026-09-20T18:00:00+02:00',
): WochenEinladung {
  return {
    wochenbeginn,
    faellig_am: faelligAm,
    geschlossen_am: null,
    erstellt: `${wochenbeginn}T18:00:00+02:00`,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mock.laden.mockResolvedValue([])
  mock.schliessen.mockResolvedValue({
    ...einladung('2026-09-14'),
    geschlossen_am: '2026-09-20T20:06:00+02:00',
  })
})

afterEach(() => cleanup())

describe('WochenRueckblickEinladung', () => {
  it('zeigt ohne offene Zeile keine Karte', async () => {
    render(<WochenRueckblickEinladung kontoId="konto-a" jetzt={JETZT} />)

    await waitFor(() => expect(mock.laden).toHaveBeenCalledOnce())
    expect(screen.queryByText('Willst du, dass ENI deine Woche zusammenfasst?')).toBeNull()
  })

  it('zeigt nur faellige offene Wochen und die aelteste zuerst', async () => {
    mock.laden.mockResolvedValue([
      einladung('2026-09-14'),
      einladung('2026-09-21', '2026-09-27T18:00:00+02:00'),
    ])
    render(<WochenRueckblickEinladung kontoId="konto-a" jetzt={JETZT} />)

    expect(await screen.findByText('Willst du, dass ENI deine Woche zusammenfasst?')).toBeInTheDocument()
    expect(screen.getByText(/14\.–20\. september/i)).toBeInTheDocument()
    expect(screen.getByText(/1 offene woche/i)).toBeInTheDocument()
    expect(screen.queryByText(/21\.–27\. september/i)).toBeNull()
  })

  it('oeffnet die Woche und laesst die Einladung sichtbar', async () => {
    const user = userEvent.setup()
    mock.laden.mockResolvedValue([einladung('2026-09-14')])
    const onWocheOeffnen = vi.fn()
    render(
      <WochenRueckblickEinladung
        kontoId="konto-a"
        jetzt={JETZT}
        onWocheOeffnen={onWocheOeffnen}
      />,
    )

    await user.click(await screen.findByRole('button', { name: 'Woche ansehen' }))
    expect(onWocheOeffnen).toHaveBeenCalledWith('2026-09-14')
    expect(screen.getByText('Willst du, dass ENI deine Woche zusammenfasst?')).toBeInTheDocument()
    expect(mock.schliessen).not.toHaveBeenCalled()
  })

  it('entfernt eine Woche erst nach bestaetigtem Schliessen', async () => {
    const user = userEvent.setup()
    mock.laden.mockResolvedValue([einladung('2026-09-14')])
    render(<WochenRueckblickEinladung kontoId="konto-a" jetzt={JETZT} />)

    await user.click(await screen.findByRole('button', { name: 'Schließen' }))
    await waitFor(() => expect(mock.schliessen).toHaveBeenCalledWith('2026-09-14'))
    await waitFor(() => expect(screen.queryByText('Willst du, dass ENI deine Woche zusammenfasst?')).toBeNull())
  })

  it('laesst die Karte bei Nulltreffer oder Fehler stehen und zeigt den Fehler', async () => {
    const user = userEvent.setup()
    mock.laden.mockResolvedValue([einladung('2026-09-14')])
    mock.schliessen.mockResolvedValueOnce(null)
    render(<WochenRueckblickEinladung kontoId="konto-a" jetzt={JETZT} />)

    await user.click(await screen.findByRole('button', { name: 'Schließen' }))
    expect(await screen.findByText(/nicht bestätigt geschlossen/i)).toBeInTheDocument()
    expect(screen.getByText('Willst du, dass ENI deine Woche zusammenfasst?')).toBeInTheDocument()

    mock.schliessen.mockRejectedValueOnce(new Error('netz'))
    await user.click(screen.getByRole('button', { name: 'Schließen' }))
    expect(await screen.findByText('netz')).toBeInTheDocument()
    expect(screen.getByText('Willst du, dass ENI deine Woche zusammenfasst?')).toBeInTheDocument()
  })

  it('verwirft eine spaete Antwort des vorherigen Kontos', async () => {
    let resolveA!: (wert: WochenEinladung[]) => void
    const antwortA = new Promise<WochenEinladung[]>((resolve) => { resolveA = resolve })
    mock.laden.mockReturnValueOnce(antwortA).mockResolvedValueOnce([einladung('2026-09-21')])
    const { rerender } = render(<WochenRueckblickEinladung kontoId="konto-a" jetzt={JETZT} />)
    rerender(<WochenRueckblickEinladung kontoId="konto-b" jetzt={JETZT} />)

    expect(await screen.findByText(/21\.–27\. september/i)).toBeInTheDocument()
    resolveA([einladung('2026-09-07')])
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(screen.queryByText(/7\.–13\. september/i)).toBeNull()
  })

  it('zeigt im Prototyp nie eine serverseitige Einladung', async () => {
    render(<WochenRueckblickEinladung art="lokal" kontoId="konto-a" jetzt={JETZT} />)

    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(mock.laden).not.toHaveBeenCalled()
    expect(screen.queryByText('Willst du, dass ENI deine Woche zusammenfasst?')).toBeNull()
  })
})
