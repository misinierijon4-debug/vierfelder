/** @vitest-environment jsdom */

import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom/vitest'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Ansage } from '../../lib/ansagen'
import type { AreaId, UserId, Zustand } from '../../lib/types'
import { AnsagenBereich } from './AnsagenBereich'

const DIENSTAG = new Date(2026, 8, 22, 12)

beforeAll(() => {
  // jsdom bringt showModal nicht mit. dieselbe kleine krücke wie im kalender.
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

beforeEach(() => {
  // die uhr des bereichs steht auf dem tag, den der test zeigt
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(DIENSTAG)
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

function sitzung(z: Zustand, u: UserId, bereich: AreaId, tag: string): Zustand {
  const ankunft = new Date(`${tag}T18:00:00`)
  return {
    ...z,
    aufenthalte: [
      ...z.aufenthalte,
      { user: u, bereich, ort: 'test', ankunft: ankunft.toISOString(), abgang: new Date(ankunft.getTime() + 45 * 60_000).toISOString() },
    ],
  }
}

/** koray boxt in den vier wochen vor dem 21.09. zweimal je woche, sonst nichts */
function korayBoxt(): Zustand {
  let z: Zustand = { einheiten: {}, gewichte: {}, aufenthalte: [] }
  for (const tag of ['2026-08-25', '2026-08-27', '2026-09-01', '2026-09-03', '2026-09-08', '2026-09-10', '2026-09-15', '2026-09-17'])
    z = sitzung(z, 'koray', 'boxen', tag)
  return z
}

const ansage = (rest: Partial<Ansage> = {}): Ansage => ({
  id: 'a1',
  version: 2,
  von: 'koray',
  an: 'erijon',
  feld: 'lesen',
  stufe: 'mutig',
  einsatz: 2,
  ab: '2026-09-22',
  bis: '2026-09-27',
  ziel: 3,
  erstelltAm: new Date(2026, 8, 22, 9).toISOString(),
  ...rest,
})

describe('AnsagenBereich', () => {
  it('lädt im leeren zustand ein und zeigt enis vorschlag nach koray‘s form', () => {
    render(<AnsagenBereich zustand={korayBoxt()} me="erijon" heute={DIENSTAG} ansagen={[]} onSageAn={vi.fn()} />)
    expect(screen.getByText(/keine ansage\./)).toBeInTheDocument()
    expect(screen.getByText('2 von 2 übrig')).toBeInTheDocument()
    expect(screen.getByText('all-in frei')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /koray herausfordern/ })).toBeInTheDocument()
    // schnitt 2 → sicher 3; nur boxen ist aktiv
    const vorschlaege = screen.getAllByRole('button', { name: /^vorschlag:/ })
    expect(vorschlaege).toHaveLength(1)
    expect(vorschlaege[0]).toHaveAccessibleName(/^vorschlag: 3× boxen, sicher\. koray boxt 2× die woche/)
  })

  it('sagt über das blatt an: feld, stufe mit live-ziel, bestätigen', async () => {
    const user = userEvent.setup()
    const onSageAn = vi.fn(async () => ({
      ansage: ansage({ id: 'neu', von: 'erijon', an: 'koray', feld: 'boxen', ziel: 4, erstelltAm: DIENSTAG.toISOString() }),
    }))
    render(<AnsagenBereich zustand={korayBoxt()} me="erijon" heute={DIENSTAG} ansagen={[]} onSageAn={onSageAn} />)
    await user.click(screen.getByRole('button', { name: /koray herausfordern/ }))
    const blatt = within(await screen.findByRole('dialog', { name: /ansage an koray/ }))

    expect(blatt.getByRole('button', { name: /^gym/ })).toBeDisabled()
    expect(blatt.getAllByText('macht er gerade nicht').length).toBeGreaterThan(0)
    expect(blatt.getByRole('button', { name: 'feld und stufe wählen' })).toBeDisabled()

    await user.click(blatt.getByRole('button', { name: /^boxen/ }))
    // empfohlen ist sicher; mutig zeigt sein ziel schon auf dem knopf
    expect(blatt.getByRole('button', { name: /ansagen · 1 punkt setzen/ })).toBeEnabled()
    await user.click(blatt.getByRole('button', { name: /^mutig/ }))
    expect(blatt.getByRole('button', { name: /^mutig/ })).toHaveTextContent('4× · ±2')
    expect(blatt.getByText(/schafft koray es, bekommt koray 2/)).toBeInTheDocument()

    await user.click(blatt.getByRole('button', { name: 'ansagen · 2 punkte setzen' }))
    expect(onSageAn).toHaveBeenCalledWith('boxen', 'mutig')
    expect(await blatt.findByRole('status')).toHaveTextContent('angesagt')
    expect(screen.getByText('angesagt: 4× boxen bis sonntag.')).toBeInTheDocument()
  })

  it('öffnet das blatt aus enis vorschlag schon ausgefüllt und erklärt eine ablehnung', async () => {
    const user = userEvent.setup()
    const onSageAn = vi.fn(async () => ({ fehler: 'keinZiel' as const }))
    render(<AnsagenBereich zustand={korayBoxt()} me="erijon" heute={DIENSTAG} ansagen={[]} onSageAn={onSageAn} />)
    await user.click(screen.getByRole('button', { name: /^vorschlag: 3× boxen/ }))
    const blatt = within(await screen.findByRole('dialog'))
    await user.click(blatt.getByRole('button', { name: 'ansagen · 1 punkt setzen' }))
    expect(onSageAn).toHaveBeenCalledWith('boxen', 'sicher')
    expect(await blatt.findByText('für dieses feld passt diese woche kein faires ziel mehr.')).toBeInTheDocument()
  })

  it('zeigt eine ansage an dich groß, mit einsatz und den knöpfen zum reagieren', async () => {
    const user = userEvent.setup()
    const onReagiere = vi.fn(async () => ({ ansage: ansage({ reaktion: { art: 'duAuch' as const, am: DIENSTAG.toISOString() } }) }))
    render(
      <AnsagenBereich
        zustand={korayBoxt()}
        me="erijon"
        heute={DIENSTAG}
        ansagen={[ansage()]}
        onSageAn={vi.fn()}
        onReagiere={onReagiere}
      />
    )
    const karte = within(screen.getByRole('article', { name: '3× lesen' }))
    expect(karte.getByLabelText('0 von 3')).toBeInTheDocument()
    expect(karte.getByText('mutig')).toBeInTheDocument()
    expect(karte.getByText('schaffst du es: +2 für dich. sonst +2 für koray.')).toBeInTheDocument()
    expect(karte.getByText(/noch 5 t 6 std/)).toBeInTheDocument()
    expect(karte.getByText('noch 21 std zum reagieren')).toBeInTheDocument()
    expect(karte.getByRole('button', { name: /^kontern/ })).toHaveAccessibleDescription('einsatz ×2 · ±4')

    await user.click(karte.getByRole('button', { name: /^du auch/ }))
    expect(onReagiere).toHaveBeenCalledWith('a1', 'duAuch')
    expect(await screen.findByText('du auch — jetzt muss koray auch.')).toBeInTheDocument()
  })

  it('zeigt „du auch“ als zweite bahn und das ergebnis mit punkten', () => {
    const geschafft = ansage({
      von: 'erijon',
      an: 'koray',
      feld: 'boxen',
      reaktion: { art: 'duAuch', am: DIENSTAG.toISOString() },
      entschieden: { ergebnis: 'geschafft', am: DIENSTAG.toISOString() },
    })
    const gegen = ansage({ id: 'g', von: 'koray', an: 'erijon', feld: 'boxen', bezug: 'a1' })
    render(<AnsagenBereich zustand={korayBoxt()} me="erijon" heute={DIENSTAG} ansagen={[geschafft, gegen]} />)
    const karte = within(screen.getByRole('article', { name: '3× boxen' }))
    expect(karte.getAllByRole('meter')).toHaveLength(2)
    expect(karte.getByText('geschafft')).toBeInTheDocument()
    expect(karte.getByText(/^\+2/)).toHaveTextContent('+2 koray')
    // die gegenrichtung ist keine eigene karte
    expect(screen.getAllByRole('article')).toHaveLength(1)
  })

  it('bietet ab freitag 18 uhr nichts mehr an und zählt verbrauchte ansagen', () => {
    vi.setSystemTime(new Date(2026, 8, 25, 19))
    const { rerender } = render(
      <AnsagenBereich zustand={korayBoxt()} me="erijon" heute={new Date(2026, 8, 25, 19)} ansagen={[]} onSageAn={vi.fn()} />
    )
    expect(screen.getByText(/ab freitag 18 uhr gibt es keine neuen ansagen/)).toBeInTheDocument()
    vi.setSystemTime(DIENSTAG)
    const zwei = [
      ansage({ id: 'x', von: 'erijon', an: 'koray', feld: 'boxen', stufe: 'allin', einsatz: 3 }),
      ansage({ id: 'y', von: 'erijon', an: 'koray', feld: 'lesen' }),
    ]
    rerender(<AnsagenBereich zustand={korayBoxt()} me="erijon" heute={DIENSTAG} ansagen={zwei} onSageAn={vi.fn()} />)
    expect(screen.getByText('0 von 2 übrig')).toBeInTheDocument()
    expect(screen.getByText('all-in weg')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /herausfordern/ })).toBeNull()
  })
})
