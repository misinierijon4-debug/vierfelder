// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { EniEinstellungen } from './EniEinstellungen'
import { STANDARD, vorschau } from '../../lib/eniEinstellungen'
import type { EniEinstellungen as Stand } from '../../lib/eniEinstellungen'
import type { RechercheApi, RollenAkteStand } from '../../lib/eniRollenWissen'

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

const AAJONUS = { id: 'eigen-aajonus', name: 'Aajonus Vonderplanitz', thema: '', anweisung: 'Du bist Aajonus.', aktiv: true }

function akteStand(mehr: Partial<RollenAkteStand> = {}): RollenAkteStand {
  return {
    rolleId: AAJONUS.id,
    name: AAJONUS.name,
    status: 'fertig',
    schritte: [],
    akte: '# Aajonus Vonderplanitz\n\n## Kernideen\n\nRoh essen [1].',
    akteName: AAJONUS.name,
    quellen: 12,
    fehler: null,
    gesperrtBis: null,
    fertigAm: '2026-10-01T16:00:00Z',
    ...mehr,
  }
}

function recherche(akten: RollenAkteStand[] = []) {
  return {
    verfuegbar: true,
    laden: vi.fn(async () => structuredClone(akten)),
    starten: vi.fn(async () => {}),
    abbrechen: vi.fn(async () => {}),
    anstossen: vi.fn(async () => {}),
    speichern: vi.fn(async () => {}),
    loeschen: vi.fn(async () => {}),
  } satisfies RechercheApi
}

describe('ENI anpassen: Rollen recherchieren', () => {
  const mitRolle = () => api({ ...STANDARD, rollen: [AAJONUS] })

  it('startet die Recherche zu einer Rolle und stößt den Server an', async () => {
    const dienst = recherche()
    await zeige(mitRolle(), { recherche: dienst })
    await klick(screen.getByRole('button', { name: /Aajonus Vonderplanitz/ }))
    await klick(screen.getByRole('button', { name: 'recherchieren' }))
    expect(dienst.starten).toHaveBeenCalledWith(AAJONUS)
    expect(dienst.anstossen).toHaveBeenCalled()
  })

  it('zeigt, wie weit die Recherche ist, und bricht sie auf Wunsch ab', async () => {
    const dienst = recherche([
      akteStand({
        status: 'laeuft',
        akte: '',
        schritte: [
          { art: 'wiki', erledigt: true, versuche: 0 },
          { art: 'planen', erledigt: true, versuche: 0 },
          { art: 'suche', frage: 'Aajonus We Want To Live summary', erledigt: false, versuche: 0 },
          { art: 'suche', frage: 'Aajonus quotes', erledigt: false, versuche: 0 },
        ],
      }),
    ])
    await zeige(mitRolle(), { recherche: dienst })
    expect(screen.getByText('recherchiert 50 %')).toBeInTheDocument()
    await klick(screen.getByRole('button', { name: /Aajonus Vonderplanitz/ }))
    expect(screen.getByRole('progressbar', { name: 'Recherche zu Aajonus Vonderplanitz' })).toHaveAttribute('aria-valuenow', '50')
    expect(screen.getByText('recherchiert · 2 von 4')).toBeInTheDocument()
    expect(screen.getByText('sucht: Aajonus We Want To Live summary')).toBeInTheDocument()
    await klick(screen.getByRole('button', { name: 'abbrechen' }))
    expect(dienst.abbrechen).toHaveBeenCalledWith(AAJONUS.id)
  })

  it('öffnet die fertige Akte und speichert eine Korrektur', async () => {
    const dienst = recherche([akteStand()])
    await zeige(mitRolle(), { recherche: dienst })
    await klick(screen.getByRole('button', { name: /Aajonus Vonderplanitz/ }))
    expect(screen.getByText('Akte fertig')).toBeInTheDocument()
    await klick(screen.getByRole('button', { name: 'Akte ansehen' }))
    const ansicht = screen.getByRole('dialog', { name: 'Akte: Aajonus Vonderplanitz' })
    expect(ansicht).toHaveTextContent('Roh essen [1].')
    await klick(screen.getByRole('button', { name: 'bearbeiten' }))
    await act(async () => {
      fireEvent.change(screen.getByLabelText('Akte bearbeiten'), { target: { value: '# Aajonus\n\nKorrigiert.' } })
    })
    await klick(screen.getByRole('button', { name: 'speichern' }))
    expect(dienst.speichern).toHaveBeenCalledWith(AAJONUS.id, '# Aajonus\n\nKorrigiert.')
    await klick(screen.getByRole('button', { name: 'Akte schließen' }))
    expect(screen.queryByRole('dialog', { name: /Akte:/ })).not.toBeInTheDocument()
  })

  it('löscht mit der Rolle auch ihre Akte', async () => {
    const dienst = recherche([akteStand()])
    await zeige(mitRolle(), { recherche: dienst })
    await klick(screen.getByRole('button', { name: /Aajonus Vonderplanitz/ }))
    await klick(screen.getByRole('button', { name: 'Rolle löschen' }))
    expect(dienst.loeschen).toHaveBeenCalledWith(AAJONUS.id)
  })

  it('sagt im Prototyp, dass die Recherche eine Anmeldung braucht', async () => {
    const dienst = { ...recherche(), verfuegbar: false }
    await zeige(mitRolle(), { recherche: dienst })
    await klick(screen.getByRole('button', { name: /Aajonus Vonderplanitz/ }))
    expect(screen.getByRole('button', { name: 'recherchieren' })).toBeDisabled()
    expect(screen.getByText('Die Recherche braucht eine Anmeldung.')).toBeInTheDocument()
  })

  it('zeigt, warum eine Recherche gescheitert ist', async () => {
    const dienst = recherche([akteStand({ status: 'fehler', akte: '', fehler: 'Für die Recherche fehlt INFRON_API_KEY.' })])
    await zeige(mitRolle(), { recherche: dienst })
    await klick(screen.getByRole('button', { name: /Aajonus Vonderplanitz/ }))
    expect(screen.getByText(/Für die Recherche fehlt INFRON_API_KEY/)).toBeInTheDocument()
    await klick(screen.getByRole('button', { name: 'nochmal recherchieren' }))
    expect(dienst.starten).toHaveBeenCalled()
  })
})
