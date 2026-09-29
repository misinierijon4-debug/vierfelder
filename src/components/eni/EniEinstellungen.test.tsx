// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { EniEinstellungen } from './EniEinstellungen'
import { STANDARD, vorschau } from '../../lib/eniEinstellungen'
import type { EniEinstellungen as Stand } from '../../lib/eniEinstellungen'

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true
  }
  HTMLDialogElement.prototype.close = function () {
    this.open = false
  }
})
// nur die zeitgeber stehen still, damit das verzögerte speichern prüfbar ist
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

function api(start: Stand = STANDARD) {
  return {
    laden: vi.fn(async () => structuredClone(start)),
    speichern: vi.fn(async (_konto: string | null, _e: Stand) => {}),
  }
}

async function zeige(dienst: ReturnType<typeof api>, weiter: Partial<Parameters<typeof EniEinstellungen>[0]> = {}) {
  await act(async () => {
    render(<EniEinstellungen offen kontoId="ich" me="erijon" api={dienst} onSchliessen={() => {}} {...weiter} />)
  })
}

async function klick(element: HTMLElement) {
  await act(async () => {
    fireEvent.click(element)
  })
}

async function warteAufSpeichern() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(800)
  })
}

describe('ENI anpassen', () => {
  it('zeigt den Ton sofort in der Vorschau und speichert ihn kurz danach', async () => {
    const dienst = api()
    await zeige(dienst)
    expect(screen.getByText(vorschau('standard', 'normal'))).toBeInTheDocument()

    await klick(screen.getByRole('radio', { name: /Streng/ }))
    await klick(screen.getByRole('radio', { name: 'Kurz' }))
    expect(screen.getByText(vorschau('streng', 'kurz'))).toBeInTheDocument()
    expect(dienst.speichern).not.toHaveBeenCalled()

    await warteAufSpeichern()
    expect(dienst.speichern).toHaveBeenCalledTimes(1)
    expect(dienst.speichern).toHaveBeenCalledWith('ich', expect.objectContaining({ ton: 'streng', laenge: 'kurz' }))
    expect(screen.getByText('gespeichert')).toBeInTheDocument()
  })

  it('schaltet eine Rolle ein und legt eine eigene an', async () => {
    const dienst = api()
    await zeige(dienst)
    await klick(screen.getByRole('switch', { name: 'Ernährungsberater einschalten' }))
    expect(screen.getByRole('switch', { name: 'Ernährungsberater ausschalten' })).toBeChecked()

    await klick(screen.getByRole('button', { name: 'Eigene Rolle' }))
    await act(async () => {
      fireEvent.change(screen.getByLabelText('Wer soll ENI sein?'), { target: { value: 'Faszienberater' } })
      fireEvent.change(screen.getByLabelText('Wie soll ENI sich verhalten?'), {
        target: { value: 'Gib mir jeden Abend zehn Minuten Routine.' },
      })
    })
    await warteAufSpeichern()
    const gespeichert = dienst.speichern.mock.lastCall![1]
    expect(gespeichert.rollen).toEqual([
      expect.objectContaining({ id: 'ernaehrung', aktiv: true }),
      expect.objectContaining({
        name: 'Faszienberater',
        anweisung: 'Gib mir jeden Abend zehn Minuten Routine.',
        aktiv: true,
      }),
    ])
  })

  it('schreibt beim Schließen sofort, was noch offen ist', async () => {
    const dienst = api()
    const schliessen = vi.fn()
    await zeige(dienst, { onSchliessen: schliessen })
    await act(async () => {
      fireEvent.change(screen.getByLabelText('Eigene Anweisungen'), { target: { value: 'Nenn mich Chef.' } })
    })
    await klick(screen.getByRole('button', { name: 'Einstellungen schließen' }))
    expect(schliessen).toHaveBeenCalled()
    expect(dienst.speichern).toHaveBeenCalledWith('ich', expect.objectContaining({ anweisungen: 'Nenn mich Chef.' }))
  })

  it('sagt, wenn das Speichern scheitert, und versucht es auf Wunsch erneut', async () => {
    const dienst = api()
    dienst.speichern.mockRejectedValueOnce(new Error('Netz weg'))
    await zeige(dienst)
    await klick(screen.getByRole('radio', { name: /Locker/ }))
    await warteAufSpeichern()
    expect(screen.getByRole('alert')).toHaveTextContent('Netz weg')

    await klick(screen.getByRole('button', { name: 'erneut' }))
    expect(dienst.speichern).toHaveBeenCalledTimes(2)
    expect(dienst.speichern).toHaveBeenLastCalledWith('ich', expect.objectContaining({ ton: 'locker' }))
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('zeigt einen Ladefehler statt leerer Einstellungen, die den Stand überschreiben würden', async () => {
    const dienst = api()
    dienst.laden.mockRejectedValueOnce(new Error('Die Migration eni_einstellungen fehlt'))
    await zeige(dienst)
    expect(screen.getByRole('alert')).toHaveTextContent('Migration eni_einstellungen fehlt')
    expect(screen.queryByRole('radio', { name: /Streng/ })).toBeNull()
    await klick(screen.getByRole('button', { name: 'erneut versuchen' }))
    expect(screen.getByRole('radio', { name: /Streng/ })).toBeInTheDocument()
  })

  it('führt zum Gedächtnis', async () => {
    const gedaechtnis = vi.fn()
    await zeige(api(), { onGedaechtnis: gedaechtnis })
    await klick(screen.getByRole('button', { name: /Was ENI sich gemerkt hat/ }))
    expect(gedaechtnis).toHaveBeenCalled()
  })
})
