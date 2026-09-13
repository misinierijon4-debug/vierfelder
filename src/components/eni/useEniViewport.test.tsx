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
