import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import type { EniZeile } from '../../lib/eniSpeicher'

const ENDE_ABSTAND = 120

/**
 * Neue Worte folgen nur, solange man unten liest. Der Zustand wird beim
 * Scrollen gemerkt, bevor der nächste Text die Höhe der Liste verändert.
 * Eigene Nachrichten und ein Chatwechsel holen den neuen Gesprächsstand hoch.
 */
export function useEniScroll(
  chatId: string | null,
  letzteZeile: EniZeile | undefined,
  teilAntwort: string,
  prueft: boolean
) {
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const folgt = useRef(true)
  const [weiterUnten, setWeiterUnten] = useState(false)

  const zumEnde = useCallback(() => {
    folgt.current = true
    setWeiterUnten(false)
    const liste = scrollContainerRef.current
    if (liste) liste.scrollTop = liste.scrollHeight
  }, [])

  const beimScrollen = useCallback(() => {
    const liste = scrollContainerRef.current
    if (!liste) return
    const amEnde = liste.scrollHeight - liste.scrollTop - liste.clientHeight < ENDE_ABSTAND
    folgt.current = amEnde
    setWeiterUnten(!amEnde)
  }, [])

  useLayoutEffect(() => {
    folgt.current = true
    setWeiterUnten(false)
  }, [chatId])

  useLayoutEffect(() => {
    if (letzteZeile?.rolle === 'mensch') folgt.current = true
  }, [letzteZeile?.id, letzteZeile?.rolle])

  useLayoutEffect(() => {
    const liste = scrollContainerRef.current
    if (!liste) return
    if (folgt.current) {
      // Kein neuer Smooth-Scroll pro Token: so bleibt das Lesen beim Stream ruhig.
      liste.scrollTop = liste.scrollHeight
      setWeiterUnten(false)
    } else {
      setWeiterUnten(liste.scrollHeight - liste.scrollTop - liste.clientHeight >= ENDE_ABSTAND)
    }
  }, [chatId, letzteZeile, teilAntwort, prueft])

  return { scrollContainerRef, weiterUnten, beimScrollen, zumEnde }
}
