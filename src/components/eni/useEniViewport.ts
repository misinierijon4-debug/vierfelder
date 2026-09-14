import { useLayoutEffect, useRef } from 'react'
import { scrollSperre } from '../../lib/scrollsperre'

const TASTATUR_AB = 120

/** Die Tastatur liefert bereits animierte Messwerte: keine zweite CSS-Animation. */
export function useEniViewport() {
  const ref = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const shell = ref.current
    if (!shell) return
    const viewport = window.visualViewport
    const app = document.getElementById('root')
    const releaseScroll = scrollSperre()
    const vorherOverflow = shell.style.overflow
    // hidden bleibt programmatisch scrollbar, auch durch Safaris Fokusautomatik.
    // clip sperrt nur die Huelle; Verlauf und Textarea scrollen weiterhin selbst.
    shell.style.overflow = 'clip'
    let frame = 0
    const appScrollTop = app?.scrollTop ?? 0
    const appScrollLeft = app?.scrollLeft ?? 0

    const stabilisieren = () => {
      if (app) {
        app.scrollTop = 0
        app.scrollLeft = 0
      }
      shell.scrollTop = 0
      shell.scrollLeft = 0
    }

    const update = () => {
      if (viewport && Math.abs(viewport.scale - 1) > 0.01) return
      const liste = shell.querySelector<HTMLElement>('.overflow-y-auto')
      const warUnten = !!liste && liste.scrollHeight - liste.scrollTop - liste.clientHeight < 120
      const fenster = window.innerHeight
      const sichtbar = viewport?.height ?? fenster
      const tastatur = fenster - sichtbar > TASTATUR_AB
      // Ohne Tastatur bis unter den Home-Indicator zeichnen.
      shell.style.height = `${tastatur ? sichtbar : fenster}px`
      // Auch waehrend des Schliessens kann Safari noch einen Versatz melden.
      shell.style.top = `${Math.max(0, viewport?.offsetTop ?? 0)}px`
      stabilisieren()
      if (warUnten && liste) liste.scrollTop = liste.scrollHeight
    }

    const schedule = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(update)
    }

    update()
    app?.addEventListener('scroll', schedule)
    shell.addEventListener('focusin', schedule)
    shell.addEventListener('focusout', schedule)
    viewport?.addEventListener('resize', schedule)
    viewport?.addEventListener('scroll', schedule)
    window.addEventListener('resize', schedule)
    window.addEventListener('pageshow', schedule)
    return () => {
      cancelAnimationFrame(frame)
      app?.removeEventListener('scroll', schedule)
      shell.removeEventListener('focusin', schedule)
      shell.removeEventListener('focusout', schedule)
      viewport?.removeEventListener('resize', schedule)
      viewport?.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
      window.removeEventListener('pageshow', schedule)
      shell.style.overflow = vorherOverflow
      releaseScroll()
      if (app) {
        app.scrollTop = appScrollTop
        app.scrollLeft = appScrollLeft
      }
    }
  }, [])

  return ref
}
