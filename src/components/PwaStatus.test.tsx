/** @vitest-environment jsdom */

import { cleanup, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PwaStatus } from './PwaStatus'

const mock = vi.hoisted(() => ({
  pwa: {
    online: true,
    offlineBereit: false,
    update: 'keins' as 'keins' | 'bereit' | 'aktivierung' | 'neu-laden',
    fehler: null as string | null,
    pruefbar: false,
  },
  blocker: { anzahl: 0 },
  aktiviere: vi.fn(async () => true),
  neuLaden: vi.fn(() => true),
  pruefe: vi.fn(async () => true),
}))

vi.mock('../lib/pwa', () => ({
  usePwaStand: () => mock.pwa,
  aktivierePwaUpdate: mock.aktiviere,
  ladePwaNeu: mock.neuLaden,
  pruefePwaUpdate: mock.pruefe,
}))

vi.mock('../lib/pwaBlocker', () => ({
  useNeustartBlockerStand: () => mock.blocker,
}))

afterEach(() => {
  cleanup()
  mock.pwa.online = true
  mock.pwa.offlineBereit = false
  mock.pwa.update = 'keins'
  mock.pwa.fehler = null
  mock.pwa.pruefbar = false
  mock.blocker.anzahl = 0
  vi.clearAllMocks()
})

describe('PwaStatus', () => {
  it('blockiert die Aktivierung bei einem offenen Entwurf', () => {
    mock.pwa.update = 'bereit'
    mock.blocker.anzahl = 1
    render(<PwaStatus />)
    expect(screen.getByRole('status')).toHaveTextContent('erst offene eingabe abschließen')
    expect(screen.getByRole('button', { name: 'aktualisieren' })).toBeDisabled()
  })

  it('aktiviert und lädt ausschließlich über die sichtbaren Knöpfe', async () => {
    const user = userEvent.setup()
    mock.pwa.update = 'bereit'
    const ansicht = render(<PwaStatus />)
    await user.click(screen.getByRole('button', { name: 'aktualisieren' }))
    expect(mock.aktiviere).toHaveBeenCalledOnce()
    expect(mock.neuLaden).not.toHaveBeenCalled()

    mock.pwa.update = 'neu-laden'
    ansicht.rerender(<PwaStatus />)
    await user.click(screen.getByRole('button', { name: 'neu laden' }))
    expect(mock.neuLaden).toHaveBeenCalledOnce()
  })

  it('beschränkt die Offline-Aussage auf den belegbaren Netzwerkzustand', () => {
    mock.pwa.online = false
    render(<PwaStatus />)
    const status = screen.getByRole('status')
    expect(status).toHaveTextContent('netzwerk nicht verfügbar')
    expect(status).not.toHaveTextContent(/gespeichert/i)
    expect(status).not.toHaveTextContent(/synchron/i)
  })

  it('bezeichnet nur die Oberfläche als offline verfügbar', () => {
    mock.pwa.offlineBereit = true
    render(<PwaStatus />)
    expect(screen.getByRole('status')).toHaveTextContent('app-oberfläche ist jetzt offline verfügbar')
  })

  it('bietet je nach Fehler einen echten Prüf- oder Reload-Weg an', async () => {
    const user = userEvent.setup()
    mock.pwa.fehler = 'aktualisierung konnte nicht geprüft werden.'
    mock.pwa.pruefbar = true
    const ansicht = render(<PwaStatus />)
    await user.click(screen.getByRole('button', { name: 'erneut' }))
    expect(mock.pruefe).toHaveBeenCalledOnce()
    expect(mock.neuLaden).not.toHaveBeenCalled()

    mock.pwa.pruefbar = false
    ansicht.rerender(<PwaStatus />)
    await user.click(screen.getByRole('button', { name: 'neu laden' }))
    expect(mock.neuLaden).toHaveBeenCalledOnce()
  })

  it('verdeckt einen Aktivierungsfehler nicht mit dem Bereit-Status', () => {
    mock.pwa.update = 'bereit'
    mock.pwa.fehler = 'aktualisierung konnte nicht aktiviert werden.'
    render(<PwaStatus />)
    expect(screen.getByRole('status')).toHaveTextContent(mock.pwa.fehler)
    expect(screen.getByRole('button', { name: 'aktualisieren' })).toBeEnabled()
  })

  it('reserviert die gemessene Höhe, damit der feste Hinweis keine Aktion verdeckt', () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      width: 300,
      height: 68,
      top: 0,
      right: 300,
      bottom: 68,
      left: 0,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    })
    mock.pwa.update = 'bereit'
    const ansicht = render(<PwaStatus />)

    expect(document.documentElement.style.getPropertyValue('--pwa-status-reserve')).toBe('68px')
    ansicht.unmount()
    expect(document.documentElement.style.getPropertyValue('--pwa-status-reserve')).toBe('0px')
  })
})
