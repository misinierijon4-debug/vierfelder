/** Fester App-Rahmen mit internem Scrollen, auch während der iOS-Tastatur. */
export function installAppViewport(): () => void {
  const root = document.documentElement
  const viewport = window.visualViewport
  let frame = 0
  const update = () => {
    if (viewport && Math.abs(viewport.scale - 1) > 0.01) return
    root.style.setProperty('--app-viewport-height', `${viewport?.height ?? window.innerHeight}px`)
    root.style.setProperty('--app-viewport-top', `${viewport?.offsetTop ?? 0}px`)
  }
  const schedule = () => {
    cancelAnimationFrame(frame)
    frame = requestAnimationFrame(update)
  }
  // Safari-Gesten zusätzlich abfangen: ältere iOS-Versionen ignorieren
  // die Zoom-Grenzen im Viewport-Meta teilweise. Einfinger-Scrollen bleibt frei.
  const preventGesture = (event: Event) => {
    if (event.cancelable) event.preventDefault()
  }
  const preventPinch = (event: TouchEvent) => {
    if (event.touches.length > 1) preventGesture(event)
  }
  document.addEventListener('gesturestart', preventGesture, { passive: false })
  document.addEventListener('gesturechange', preventGesture, { passive: false })
  document.addEventListener('touchmove', preventPinch, { passive: false })
  viewport?.addEventListener('resize', schedule)
  viewport?.addEventListener('scroll', schedule)
  window.addEventListener('resize', schedule)
  window.addEventListener('pageshow', schedule)
  update()
  return () => {
    cancelAnimationFrame(frame)
    document.removeEventListener('gesturestart', preventGesture)
    document.removeEventListener('gesturechange', preventGesture)
    document.removeEventListener('touchmove', preventPinch)
    viewport?.removeEventListener('resize', schedule)
    viewport?.removeEventListener('scroll', schedule)
    window.removeEventListener('resize', schedule)
    window.removeEventListener('pageshow', schedule)
    root.style.removeProperty('--app-viewport-height')
    root.style.removeProperty('--app-viewport-top')
  }
}
