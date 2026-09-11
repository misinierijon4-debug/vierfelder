/** @vitest-environment jsdom */

import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { lokalerEniSpeicher } from '../../lib/eniSpeicher'
import type { EniSpeicher } from '../../lib/eniSpeicher'
import { EniApp } from './EniApp'

// jsdom bringt showModal nicht mit. dieselbe kleine kruecke wie im kalender.
beforeAll(() => {
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
    configurable: true,
    value(this: HTMLDialogElement) {
      this.open = true
    },
  })
  Object.defineProperty(HTMLDialogElement.prototype, 'close', {
    configurable: true,
    value(this: HTMLDialogElement) {
      this.open = false
    },
  })
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  localStorage.clear()
})

function zeigeEni(speicher: EniSpeicher = lokalerEniSpeicher('erijon')) {
  const onZurueck = vi.fn()
  const ergebnis = render(<EniApp speicher={speicher} onZurueck={onZurueck} />)
  return { ...ergebnis, speicher, onZurueck }
}

function feld() {
  return screen.getByLabelText('was du ENI vorlegst')
}

function lege(text: string) {
  fireEvent.change(feld(), { target: { value: text } })
  fireEvent.click(screen.getByRole('button', { name: 'vorlegen' }))
}

/** einmal durch: laden, schreiben, takt, urteil */
async function laufeAn(text: string) {
  await act(async () => { await vi.advanceTimersByTimeAsync(10) })
  lege(text)
  await act(async () => { await vi.advanceTimersByTimeAsync(10) })
}

