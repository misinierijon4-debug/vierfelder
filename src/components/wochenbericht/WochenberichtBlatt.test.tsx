/** @vitest-environment jsdom */

import { cleanup, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { Schlafnacht, Zustand } from '../../lib/types'
import { tickKey } from '../../lib/types'
import { WochenberichtBlatt } from './WochenberichtBlatt'

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
  Object.defineProperty(Element.prototype, 'scrollTo', { configurable: true, value: vi.fn() })
})

afterEach(cleanup)

const WOCHE = '2026-09-14'

function zustand(): Zustand {
  const z: Zustand = { einheiten: {}, gewichte: {}, aufenthalte: [] }
  for (const tag of ['2026-09-14', '2026-09-15', '2026-09-16']) {
    z.einheiten[tickKey('erijon', 'boxen', tag)] = [
      { id: `b-${tag}`, user: 'erijon', area: 'boxen', tag, wert: 60, erfasst: `${tag}T18:00:00Z` },
    ]
  }
  z.einheiten[tickKey('koray', 'gym', '2026-09-15')] = [
    { id: 'g1', user: 'koray', area: 'gym', tag: '2026-09-15', wert: 45, erfasst: '2026-09-15T18:00:00Z' },
  ]
  z.gewichte['erijon|2026-09-14'] = 69.7
  z.gewichte['erijon|2026-09-18'] = 69.2
  return z
}

function nacht(user: 'erijon' | 'koray', abend: string, minuten: number, wert: number): Schlafnacht {
  return {
    user,
    nacht: abend,
    schlafMinuten: minuten,
    einschlafzeit: `${abend}T22:30:00.000Z`,
    aufwachzeit: null,
    bettStart: null,
    bettEnde: null,
    bettMinuten: null,
    tiefMinuten: 0,
    remMinuten: 0,
    kernMinuten: 0,
    unspezMinuten: 0,
    wachMinuten: 0,
    zielMinuten: 480,
    phasen: null,
    nachtwert: wert,
    scoreKonfidenz: null,
  }
}

function blatt(ueberschreiben: Partial<Parameters<typeof WochenberichtBlatt>[0]> = {}) {
  return (
    <WochenberichtBlatt
      woche={WOCHE}
      zustand={zustand()}
      naechte={[nacht('erijon', '2026-09-14', 520, 79), nacht('koray', '2026-09-14', 375, 68)]}
      heuteKey="2026-09-28"
      ersteWoche="2026-09-07"
      eniStatus="fehlt"
      eniTexte={null}
      onWocheWechseln={vi.fn()}
      onSchliessen={vi.fn()}
      onMitEniReden={vi.fn()}
      {...ueberschreiben}
    />
  )
}

describe('WochenberichtBlatt', () => {
  it('baut geschlossen nichts auf', () => {
    const { container } = render(blatt({ woche: null }))
    expect(container.querySelector('dialog')).toBeEmptyDOMElement()
  })

  it('zeigt den punktestand, die kennzahlen und die tabelle ohne nachladen', () => {
    render(blatt())

    // vier punkte für erijon (3x boxen + 1x gewicht am 14., + 18. = 5), koray 1
    expect(screen.getByRole('heading', { name: 'wochenbericht' })).toBeInTheDocument()
    expect(screen.getByText('14.–20. september')).toBeInTheDocument()
    expect(screen.getByText('abgeschlossen')).toBeInTheDocument()
    expect(screen.getByText(/erijon gewinnt mit/)).toBeInTheDocument()

    // die abschnitte stehen alle da, ohne dass jemand etwas anfordert
    for (const titel of [
      'woche auf einen blick',
      'wo die woche gekippt ist',
      'bereiche',
      'schlaf',
      'gewicht',
    ]) {
      expect(screen.getByRole('heading', { name: titel })).toBeInTheDocument()
    }

    expect(screen.getByText('tagespunkte')).toBeInTheDocument()
    expect(screen.getByText('qualität ø')).toBeInTheDocument()
    expect(screen.getByRole('table', { name: 'bereiche' })).toBeInTheDocument()
    expect(screen.getByRole('table', { name: 'schlaf je nacht' })).toBeInTheDocument()
  })

  it('nennt die laufende woche einen stand und keinen abschluss', () => {
    render(blatt({ heuteKey: '2026-09-17' }))
    expect(screen.getByText('läuft noch · stand von heute')).toBeInTheDocument()
    expect(screen.getByText(/erijon führt mit/)).toBeInTheDocument()
  })

  it('läuft nicht über die laufende woche hinaus und nicht vor die erste', async () => {
    const wechseln = vi.fn()
    const user = userEvent.setup()
    // dieselbe woche ist zugleich die erste und die laufende
    render(blatt({ ersteWoche: WOCHE, heuteKey: '2026-09-17', onWocheWechseln: wechseln }))

    expect(screen.getByRole('button', { name: 'Woche davor' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Woche danach' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Woche davor' }))
    expect(wechseln).not.toHaveBeenCalled()
  })

  it('springt eine woche zurück', async () => {
    const wechseln = vi.fn()
    const user = userEvent.setup()
    render(blatt({ onWocheWechseln: wechseln }))

    await user.click(screen.getByRole('button', { name: 'Woche davor' }))
    expect(wechseln).toHaveBeenCalledWith('2026-09-07')
  })

  it('reicht die woche an ENI weiter, statt sie im bericht zu erzeugen', async () => {
    const reden = vi.fn()
    const user = userEvent.setup()
    render(blatt({ onMitEniReden: reden }))

    await user.click(screen.getByRole('button', { name: /mit ENI über diese woche reden/ }))
    expect(reden).toHaveBeenCalledWith(WOCHE)
  })

  it('bleibt vollständig, wenn ENI nichts geschrieben hat', () => {
    render(blatt())
    expect(screen.getByText(/ENIs Rückblick ist gerade nicht verfügbar/)).toBeInTheDocument()
    // die zahlen stehen trotzdem
    expect(screen.getByRole('heading', { name: 'bereiche' })).toBeInTheDocument()
  })

  it('zeigt ENIs texte, sobald sie da sind', () => {
    render(
      blatt({
        eniStatus: 'da',
        eniTexte: {
          ueberschrift: 'Deine stärkste Boxwoche im September.',
          lief: 'Drei Einheiten Boxen, 180 Minuten.',
          muster: 'Alles kam bis Mittwoch.',
          naechste: ['Lernen steht auf null.', 'Samstag ist dein schwächster Tag.'],
        },
      })
    )

    expect(screen.getByText('Deine stärkste Boxwoche im September.')).toBeInTheDocument()
    expect(screen.getByText('Alles kam bis Mittwoch.')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'nächste woche' })).toBeInTheDocument()
  })
})
