import { useEffect, useState } from 'react'

/**
 * Muss zur Dauer des Dialog-Übergangs in `index.css` passen. Steht hier als
 * Zahl und dort als Zeit; wer eine ändert, ändert die andere mit.
 */
export const DIALOG_ABGANG_MS = 240

/**
 * Hält den Inhalt eines Dialogs so lange stehen, wie sein Ausblenden dauert.
 *
 * Die Dialoge zeichnen ihren Inhalt mit `{offen && …}`. Beim Schließen nahm
 * React ihn damit im selben Schritt heraus, in dem `close()` lief — das Blatt
 * wäre leer ausgeblendet, also als dunkle Fläche ohne Inhalt. Das sieht
 * schlechter aus als das harte Verschwinden von vorher.
 *
 * Deshalb ein Nachlauf: `offen` schaltet sofort ein, aus erst nach dem
 * Übergang. Wer keine Bewegung will, bekommt das alte sofortige Verhalten —
 * dort blendet auch nichts aus, auf das man warten müsste.
 */
export function useDialogNachlauf(offen: boolean) {
  const [sichtbar, setSichtbar] = useState(offen)

  useEffect(() => {
    if (offen) {
      setSichtbar(true)
      return
    }
    const ruhig = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
    if (ruhig) {
      setSichtbar(false)
      return
    }
    const timer = window.setTimeout(() => setSichtbar(false), DIALOG_ABGANG_MS)
    return () => window.clearTimeout(timer)
  }, [offen])

  return sichtbar
}