describe('ENI als eigene oberflaeche', () => {
  it('nennt sich ENI in versalien und sagt die herkunft der fassung', async () => {
    vi.useFakeTimers()
    zeigeEni()
    await act(async () => { await vi.advanceTimersByTimeAsync(10) })

    expect(screen.getAllByText('ENI').length).toBeGreaterThan(0)
    expect(screen.getByText(/lokale stimmenprobe/i)).toBeInTheDocument()
    expect(screen.getByText(/noch keine modellverbindung/i)).toBeInTheDocument()
  })

  it('fuehrt mit einem eigenen weg zurueck in die anzeigetafel', async () => {
    vi.useFakeTimers()
    const { onZurueck } = zeigeEni()
    await act(async () => { await vi.advanceTimersByTimeAsync(10) })

    fireEvent.click(screen.getByRole('button', { name: 'zweikampf' }))
    expect(onZurueck).toHaveBeenCalledTimes(1)
  })

  it('bietet im leeren chat drei auftakte an und uebernimmt einen davon ins feld', async () => {
    vi.useFakeTimers()
    zeigeEni()
    await act(async () => { await vi.advanceTimersByTimeAsync(10) })

    const auftakt = screen.getByRole('button', { name: 'wie stehe ich gegen koray' })
    fireEvent.click(auftakt)

    expect(feld()).toHaveValue('wie stehe ich gegen koray')
  })

  it('zeigt erst den takt und danach das urteil', async () => {
    vi.useFakeTimers()
    zeigeEni()
    await laufeAn('ich mache das morgen')

    expect(screen.getByText('ich mache das morgen')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('ENI prüft')

    await act(async () => { await vi.advanceTimersByTimeAsync(900) })

    expect(screen.queryByRole('status')).toBeNull()
    // der satz steht in wort-spans, also wird der ganze strom befragt
    expect(screen.getByLabelText('dialog mit ENI')).toHaveTextContent(
      /Das ist kein Grund, das ist ein Aufschub/
    )
  })

  it('klappt die frisch eingetroffene antwort wort fuer wort auf', async () => {
    vi.useFakeTimers()
    zeigeEni()
    await laufeAn('ich mache das morgen')
    await act(async () => { await vi.advanceTimersByTimeAsync(900) })

    const woerter = document.querySelectorAll<HTMLElement>('.eni-wort')
    expect(woerter.length).toBeGreaterThan(5)
    // der versatz waechst von wort zu wort, sonst stuende alles gleichzeitig da
    expect(woerter[0]?.style.animationDelay).toBe('0ms')
    expect(woerter[3]?.style.animationDelay).not.toBe('0ms')
    // und der text bleibt vollstaendig im dokument, nicht nur im auge
    expect(screen.getByLabelText('dialog mit ENI')).toHaveTextContent('Aufschub')
  })

  it('nimmt keine zweite vorlage an, solange ENI prueft', async () => {
    vi.useFakeTimers()
    zeigeEni()
    await laufeAn('boxen steht')

    expect(feld()).toHaveValue('')
    fireEvent.change(feld(), { target: { value: 'und lesen auch' } })
    expect(screen.getByRole('button', { name: 'vorlegen' })).toBeDisabled()
  })

  it('legt den chat erst mit der ersten vorlage an und benennt ihn danach', async () => {
    vi.useFakeTimers()
    const { speicher } = zeigeEni()
    await laufeAn('koray liegt vorne')
    await act(async () => { await vi.advanceTimersByTimeAsync(900) })

    const chats = await speicher.chats()
    expect(chats).toHaveLength(1)
    expect(chats[0]?.titel).toBe('koray liegt vorne')
    expect(await speicher.nachrichten(chats[0]!.id)).toHaveLength(2)
  })

  it('holt einen alten chat aus dem verlauf zurueck', async () => {
    vi.useFakeTimers()
    const speicher = lokalerEniSpeicher('erijon')
    const alt = await speicher.neuerChat('alte sache')
    await speicher.schreibe(alt.id, 'mensch', 'alte sache')
    await speicher.schreibe(alt.id, 'eni', 'das war vor einer woche.')

    zeigeEni(speicher)
    await act(async () => { await vi.advanceTimersByTimeAsync(10) })

    fireEvent.click(screen.getByRole('button', { name: 'verlauf öffnen' }))
    const verlauf = screen.getByRole('dialog', { name: 'verlauf' })
    fireEvent.click(within(verlauf).getByText('alte sache'))
    await act(async () => { await vi.advanceTimersByTimeAsync(10) })

    // ein alter chat wird gelesen, nicht empfangen: er steht sofort ganz da
    expect(screen.getByText('das war vor einer woche.')).toBeInTheDocument()
    expect(document.querySelectorAll('.eni-wort')).toHaveLength(0)
  })

  it('loescht einen chat erst nach ausdruecklicher nachfrage', async () => {
    vi.useFakeTimers()
    const speicher = lokalerEniSpeicher('erijon')
    const chat = await speicher.neuerChat('weg damit')
    await speicher.schreibe(chat.id, 'mensch', 'weg damit')

    zeigeEni(speicher)
    await act(async () => { await vi.advanceTimersByTimeAsync(10) })
    fireEvent.click(screen.getByRole('button', { name: 'verlauf öffnen' }))

    const verlauf = screen.getByRole('dialog', { name: 'verlauf' })
    fireEvent.click(within(verlauf).getByRole('button', { name: /chat weg damit löschen/i }))
    expect(await speicher.chats()).toHaveLength(1)

    fireEvent.click(within(verlauf).getByRole('button', { name: 'löschen' }))
    await act(async () => { await vi.advanceTimersByTimeAsync(10) })

    expect(await speicher.chats()).toHaveLength(0)
  })

  it('haelt feld und knopf auf mindestens 44 pixeln trefferflaeche', async () => {
    vi.useFakeTimers()
    zeigeEni()
    await act(async () => { await vi.advanceTimersByTimeAsync(10) })

    expect(feld().className).toContain('min-h-11')
    expect(screen.getByRole('button', { name: 'vorlegen' }).className).toContain('min-h-11')
    expect(screen.getByRole('button', { name: 'verlauf öffnen' }).className).toContain('size-11')
    expect(screen.getByRole('button', { name: 'neuer chat' }).className).toContain('size-11')
  })

  it('sagt es, wenn eine vorlage nicht gespeichert werden konnte', async () => {
    vi.useFakeTimers()
    const kaputt: EniSpeicher = {
      ...lokalerEniSpeicher('erijon'),
      neuerChat: () => Promise.reject(new Error('kein netz')),
    }
    zeigeEni(kaputt)
    await laufeAn('boxen steht')
    await act(async () => { await vi.advanceTimersByTimeAsync(900) })

    expect(screen.getByRole('alert')).toHaveTextContent(/nicht gespeichert/i)
    // der satz ist nicht verloren: er steht wieder im feld
    expect(feld()).toHaveValue('boxen steht')
  })

  it('behauptet erst dann eine modellverbindung, wenn sie geprüft ist', async () => {
    vi.useFakeTimers()
    const geber = {
      art: 'modell' as const,
      antworte: vi.fn(async () => ({
        mensch: { id: 'm1', rolle: 'mensch' as const, text: 'x', erstellt: new Date().toISOString() },
        eni: { id: 'e1', rolle: 'eni' as const, text: 'das reicht nicht.', erstellt: new Date().toISOString() },
      })),
    }
    render(
      <EniApp
        speicher={lokalerEniSpeicher('erijon')}
        onZurueck={vi.fn()}
        pruefeModell={() => Promise.resolve(true)}
        baueGeber={() => geber}
      />
    )

    expect(screen.getByText(/verbindung wird geprüft/i)).toBeInTheDocument()

    await act(async () => { await vi.advanceTimersByTimeAsync(10) })

    expect(screen.queryByText(/lokale stimmenprobe/i)).toBeNull()
    expect(screen.getByText(/verlässt dein gerät/i)).toBeInTheDocument()
  })

  it('nimmt nichts an, solange die verbindung noch geprüft wird', async () => {
    vi.useFakeTimers()
    let loese: (bereit: boolean) => void = () => {}
    render(
      <EniApp
        speicher={lokalerEniSpeicher('erijon')}
        onZurueck={vi.fn()}
        pruefeModell={() => new Promise<boolean>((weiter) => { loese = weiter })}
      />
    )

    fireEvent.change(feld(), { target: { value: 'boxen steht' } })
    expect(screen.getByRole('button', { name: 'vorlegen' })).toBeDisabled()

    await act(async () => {
      loese(false)
      await vi.advanceTimersByTimeAsync(10)
    })
    expect(screen.getByRole('button', { name: 'vorlegen' })).toBeEnabled()
  })
})
