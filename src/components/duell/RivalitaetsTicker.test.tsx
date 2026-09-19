/** @vitest-environment jsdom */

import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Zustand } from '../../lib/types'
import { RivalitaetsTicker } from './RivalitaetsTicker'

/**
 * Der zuordnungsdienst wird nie wirklich angerufen. Die heuristik daneben
 * bleibt echt: sie ist das, was der ticker zeigt, solange nichts geantwortet
 * hat, und genau das soll hier geprüft werden.
 */
const klassifiziereSpion = vi.hoisted(() => vi.fn())

vi.mock('../../lib/duellKlassifizierung', async (importOriginal) => {
  const echt = await importOriginal<typeof import('../../lib/duellKlassifizierung')>()
  return { ...echt, klassifiziereTickerEreignis: klassifiziereSpion }
})

afterEach(cleanup)
beforeEach(async () => {
  klassifiziereSpion.mockReset()
  // niemals fertig: so steht im test genau der stand, den auch der erste
  // bildaufbau zeigt — die heuristik, ohne antwort des dienstes
  klassifiziereSpion.mockReturnValue(new Promise<never>(() => {}))
  // der ticker holt die zuordnung erst im effekt nach. Im test dauert dieser
  // erste modulladevorgang laenger als der test selbst, deshalb wird er hier
  // vorgewaermt — danach loest der `import()` im effekt in einem microtask auf.
  await import('../../lib/duellKlassifizierung')
})

const ZUSTAND: Zustand = {
  einheiten: {},
  gewichte: {},
  aufenthalte: [
    {
      id: 'gym-1',
      user: 'erijon',
      bereich: 'gym',
      ort: 'fitnessstudio',
      ankunft: '2026-09-06T08:00:00.000+02:00',
      abgang: '2026-09-06T09:00:00.000+02:00',
    },
  ],
}

describe('RivalitaetsTicker Reflow', () => {
  it('darf den kompakten Messhinweis umbrechen und versteckt sein Icon', () => {
    const { container } = render(
      <RivalitaetsTicker
        zustand={ZUSTAND}
        woche={['2026-09-06']}
        me="erijon"
        kompakt
      />
    )

    expect(container.firstElementChild).toHaveClass('flex-wrap')
    expect(screen.getByText('gemessen').querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
  })

  it('darf im vollstaendigen Feed Zeit und Inhalt getrennt umbrechen', () => {
    render(
      <RivalitaetsTicker zustand={ZUSTAND} woche={['2026-09-06']} me="erijon" />
    )

    const status = screen.getByText('verifiziert')
    expect(status.parentElement?.parentElement).toHaveClass('flex-wrap')
    expect(status.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
  })
})

describe('RivalitaetsTicker Rivalitaets-Badge', () => {
  it('zeigt sofort die Heuristik, ohne auf den Dienst zu warten', async () => {
    render(
      <RivalitaetsTicker
        zustand={ZUSTAND}
        woche={['2026-09-06']}
        me="erijon"
        druck="matchball"
      />
    )

    // eigener eintrag unter matchball: das ist ein kraftakt, und zwar sofort,
    // bevor der nachgeladene dienst ueberhaupt gefragt wurde
    expect(screen.getByText('kraftakt')).toBeInTheDocument()
    expect(klassifiziereSpion).not.toHaveBeenCalled()

    await waitFor(() => expect(klassifiziereSpion).toHaveBeenCalledTimes(1))
    expect(klassifiziereSpion.mock.calls[0]![0]).toMatchObject({
      druckStatus: 'matchball',
      istIch: true,
    })
  })

  it('dreht die Lesart, wenn der Eintrag dem Gegner gehoert', async () => {
    render(
      <RivalitaetsTicker
        zustand={ZUSTAND}
        woche={['2026-09-06']}
        me="koray"
        druck="wocheFuehrung"
      />
    )

    // ich führe die woche, sein eintrag verkleinert den abstand
    expect(screen.getByText('aufholjagd')).toBeInTheDocument()
    await waitFor(() => expect(klassifiziereSpion).toHaveBeenCalled())
    expect(klassifiziereSpion.mock.calls[0]![0]).toMatchObject({ istIch: false })
  })

  it('uebernimmt das Urteil des Dienstes, sobald es da ist', async () => {
    klassifiziereSpion.mockResolvedValue('konter')
    render(
      <RivalitaetsTicker
        zustand={ZUSTAND}
        woche={['2026-09-06']}
        me="erijon"
        druck="offen"
      />
    )

    expect(screen.getByText('routine')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText('konter')).toBeInTheDocument())
    expect(screen.queryByText('routine')).not.toBeInTheDocument()
  })

  it('haelt die Breite des Badges fest, damit nichts springt', async () => {
    klassifiziereSpion.mockResolvedValue('fuehrungsausbau')
    render(
      <RivalitaetsTicker
        zustand={ZUSTAND}
        woche={['2026-09-06']}
        me="erijon"
        druck="offen"
      />
    )

    const vorher = screen.getByText('routine')
    expect(vorher).toHaveClass('min-w-[62px]')
    expect(vorher).toHaveClass('text-[9px]')
    // die lange fassung steht im tooltip, nicht im ticker
    expect(vorher).toHaveAttribute('title', expect.stringContaining('routine'))

    // der wechsel tauscht nur den text, nie den kasten
    await waitFor(() => expect(screen.getByText('ausbau')).toBeInTheDocument())
    expect(screen.getByText('ausbau')).toHaveClass('min-w-[62px]')
  })

  it('fuehrt im Ticker keine Emojis', () => {
    const { container } = render(
      <RivalitaetsTicker
        zustand={ZUSTAND}
        woche={['2026-09-06']}
        me="erijon"
        druck="zugzwang"
      />
    )
    expect(container.textContent ?? '').not.toMatch(/\p{Extended_Pictographic}/u)
  })

  it('haelt den kompakten Platz frei und fuellt ihn erst beim Konter', async () => {
    klassifiziereSpion.mockResolvedValue('konter')
    render(
      <RivalitaetsTicker
        zustand={ZUSTAND}
        woche={['2026-09-06']}
        me="erijon"
        kompakt
        druck="offen"
      />
    )

    // routine ist kein akzent: der kasten steht da, bleibt aber unsichtbar
    const ruhig = screen.getByText('routine')
    expect(ruhig).toHaveClass('invisible')
    expect(ruhig).not.toHaveAttribute('title')

    await waitFor(() => expect(screen.getByText('konter')).toBeInTheDocument())
    expect(screen.getByText('konter')).not.toHaveClass('invisible')
  })

  it('fragt jeden Eintrag genau einmal je Rendern', async () => {
    const { rerender } = render(
      <RivalitaetsTicker
        zustand={ZUSTAND}
        woche={['2026-09-06']}
        me="erijon"
        druck="offen"
      />
    )
    rerender(
      <RivalitaetsTicker
        zustand={ZUSTAND}
        woche={['2026-09-06']}
        me="erijon"
        druck="offen"
      />
    )

    await waitFor(() => expect(klassifiziereSpion).toHaveBeenCalled())
    // beiden effektlaeufen zeit geben, falls es doch einen zweiten gibt
    await act(async () => {})

    // gleiche eintraege, gleiche lage: der effekt laeuft kein zweites mal
    expect(klassifiziereSpion).toHaveBeenCalledTimes(1)
  })
})
