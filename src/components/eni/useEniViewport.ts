import { useLayoutEffect, useRef } from 'react'
import { scrollSperre } from '../../lib/scrollsperre'
import { EASE, TASTATUR } from '../../lib/motion'

const KURVE = `cubic-bezier(${EASE.join(', ')})`

/**
 * Ab dieser Differenz zwischen Fenster und sichtbarem Bereich liegt eine
 * Tastatur davor. Die kleinste iOS-Tastatur misst rund 250 Punkte; die beiden
 * Safe-Areas zusammen hoechstens etwa 95. Dazwischen ist Platz fuer eine
 * Grenze, die beide Faelle sicher auseinanderhaelt.
 */
const TASTATUR_AB = 120

/** iOS verkleinert bei der Tastatur den VisualViewport, nicht zuverlässig dvh. */
export function useEniViewport() {
  const ref = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const shell = ref.current
    if (!shell) return
    const viewport = window.visualViewport
    const releaseScroll = scrollSperre()
    const ruhig = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
    let frame = 0
    // Ob der Verlauf beim letzten Messen unten stand. Wird beim Nachziehen
    // gebraucht, wenn die Höhe fertig gewandert ist.
    let warUnten = false

    const scroller = () => shell.querySelector<HTMLElement>('.overflow-y-auto')

    const update = () => {
      // Pinch-Zoom bleibt dem Browser überlassen.
      if (viewport && Math.abs(viewport.scale - 1) > 0.01) return
      const liste = scroller()
      warUnten = !!liste && liste.scrollHeight - liste.scrollTop - liste.clientHeight < 120
      /*
        Der VisualViewport ist die richtige Hoehe, solange eine Tastatur davor
        liegt — und die falsche, solange keine da ist: in der Homescreen-PWA
        zeichnet die App wegen `viewport-fit=cover` bis unter den
        Home-Indicator, der VisualViewport zaehlt diesen Streifen aber nicht
        mit. Die Huelle endete deshalb oberhalb davon, und das Safe-Area-
        Polster der Eingabe kam auf eine Kante, die schon Abstand hielt: ein
        leerer Streifen unter der Eingabezeile, dauerhaft und nur dort.

        Ohne Tastatur gilt deshalb das Fenster, mit Tastatur der sichtbare
        Bereich. Wo beide Werte gleich sind — jeder Browser ausserhalb dieses
        iOS-Falls — aendert die Unterscheidung nichts.
      */
      const fenster = window.innerHeight
      const sichtbar = viewport?.height ?? fenster
      const tastatur = fenster - sichtbar > TASTATUR_AB
      shell.style.height = `${tastatur ? sichtbar : fenster}px`
      shell.style.top = `${tastatur ? (viewport?.offsetTop ?? 0) : 0}px`
      if (warUnten && liste) liste.scrollTop = liste.scrollHeight
    }

    /*
      Die Höhe wandert jetzt über einen Übergang, statt zu springen. Der
      Verlauf steht darin aber still: seine sichtbare Höhe schrumpft Bild für
      Bild mit, und ein scrollTop, das nur am Anfang gesetzt wurde, liegt am
      Ende daneben. Also am Ende des Übergangs noch einmal ans Ende ziehen.
    */
    const nachziehen = (event: TransitionEvent) => {
      if (event.target !== shell || event.propertyName !== 'height') return
      const liste = scroller()
      if (warUnten && liste) liste.scrollTop = liste.scrollHeight
    }

    const schedule = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(update)
    }

    update()
    /*
      Erst nach der ersten Messung gleiten. Der erste Aufruf setzt die
      Ausgangshöhe — mit Übergang würde der Bildschirm beim Öffnen aus der
      Höhe null herauswachsen.
    */
    if (!ruhig) {
      shell.style.transition = `height ${TASTATUR}s ${KURVE}, top ${TASTATUR}s ${KURVE}`
      shell.addEventListener('transitionend', nachziehen)
    }

    viewport?.addEventListener('resize', schedule)
    viewport?.addEventListener('scroll', schedule)
    window.addEventListener('resize', schedule)
    return () => {
      cancelAnimationFrame(frame)
      shell.style.transition = ''
      shell.removeEventListener('transitionend', nachziehen)
      viewport?.removeEventListener('resize', schedule)
      viewport?.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
      releaseScroll()
    }
  }, [])

  return ref
}
