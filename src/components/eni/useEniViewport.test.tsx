// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { useEniViewport } from './useEniViewport'

function Shell() {
  const ref = useEniViewport()
  return <div ref={ref} data-testid="shell" />
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers() })

it('folgt Tastaturhöhe und iOS-Versatz und stellt nach Schließen die Höhe wieder her', () => {
  vi.useFakeTimers()
  // Das Fenster ist die volle Geraetehoehe. Der VisualViewport weicht davon ab,
  // sobald eine Tastatur davorliegt — und in der iOS-PWA auch ohne sie, um die
  // Safe-Area. Nur der erste Fall darf die Huelle verkleinern.
  vi.stubGlobal('innerHeight', 844)
  const viewport = Object.assign(new EventTarget(), { height: 844, offsetTop: 0, scale: 1 })
  vi.stubGlobal('visualViewport', viewport)
  const { getByTestId, unmount } = render(<Shell />)
  const shell = getByTestId('shell')
  expect(shell.style.height).toBe('844px')
  expect(document.documentElement.style.overflow).toBe('hidden')
  act(() => {
    viewport.height = 420
    viewport.offsetTop = 54
    viewport.dispatchEvent(new Event('resize'))
    viewport.dispatchEvent(new Event('scroll'))
    vi.advanceTimersByTime(20)
  })
  expect(shell.style.height).toBe('420px')
  expect(shell.style.top).toBe('54px')
  act(() => {
    viewport.height = 844
    viewport.offsetTop = 0
    viewport.dispatchEvent(new Event('resize'))
    vi.advanceTimersByTime(20)
  })
  expect(shell.style.height).toBe('844px')
  expect(shell.style.top).toBe('0px')
  unmount()
  expect(document.body.style.overflow).toBe('')
  expect(document.documentElement.style.overflow).toBe('')
})

it('funktioniert ohne VisualViewport und respektiert vorherige Scrollregeln', () => {
  vi.stubGlobal('visualViewport', undefined)
  document.body.style.overflow = 'clip'
  const { getByTestId, unmount } = render(<Shell />)
  expect(getByTestId('shell').style.height).toBe(`${window.innerHeight}px`)
  unmount()
  expect(document.body.style.overflow).toBe('clip')
  document.body.style.overflow = ''
})

/*
 * Der Fall, der den leeren Streifen unter ENIs Eingabe gemacht hat: die
 * Homescreen-PWA zeichnet wegen `viewport-fit=cover` bis unter den
 * Home-Indicator, der VisualViewport laesst diesen Streifen aber weg. Die
 * Huelle muss trotzdem bis zum Fensterrand reichen — sonst legt das
 * Safe-Area-Polster der Eingabe denselben Abstand ein zweites Mal an.
 */
it('nimmt in der Homescreen-PWA das Fenster, wenn nur die Safe-Area fehlt', () => {
  vi.stubGlobal('innerHeight', 852)
  const viewport = Object.assign(new EventTarget(), { height: 818, offsetTop: 0, scale: 1 })
  vi.stubGlobal('visualViewport', viewport)
  const { getByTestId, unmount } = render(<Shell />)
  const shell = getByTestId('shell')

  expect(shell.style.height).toBe('852px')
  unmount()
})

it('verhindert aeusseres Fokusscrollen und raeumt die Sperre wieder auf', () => {
  vi.useFakeTimers()
  vi.stubGlobal('innerHeight', 844)
  const viewport = Object.assign(new EventTarget(), { height: 420, offsetTop: 54, scale: 1 })
  vi.stubGlobal('visualViewport', viewport)
  const app = document.createElement('div')
  app.id = 'root'
  app.scrollTop = 90
  document.body.append(app)
  const { getByTestId, unmount } = render(<Shell />, { container: app })
  const shell = getByTestId('shell')
  expect(shell.style.overflow).toBe('clip')
  expect(shell.style.transition).toBe('')
  expect(app.scrollTop).toBe(0)
  act(() => {
    app.scrollTop = 250
    app.dispatchEvent(new Event('scroll'))
    vi.advanceTimersByTime(20)
  })
  expect(app.scrollTop).toBe(0)
  act(() => {
    viewport.height = 844
    viewport.offsetTop = 20
    viewport.dispatchEvent(new Event('resize'))
    vi.advanceTimersByTime(20)
  })
  expect(shell.style.top).toBe('20px')
  unmount()
  expect(app.scrollTop).toBe(90)
  app.remove()
})
