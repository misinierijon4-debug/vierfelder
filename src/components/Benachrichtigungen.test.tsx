/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { hatNeustartBlocker } from '../lib/pwaBlocker'
import { Benachrichtigungen } from './Benachrichtigungen'

const mock = vi.hoisted(() => ({
  pushZustand: vi.fn(),
  pushProbe: vi.fn(),
  pushAnmelden: vi.fn(),
  pushAbmelden: vi.fn(),
  ladeZeit: vi.fn(),
  setzeZeit: vi.fn(),
  ladeErinnerung: vi.fn(),
  setzeAktiv: vi.fn(),
}))

vi.mock('../lib/push', () => ({
  alsAppInstalliert: () => true,
  istApple: () => false,
  pushAbmelden: mock.pushAbmelden,
  pushAnmelden: mock.pushAnmelden,
  pushProbe: mock.pushProbe,
  pushZustand: mock.pushZustand,
}))

vi.mock('../lib/erinnerung', () => ({
  ladeGewichtErinnerungszeit: mock.ladeZeit,
  setzeGewichtErinnerungszeit: mock.setzeZeit,
  ladeGewichtErinnerung: mock.ladeErinnerung,
  setzeGewichtAktiv: mock.setzeAktiv,
}))

function spaeter<T>() {
  let resolve!: (wert: T) => void
  let reject!: (grund?: unknown) => void
  const promise = new Promise<T>((ja, nein) => {
    resolve = ja
    reject = nein
  })
  return { promise, resolve, reject }
}

beforeEach(() => {
  vi.clearAllMocks()
  mock.pushZustand.mockResolvedValue('an')
  mock.pushProbe.mockResolvedValue({ gesendet: 1 })
  mock.pushAnmelden.mockResolvedValue('an')
  mock.pushAbmelden.mockResolvedValue(undefined)
  mock.ladeZeit.mockResolvedValue('20:00')
  mock.setzeZeit.mockResolvedValue(undefined)
  mock.ladeErinnerung.mockResolvedValue({ zeit: '20:00', aktiv: true })
  mock.setzeAktiv.mockResolvedValue(undefined)
})

afterEach(() => {
  cleanup()
  expect(hatNeustartBlocker()).toBe(false)
})

describe('Benachrichtigungen Neustartschutz', () => {
  it('hält den Blocker bis Push-Aktion und Zustandsbestätigung beendet sind', async () => {
    const user = userEvent.setup()
    const push = spaeter<{ gesendet: number }>()
    mock.pushProbe.mockReturnValueOnce(push.promise)
    render(<Benachrichtigungen />)

    const knopf = await screen.findByRole('button', { name: 'probe senden' })
    await user.click(knopf)
    expect(hatNeustartBlocker()).toBe(true)
    expect(knopf).toBeDisabled()

    push.resolve({ gesendet: 1 })
    await waitFor(() => expect(hatNeustartBlocker()).toBe(false))
    expect(knopf).toBeEnabled()
  })

  it('schützt auch eine laufende Erinnerungszeit-Mutation', async () => {
    const speichern = spaeter<void>()
    mock.setzeZeit.mockReturnValueOnce(speichern.promise)
    render(<Benachrichtigungen />)

    const feld = await screen.findByLabelText('uhrzeit der gewichtserinnerung')
    fireEvent.change(feld, { target: { value: '20:30' } })
    expect(hatNeustartBlocker()).toBe(true)
    expect(feld).toBeDisabled()

    speichern.resolve()
    await waitFor(() => expect(hatNeustartBlocker()).toBe(false))
    expect(feld).toBeEnabled()
  })

  it('schützt auch eine laufende Gewichtsaktivierungs-Mutation', async () => {
    const user = userEvent.setup()
    const speichern = spaeter<void>()
    mock.setzeAktiv.mockReturnValueOnce(speichern.promise)
    render(<Benachrichtigungen />)

    const checkbox = await screen.findByRole('checkbox', { name: 'gewicht erinnern' })
    await user.click(checkbox)
    expect(hatNeustartBlocker()).toBe(true)
    expect(checkbox).toBeDisabled()

    speichern.resolve()
    await waitFor(() => expect(hatNeustartBlocker()).toBe(false))
    expect(checkbox).toBeEnabled()
  })

  it('gibt den Blocker frei und meldet eine fehlende Zustandsbestätigung', async () => {
    const user = userEvent.setup()
    mock.pushZustand
      .mockResolvedValueOnce('an')
      .mockRejectedValueOnce(new Error('netz'))
    render(<Benachrichtigungen />)

    await user.click(await screen.findByRole('button', { name: 'probe senden' }))
    expect(await screen.findByText('benachrichtigungsstatus konnte nicht bestätigt werden.')).toBeInTheDocument()
    expect(hatNeustartBlocker()).toBe(false)
    expect(screen.getByRole('button', { name: 'probe senden' })).toBeEnabled()
  })

  it('zeigt Aktionen und Erinnerungen im gemeinsamen Menü', async () => {
    render(<Benachrichtigungen />)

    expect(await screen.findByText('benachrichtigungen')).toBeInTheDocument()
    expect(screen.getByText('benachrichtigungen an')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'probe senden' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'benachrichtigungen ausschalten' })).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: 'gewicht erinnern' })).toBeInTheDocument()
    expect(screen.getByLabelText('uhrzeit der gewichtserinnerung')).toBeInTheDocument()
  })
})