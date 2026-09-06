/** @vitest-environment jsdom */

import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import {
  blockiereNeustart,
  hatNeustartBlocker,
  useNeustartBlocker,
} from './pwaBlocker'

afterEach(cleanup)

function Entwurf({ offen }: { offen: boolean }) {
  useNeustartBlocker(offen)
  return null
}

describe('PWA-Neustartblocker', () => {
  it('schützt nur solange mindestens ein Entwurf offen ist', () => {
    const erster = blockiereNeustart()
    const zweiter = blockiereNeustart()
    expect(hatNeustartBlocker()).toBe(true)

    const blockiert = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(blockiert)
    expect(blockiert.defaultPrevented).toBe(true)

    erster()
    expect(hatNeustartBlocker()).toBe(true)
    zweiter()
    expect(hatNeustartBlocker()).toBe(false)

    const frei = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(frei)
    expect(frei.defaultPrevented).toBe(false)
  })

  it('folgt dem Lebenszyklus eines React-Entwurfs', () => {
    const ansicht = render(<Entwurf offen={false} />)
    expect(hatNeustartBlocker()).toBe(false)
    ansicht.rerender(<Entwurf offen={true} />)
    expect(hatNeustartBlocker()).toBe(true)
    ansicht.rerender(<Entwurf offen={false} />)
    expect(hatNeustartBlocker()).toBe(false)
  })
})
