/** @vitest-environment jsdom */

import { useState } from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { Schlafnacht } from '../../lib/types'
import { SchlafKalender } from './SchlafKalender'

const kalenderMonateSpion = vi.hoisted(() => vi.fn())

vi.mock('../../lib/kalender', async (importOriginal) => {
  const echt = await importOriginal<typeof import('../../lib/kalender')>()
  kalenderMonateSpion.mockImplementation(echt.kalenderMonate)
  return { ...echt, kalenderMonate: kalenderMonateSpion }
})

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
  Object.defineProperty(Element.prototype, 'scrollIntoView', {
    configurable: true,
    value: vi.fn(),
  })
  Object.defineProperty(window, 'requestAnimationFrame', {
    configurable: true,
    value: (callback: FrameRequestCallback) => {
      callback(0)
      return 1
    },
  })
  Object.defineProperty(window, 'cancelAnimationFrame', {
    configurable: true,
    value: vi.fn(),
  })
})

afterEach(() => {
  cleanup()
  kalenderMonateSpion.mockClear()
})

function KalenderAblauf() {
  const [offen, setOffen] = useState(false)
  const [tag, setTag] = useState('2026-09-06')

  return (
    <>
      <button type="button" onClick={() => setOffen(true)}>
        schlafkalender öffnen
      </button>
      <output aria-label="gewählter schlaftag">{tag}</output>
      <SchlafKalender
        offen={offen}
        naechte={[]}
        ansichtUser="erijon"
        gewaehlterTag={tag}
        heuteKey="2026-09-06"
        istPrototyp={false}
        onTagWaehlen={(naechsterTag) => {
          setTag(naechsterTag)
          setOffen(false)
        }}
        onSchliessen={() => setOffen(false)}
      />
    </>
  )
}

describe('SchlafKalender bedarfsweises Rendering', () => {
  it('liest geschlossen nicht einmal die Nachtliste und baut keine Monate', () => {
    const unlesbareNaechte = new Proxy([] as Schlafnacht[], {
      get(ziel, eigenschaft, empfaenger) {
        if (eigenschaft === Symbol.iterator) throw new Error('geschlossene Nachtliste wurde gelesen')
        return Reflect.get(ziel, eigenschaft, empfaenger)
      },
    })

    const { container } = render(
      <SchlafKalender
        offen={false}
        naechte={unlesbareNaechte}
        ansichtUser="erijon"
        gewaehlterTag="2026-09-06"
        heuteKey="2026-09-06"
        istPrototyp={false}
        onTagWaehlen={vi.fn()}
        onSchliessen={vi.fn()}
      />
    )

    expect(kalenderMonateSpion).not.toHaveBeenCalled()
    expect(container.querySelector('dialog')).toBeEmptyDOMElement()
    expect(
      screen.queryByRole('button', { name: /^Samstag, 5\. September 2026,/ })
    ).not.toBeInTheDocument()
  })

  it('bleibt nach Schließen, Wiederöffnen und Tagesauswahl vollständig bedienbar', async () => {
    const user = userEvent.setup()
    const { container } = render(<KalenderAblauf />)
    const oeffnen = screen.getByRole('button', { name: 'schlafkalender öffnen' })

    await user.click(oeffnen)
    expect(kalenderMonateSpion).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('heading', { name: 'kalender' }).closest('header')).toHaveClass(
      'vollbild-safe-x'
    )
    expect(screen.getByText('~ = nur aus der schlafdauer geschätzt').parentElement).toHaveClass(
      'vollbild-safe-x'
    )
    expect(container.querySelector('.overflow-y-auto')).toHaveClass('vollbild-safe-x')
    // die wochenleiste steht ausserhalb der scrollflaeche: als klebender
    // streifen blieb ueber ihr ein spalt, durch den der inhalt sichtbar
    // nach oben davonlief
    const scrollflaeche = container.querySelector('.overflow-y-auto')!
    expect(scrollflaeche.contains(screen.getByText('mo'))).toBe(false)
    expect(
      screen.getByRole('button', { name: /^Samstag, 5\. September 2026,/ })
    ).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Schlafkalender schließen' }))
    expect(container.querySelector('dialog')).toBeEmptyDOMElement()
    expect(kalenderMonateSpion).toHaveBeenCalledTimes(1)

    await user.click(oeffnen)
    const tag = screen.getByRole('button', { name: /^Samstag, 5\. September 2026,/ })
    await user.click(tag)
    expect(screen.getByRole('status', { name: 'gewählter schlaftag' })).toHaveTextContent(
      '2026-09-05'
    )
    expect(container.querySelector('dialog')).toBeEmptyDOMElement()

    await user.click(oeffnen)
    expect(screen.getByRole('button', { name: /^Samstag, 5\. September 2026,/ })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
  })
})
