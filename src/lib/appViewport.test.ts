// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { installAppViewport } from './appViewport'

let dispose: (() => void) | undefined
afterEach(() => { dispose?.(); dispose = undefined; vi.unstubAllGlobals(); vi.useRealTimers() })

it('blockiert Zoomgesten, lässt normales Scrollen frei und entfernt Listener', () => {
  dispose = installAppViewport()
  const single = new Event('touchmove', { cancelable: true })
  Object.defineProperty(single, 'touches', { value: [{}] })
  document.dispatchEvent(single)
  expect(single.defaultPrevented).toBe(false)
  const pinch = new Event('touchmove', { cancelable: true })
  Object.defineProperty(pinch, 'touches', { value: [{}, {}] })
  document.dispatchEvent(pinch)
  expect(pinch.defaultPrevented).toBe(true)
  const gesture = new Event('gesturestart', { cancelable: true })
  document.dispatchEvent(gesture)
  expect(gesture.defaultPrevented).toBe(true)
  dispose()
  dispose = undefined
  const later = new Event('gesturestart', { cancelable: true })
  document.dispatchEvent(later)
  expect(later.defaultPrevented).toBe(false)
})

it('passt den Rahmen an Tastatur, Versatz und Rückkehr zur vollen Höhe an', () => {
  vi.useFakeTimers()
  const viewport = Object.assign(new EventTarget(), { height: 844, offsetTop: 0, scale: 1 })
  vi.stubGlobal('visualViewport', viewport)
  dispose = installAppViewport()
  const style = document.documentElement.style
  expect(style.getPropertyValue('--app-viewport-height')).toBe('844px')
  viewport.height = 420
  viewport.offsetTop = 30
  viewport.dispatchEvent(new Event('resize'))
  vi.advanceTimersByTime(20)
  expect(style.getPropertyValue('--app-viewport-height')).toBe('420px')
  expect(style.getPropertyValue('--app-viewport-top')).toBe('30px')
  viewport.height = 844
  viewport.offsetTop = 0
  viewport.dispatchEvent(new Event('resize'))
  vi.advanceTimersByTime(20)
  expect(style.getPropertyValue('--app-viewport-height')).toBe('844px')
  expect(style.getPropertyValue('--app-viewport-top')).toBe('0px')
})
