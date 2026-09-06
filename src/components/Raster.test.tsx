/** @vitest-environment jsdom */

import { cleanup, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Zustand } from '../lib/types'
import { Raster } from './Raster'

afterEach(cleanup)

describe('Raster Screenreader-Status', () => {
  it('nennt Person, Datum, Mischquelle und erfassten Wert', async () => {
    const user = userEvent.setup()
    const onZelle = vi.fn()
    const tag = '2026-09-06'
    const zustand: Zustand = {
      einheiten: {
        [`erijon|gym|${tag}`]: [{
          id: 'manuell',
          user: 'erijon',
          area: 'gym',
          tag,
          wert: 30,
          erfasst: `${tag}T18:30:00+02:00`,
        }],
      },
      gewichte: {},
      aufenthalte: [{
        user: 'erijon',
        bereich: 'gym',
        ort: 'fitx',
        ankunft: `${tag}T18:00:00+02:00`,
        abgang: `${tag}T19:00:00+02:00`,
      }],
    }
    render(
      <Raster
        zustand={zustand}
        woche={[tag]}
        heute={tag}
        ereignis={null}
        titel="woche"
        gewaehlterTag={tag}
        onZelle={onZelle}
      />
    )

    const zelle = screen.getByRole('button', {
      name: /erijon, gym, sonntag, 6\. september, 2 einheiten, gemessen und getippt, erfasste summe 90 min/i,
    })
    await user.click(zelle)
    expect(onZelle).toHaveBeenCalledWith('erijon', 'gym', tag)
  })
})
