// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { EniRollenwahl } from './EniRollenwahl'
import { EINSTELLUNGEN_GESPEICHERT, ROLLEN_VORLAGEN, STANDARD } from '../../lib/eniEinstellungen'
import type { EniEinstellungen } from '../../lib/eniEinstellungen'

afterEach(cleanup)

function dienst(start: EniEinstellungen = STANDARD) {
  let stand = structuredClone(start)
  return {
    laden: vi.fn(async () => structuredClone(stand)),
    speichern: vi.fn(async (_konto: string | null, neu: EniEinstellungen) => { stand = structuredClone(neu) }),
    aendere: (neu: EniEinstellungen) => { stand = structuredClone(neu) },
  }
}

async function zeige(api: ReturnType<typeof dienst>, onSpeichert = vi.fn()) {
  await act(async () => { render(<EniRollenwahl kontoId="ich" api={api} onSpeichert={onSpeichert} />) })
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Rollen wählen/ })) })
  return onSpeichert
}

async function klick(name: string) {
  await act(async () => { fireEvent.click(screen.getByRole('menuitemcheckbox', { name })) })
}

describe('Rollen direkt am Chat', () => {
  it('kürzt Vorlagen sichtbar und bewahrt geänderte und eigene Rollennamen', async () => {
    const api = dienst({ ...STANDARD, rollen: [
      { ...ROLLEN_VORLAGEN[1]!, name: 'Mein Kraftcoach' },
      { id: 'eigen-a', name: 'Mein Abendbegleiter', thema: 'Abend', anweisung: 'Hilf mir.', aktiv: false },
    ] })
    await zeige(api)
    expect(screen.getByRole('menuitemcheckbox', { name: 'Ernährungsberater' })).toHaveTextContent('Ernährung')
    expect(screen.getByRole('menuitemcheckbox', { name: 'Mein Kraftcoach' })).toHaveTextContent('Mein Kraftcoach')
    expect(screen.getByRole('menuitemcheckbox', { name: 'Mein Abendbegleiter' })).toHaveTextContent('Mein Abendbegleiter')
  })

  it('zeigt Vorlagen und eigene Rollen, speichert privat und behält aktuelle Anweisungen', async () => {
    const eigen = { id: 'eigen-p', name: 'Peptide Coach', thema: 'Peptide', anweisung: 'Erkläre Studien.', aktiv: true }
    const api = dienst({ ...STANDARD, rollen: [eigen] })
    await zeige(api)
    expect(screen.getAllByRole('menuitemcheckbox')).toHaveLength(7)
    expect(screen.getByRole('menuitemcheckbox', { name: eigen.name })).toBeChecked()
    // neue anweisungen dürfen von einer schon geöffneten rollenliste nicht überschrieben werden.
    api.aendere({ ...STANDARD, ton: 'sachlich', anweisungen: 'Nenn mich Chef.', rollen: [eigen] })
    await klick('Lerncoach')
    expect(api.speichern).toHaveBeenCalledWith('ich', expect.objectContaining({
      ton: 'sachlich', anweisungen: 'Nenn mich Chef.',
      rollen: [eigen, expect.objectContaining({ id: 'lernen', aktiv: true })],
    }))
    expect(screen.getByRole('menuitemcheckbox', { name: 'Lerncoach' })).toBeChecked()
    expect(screen.getByRole('button', { name: /Rollen wählen/ })).toHaveTextContent('2 Rollen')
    await klick('Lerncoach')
    expect(screen.getByRole('menuitemcheckbox', { name: 'Lerncoach' })).not.toBeChecked()
    expect(screen.getByRole('button', { name: /Rollen wählen/ })).toHaveTextContent(eigen.name)
  })

  it('behält die bisherige Auswahl bei Speicherfehlern und erlaubt einen neuen Versuch', async () => {
    const api = dienst()
    api.speichern.mockRejectedValueOnce(new Error('Keine Verbindung.'))
    await zeige(api)
    await klick('Boxtrainer')
    expect(screen.getByRole('alert')).toHaveTextContent('Keine Verbindung.')
    expect(screen.getByRole('menuitemcheckbox', { name: 'Boxtrainer' })).not.toBeChecked()
    await klick('Boxtrainer')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByRole('menuitemcheckbox', { name: 'Boxtrainer' })).toBeChecked()
  })

  it('sperrt doppelte Klicks und meldet dem Chat die laufende Speicherung', async () => {
    const api = dienst()
    let fertig!: () => void
    api.speichern.mockImplementationOnce(() => new Promise<void>((resolve) => { fertig = resolve }))
    const status = await zeige(api)
    await klick('Schlafcoach')
    expect(status).toHaveBeenLastCalledWith(true)
    expect(screen.getByRole('menuitemcheckbox', { name: 'Lerncoach' })).toBeDisabled()
    await klick('Schlafcoach')
    expect(api.speichern).toHaveBeenCalledTimes(1)
    await act(async () => fertig())
    expect(status).toHaveBeenLastCalledWith(false)
    expect(screen.getByRole('menuitemcheckbox', { name: 'Schlafcoach' })).toBeChecked()
  })

  it('übernimmt Änderungen aus ENI anpassen und lässt sich per Tastatur und daneben schließen', async () => {
    const api = dienst()
    await zeige(api)
    const erste = screen.getByRole('menuitemcheckbox', { name: 'Ernährungsberater' })
    expect(erste).toHaveFocus()
    fireEvent.keyDown(erste, { key: 'ArrowDown' })
    expect(screen.getByRole('menuitemcheckbox', { name: 'Trainingsberater' })).toHaveFocus()
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' })
    expect(screen.getByRole('button', { name: /Rollen wählen/ })).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByRole('button', { name: /Rollen wählen/ })).toHaveFocus()
    api.aendere({ ...STANDARD, rollen: [{ ...ROLLEN_VORLAGEN[4]!, aktiv: true }] })
    await act(async () => { window.dispatchEvent(new Event(EINSTELLUNGEN_GESPEICHERT)) })
    expect(screen.getByRole('button', { name: /Rollen wählen/ })).toHaveTextContent('Lernen')
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Rollen wählen/ })) })
    fireEvent.pointerDown(document.body)
    expect(screen.getByRole('button', { name: /Rollen wählen/ })).toHaveAttribute('aria-expanded', 'false')
  })

  it('zeigt bei Ladefehlern keine erfundene Auswahl und kann erneut laden', async () => {
    const api = dienst()
    api.laden.mockRejectedValue(new Error('Einstellungen nicht erreichbar.'))
    await zeige(api)
    expect(screen.queryByRole('menuitemcheckbox')).not.toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('Einstellungen nicht erreichbar.')
    api.laden.mockResolvedValue(STANDARD)
    await act(async () => { fireEvent.click(screen.getByRole('menuitem', { name: 'erneut laden' })) })
    expect(screen.getAllByRole('menuitemcheckbox')).toHaveLength(6)
  })
})
