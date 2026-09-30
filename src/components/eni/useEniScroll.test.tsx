// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { afterEach, describe, expect, it } from 'vitest'
import { useEniScroll } from './useEniScroll'
import type { EniZeile } from '../../lib/eniSpeicher'

afterEach(cleanup)
const ANTWORT: EniZeile = { id: 'a1', rolle: 'eni', text: 'Antwort', erstellt: '2026-09-30T18:00:00Z' }

function Ansicht({ chat = 'c1', text = '', zeile = ANTWORT, prueft = true }: {
  chat?: string; text?: string; zeile?: EniZeile; prueft?: boolean
}) {
  const { scrollContainerRef, weiterUnten, beimScrollen, zumEnde } = useEniScroll(chat, zeile, text, prueft)
  return <>
    <div ref={scrollContainerRef} onScroll={beimScrollen} data-testid="liste">{text}</div>
    {weiterUnten && <button onClick={zumEnde}>Zur neuesten Antwort</button>}
  </>
}
function liste() {
  const el = screen.getByTestId('liste')
  Object.defineProperty(el, 'clientHeight', { configurable: true, value: 400 })
  Object.defineProperty(el, 'scrollHeight', { configurable: true, value: 1600 })
  el.scrollTop = 1200
  fireEvent.scroll(el)
  return el
}
function wachse(el: HTMLElement, hoehe: number) {
  Object.defineProperty(el, 'scrollHeight', { configurable: true, value: hoehe })
}

describe('Leseposition im ENI-Chat', () => {
  it('folgt einem wachsenden Stream, auch wenn ein Textstück höher als der Endabstand ist', () => {
    const { rerender } = render(<Ansicht />)
    const el = liste()
    wachse(el, 2200)
    rerender(<Ansicht text="Ein großer neuer Absatz." />)
    expect(el.scrollTop).toBe(2200)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('lässt ältere Zeilen beim Streamen und Speichern an derselben Stelle', () => {
    const { rerender } = render(<Ansicht />)
    const el = liste()
    el.scrollTop = 200
    fireEvent.scroll(el)
    wachse(el, 2200)
    rerender(<Ansicht text="Neue Worte." />)
    expect(el.scrollTop).toBe(200)
    rerender(<Ansicht zeile={{ ...ANTWORT, id: 'a2' }} prueft={false} />)
    expect(el.scrollTop).toBe(200)
    expect(screen.getByRole('button')).toBeInTheDocument()
  })

  it('folgt nach einem ausdrücklichen Sprung wieder und versteckt den Knopf', () => {
    const { rerender } = render(<Ansicht />)
    const el = liste()
    el.scrollTop = 200
    fireEvent.scroll(el)
    fireEvent.click(screen.getByRole('button'))
    expect(el.scrollTop).toBe(1600)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    wachse(el, 2000)
    rerender(<Ansicht text="Weiter." />)
    expect(el.scrollTop).toBe(2000)
  })

  it('folgt wieder, sobald man selbst bis nach unten scrollt', () => {
    const { rerender } = render(<Ansicht />)
    const el = liste()
    el.scrollTop = 200
    fireEvent.scroll(el)
    el.scrollTop = 1190
    fireEvent.scroll(el)
    wachse(el, 2000)
    rerender(<Ansicht text="Weiter." />)
    expect(el.scrollTop).toBe(2000)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('beginnt einen anderen Chat am Ende', () => {
    const { rerender } = render(<Ansicht />)
    const el = liste()
    el.scrollTop = 200
    fireEvent.scroll(el)
    rerender(<Ansicht chat="c2" />)
    expect(el.scrollTop).toBe(1600)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('zeigt die eigene neue Nachricht, ohne später den Stream zu erzwingen', () => {
    const { rerender } = render(<Ansicht />)
    const el = liste()
    el.scrollTop = 200
    fireEvent.scroll(el)
    const zeile: EniZeile = { ...ANTWORT, id: 'm1', rolle: 'mensch' }
    rerender(<Ansicht zeile={zeile} />)
    expect(el.scrollTop).toBe(1600)
    el.scrollTop = 300
    fireEvent.scroll(el)
    wachse(el, 1900)
    rerender(<Ansicht zeile={zeile} text="Neue Antwort." />)
    expect(el.scrollTop).toBe(300)
  })
})
