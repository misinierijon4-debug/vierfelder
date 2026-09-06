import { useLayoutEffect, useRef } from 'react'
import { aktivierePwaUpdate, ladePwaNeu, pruefePwaUpdate, usePwaStand } from '../lib/pwa'
import { useNeustartBlockerStand } from '../lib/pwaBlocker'

export function PwaStatus() {
  const pwa = usePwaStand()
  const blocker = useNeustartBlockerStand()
  const blockiert = blocker.anzahl > 0

  const updateText = pwa.fehler && pwa.update !== 'keins'
    ? pwa.fehler
    : pwa.update === 'bereit'
      ? blockiert
        ? 'neue fassung bereit · erst offene eingabe abschließen'
        : 'neue fassung bereit'
      : pwa.update === 'aktivierung'
        ? 'neue fassung wird aktiviert'
        : pwa.update === 'neu-laden'
          ? blockiert
            ? 'neue fassung aktiv · erst offene eingabe abschließen'
            : 'neue fassung aktiv · zum übernehmen neu laden'
          : null

  const text = updateText
    ?? (!pwa.online
      ? 'offline · netzwerk nicht verfügbar; geladene ansicht bleibt sichtbar'
      : pwa.fehler
        ?? (pwa.offlineBereit ? 'app-oberfläche ist jetzt offline verfügbar' : null))

  const status = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const root = document.documentElement
    const setzeReserve = () => {
      const hoehe = text && status.current
        ? Math.ceil(status.current.getBoundingClientRect().height)
        : 0
      root.style.setProperty('--pwa-status-reserve', `${hoehe}px`)
    }
    setzeReserve()
    if (!text || !status.current) return () => setzeReserve()

    const beobachter = typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(setzeReserve)
    beobachter?.observe(status.current)
    window.addEventListener('resize', setzeReserve)
    return () => {
      beobachter?.disconnect()
      window.removeEventListener('resize', setzeReserve)
      root.style.setProperty('--pwa-status-reserve', '0px')
    }
  }, [text])

  if (!text) return null

  return (
    <div ref={status} className="pointer-events-none fixed inset-x-0 bottom-0 z-40 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="pointer-events-auto mx-auto flex min-h-11 max-w-[420px] items-center gap-3 rounded-[2px] border border-linie-hell bg-grund px-3 text-[11px] text-kreide-60"
      >
        <span className="min-w-0 flex-1 leading-4">{text}</span>
        {pwa.update === 'bereit' && (
          <button
            type="button"
            disabled={blockiert}
            onClick={() => void aktivierePwaUpdate()}
            className="min-h-11 shrink-0 px-1 font-semibold text-kreide underline decoration-linie-hell underline-offset-4 disabled:text-kreide-52 disabled:no-underline"
          >
            aktualisieren
          </button>
        )}
        {pwa.update === 'neu-laden' && (
          <button
            type="button"
            disabled={blockiert}
            onClick={ladePwaNeu}
            className="min-h-11 shrink-0 px-1 font-semibold text-kreide underline decoration-linie-hell underline-offset-4 disabled:text-kreide-52 disabled:no-underline"
          >
            neu laden
          </button>
        )}
        {pwa.update === 'keins' && pwa.online && pwa.fehler && pwa.pruefbar && (
          <button
            type="button"
            onClick={() => void pruefePwaUpdate()}
            className="min-h-11 shrink-0 px-1 font-semibold text-kreide underline decoration-linie-hell underline-offset-4"
          >
            erneut
          </button>
        )}
        {pwa.update === 'keins' && pwa.online && pwa.fehler && !pwa.pruefbar && (
          <button
            type="button"
            disabled={blockiert}
            onClick={ladePwaNeu}
            className="min-h-11 shrink-0 px-1 font-semibold text-kreide underline decoration-linie-hell underline-offset-4 disabled:text-kreide-52 disabled:no-underline"
          >
            neu laden
          </button>
        )}
      </div>
    </div>
  )
}
