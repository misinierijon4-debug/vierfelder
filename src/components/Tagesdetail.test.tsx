/** @vitest-environment jsdom */

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Zustand } from '../lib/types'
import { Tagesdetail } from './Tagesdetail'

afterEach(cleanup)

describe('Tagesdetail Datenherkunft', () => {
  it('trennt gemessene und getippte Anteile und warnt nur vor einer moeglichen Doppelerfassung', () => {
    const zustand: Zustand = {
      einheiten: {
        'erijon|gym|2026-09-06': [
          {
            id: 'manuell',
            user: 'erijon',
            area: 'gym',
            tag: '2026-09-06',
            wert: 30,
            erfasst: '2026-09-06T18:40:00+02:00',
            von: '2026-09-06T18:30:00+02:00',
          },
        ],
      },
      gewichte: {},
      aufenthalte: [
        {
          user: 'erijon',
          bereich: 'gym',
          ort: 'fitx',
          ankunft: '2026-09-06T18:00:00+02:00',
          abgang: '2026-09-06T19:00:00+02:00',
        },
      ],
    }

    render(
      <Tagesdetail
        zustand={zustand}
        auswahl={{ user: 'erijon', area: 'gym', tag: '2026-09-06' }}
        heute="2026-09-06"
        onSchliessen={vi.fn()}
      />
    )

    expect(screen.getByText(/quelle: gemischt/)).not.toBeNull()
    expect(screen.getByText('60 min gemessen + 30 min getippt')).not.toBeNull()
    expect(screen.getByText(/90/).closest('p')?.textContent).toContain('erfasste summe')
    expect(screen.getByRole('status').textContent).toContain('mögliche doppelerfassung')
    expect(screen.getByRole('status').textContent).toContain('nichts wurde automatisch zusammengeführt')
  })

  it('behauptet ohne manuelle Durchfuehrungszeit keine Doppelerfassung', () => {
    const zustand: Zustand = {
      einheiten: {
        'erijon|gym|2026-09-06': [
          {
            id: 'manuell',
            user: 'erijon',
            area: 'gym',
            tag: '2026-09-06',
            wert: 30,
            erfasst: '2026-09-06T18:40:00+02:00',
            von: null,
          },
        ],
      },
      gewichte: {},
      aufenthalte: [
        {
          user: 'erijon',
          bereich: 'gym',
          ort: 'fitx',
          ankunft: '2026-09-06T18:00:00+02:00',
          abgang: '2026-09-06T19:00:00+02:00',
        },
      ],
    }

    render(
      <Tagesdetail
        zustand={zustand}
        auswahl={{ user: 'erijon', area: 'gym', tag: '2026-09-06' }}
        heute="2026-09-06"
        onSchliessen={vi.fn()}
      />
    )

    expect(screen.queryByRole('status')).toBeNull()
    expect(screen.getByText(/ohne sichere zeitüberschneidung/)).not.toBeNull()
  })

  it('gibt einen nie erfassten manuellen Wert nicht als null Minuten aus', () => {
    const zustand: Zustand = {
      einheiten: {
        'erijon|gym|2026-09-06': [
          {
            id: 'manuell-ohne-wert',
            user: 'erijon',
            area: 'gym',
            tag: '2026-09-06',
            wert: null,
            erfasst: '2026-09-06T18:40:00+02:00',
            von: null,
          },
        ],
      },
      gewichte: {},
      aufenthalte: [
        {
          user: 'erijon',
          bereich: 'gym',
          ort: 'fitx',
          ankunft: '2026-09-06T18:00:00+02:00',
          abgang: '2026-09-06T19:00:00+02:00',
        },
      ],
    }

    render(
      <Tagesdetail
        zustand={zustand}
        auswahl={{ user: 'erijon', area: 'gym', tag: '2026-09-06' }}
        heute="2026-09-06"
        onSchliessen={vi.fn()}
      />
    )

    expect(screen.getByText('60 min gemessen + manuell ohne wert')).not.toBeNull()
    expect(screen.queryByText(/0 min getippt/)).toBeNull()
  })

  it('benennt destruktive Aktionen mit Person Datum Index und Wert', () => {
    const zustand: Zustand = {
      einheiten: {
        'erijon|gym|2026-09-06': [
          {
            id: 'manuell',
            user: 'erijon',
            area: 'gym',
            tag: '2026-09-06',
            wert: 30,
            erfasst: '2026-09-06T18:40:00+02:00',
            von: '2026-09-06T18:30:00+02:00',
          },
        ],
      },
      gewichte: {},
      aufenthalte: [],
    }

    render(
      <Tagesdetail
        zustand={zustand}
        auswahl={{ user: 'erijon', area: 'gym', tag: '2026-09-06' }}
        heute="2026-09-06"
        eigene
        editierbar
        onSchliessen={vi.fn()}
        onLoeschen={vi.fn()}
      />
    )

    expect(screen.getByRole('button', {
      name: /Erijon, gym, sonntag, 6\. september, eintrag 1, 30 min um 18:30 uhr löschen/i,
    })).not.toBeNull()
  })
})
