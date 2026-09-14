import { useEffect } from 'react'
import type { RefObject } from 'react'

/**
 * Ein Klick daneben oder Escape schließt ein offenes Menü.
 *
 * Beides hängt am Dokument, weil der Klick sonst erst ankommt, wenn er schon
 * etwas anderes getroffen hat — und `pointerdown` statt `click`, damit das
 * Menü weg ist, bevor der Finger wieder hochgeht.
 *
 * Zwei Menüs brauchen das inzwischen: das im Kopf und die Modellwahl an der
 * Eingabe. Zweimal dasselbe abzuschreiben heißt, es beim nächsten Mal nur an
 * einer Stelle zu reparieren.
 */
export function useMenueDaneben(
  offen: boolean,
  huelle: RefObject<HTMLElement | null>,
  onSchliessen: () => void
) {
  useEffect(() => {
    if (!offen) return
    const daneben = (event: MouseEvent) => {
      if (!huelle.current?.contains(event.target as Node)) onSchliessen()
    }
    const taste = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onSchliessen()
    }
    document.addEventListener('pointerdown', daneben)
    document.addEventListener('keydown', taste)
    return () => {
      document.removeEventListener('pointerdown', daneben)
      document.removeEventListener('keydown', taste)
    }
  }, [offen, huelle, onSchliessen])
}
