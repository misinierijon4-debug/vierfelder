/** @vitest-environment jsdom */

import { useState } from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { Zustand } from '../lib/types'
import { TrackerKalender } from './TrackerKalender'

const kalenderMonateSpion = vi.hoisted(() => vi.fn())

vi.mock('../lib/kalender', async (importOriginal) => {
  const echt = await importOriginal<typeof import('../lib/kalender')>()
  kalenderMonateSpion.mockImplementation(echt.kalenderMonate)
  return { ...echt, kalenderMonate: kalenderMonateSpion }
})

const ZUSTAND: Zustand = { einheiten: {}, gewichte: {}, aufenthalte: [] }

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
        tracker-kalender öffnen
      </button>
      <output aria-label="gewählter tracker-tag">{tag}</output>
      <TrackerKalender
        offen={offen}
        zustand={ZUSTAND}
        me="erijon"
        gewaehlterTag={tag}
        heuteKey="2026-09-06"
        onTagWaehlen={(naechsterTag) => {
          setTag(naechsterTag)
          setOffen(false)
        }}
        onSchliessen={() => setOffen(false)}
      />
    </>
  )
}

describe('TrackerKalender bedarfsweises Rendering', () => {
  it('baut geschlossen weder Monatsliste noch Tagesbuttons', () => {
    const { container } = render(<KalenderAblauf />)

    expect(kalenderMonateSpion).not.toHaveBeenCalled()
    expect(container.querySelector('dialog')).toBeEmptyDOMElement()
    expect(
      screen.queryByRole('button', { name: /^Samstag, 5\. September 2026,/ })
    ).not.toBeInTheDocument()
  })

  it('bleibt nach Schließen, Wiederöffnen und Tagesauswahl vollständig bedienbar', async () => {
    const user = userEvent.setup()
    const { container } = render(<KalenderAblauf />)
    const oeffnen = screen.getByRole('button', { name: 'tracker-kalender öffnen' })

    await user.click(oeffnen)
    expect(kalenderMonateSpion).toHaveBeenCalledTimes(1)
    expect(
      screen.getByRole('button', { name: /^Samstag, 5\. September 2026,/ })
    ).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Kalender schließen' }))
    expect(container.querySelector('dialog')).toBeEmptyDOMElement()
    expect(kalenderMonateSpion).toHaveBeenCalledTimes(1)

    await user.click(oeffnen)
    const tag = screen.getByRole('button', { name: /^Samstag, 5\. September 2026,/ })
    await user.click(tag)
    expect(screen.getByRole('status', { name: 'gewählter tracker-tag' })).toHaveTextContent(
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
