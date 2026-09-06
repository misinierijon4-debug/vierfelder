import { useLayoutEffect, useRef } from 'react'
import type { RefObject } from 'react'

type GesperrtesElement = {
  element: HTMLElement
  inert: boolean
  inertAttribut: boolean
  ariaHidden: string | null
}

const FOKUSZIEL = [
  'button:not([disabled])',
  'a[href]',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

function fokusziele(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOKUSZIEL)).filter(
    (element) =>
      element.tabIndex >= 0 &&
      !element.hidden &&
      !element.closest('[inert], [aria-hidden="true"]')
  )
}

/**
 * Sperrt bei einem benutzerdefinierten modalen Blatt den Hintergrund, hält
 * Tab/Shift+Tab im Dialog und gibt den Fokus beim Schließen zurück. Native
 * `<dialog>.showModal()`-Ansichten brauchen diesen Helfer nicht.
 */
export function useDialogFokus(
  root: RefObject<HTMLElement | null>,
  start: RefObject<HTMLElement | null>,
  onSchliessen: () => void
) {
  const schliessen = useRef(onSchliessen)
  useLayoutEffect(() => {
    schliessen.current = onSchliessen
  }, [onSchliessen])

  useLayoutEffect(() => {
    const dialog = root.current
    if (!dialog) return

    const vorher = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const gesperrt: GesperrtesElement[] = []
    let ast: HTMLElement = dialog

    while (ast.parentElement && ast.parentElement !== document.body) {
      for (const geschwister of ast.parentElement.children) {
        if (!(geschwister instanceof HTMLElement) || geschwister === ast) continue
        gesperrt.push({
          element: geschwister,
          inert: geschwister.inert,
          inertAttribut: geschwister.hasAttribute('inert'),
          ariaHidden: geschwister.getAttribute('aria-hidden'),
        })
        geschwister.setAttribute('inert', '')
        geschwister.inert = true
        geschwister.setAttribute('aria-hidden', 'true')
      }
      ast = ast.parentElement
    }

    const taste = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        schliessen.current()
        return
      }
      if (event.key !== 'Tab') return

      const ziele = fokusziele(dialog)
      if (ziele.length === 0) {
        event.preventDefault()
        dialog.focus()
        return
      }

      const erstes = ziele[0]!
      const letztes = ziele[ziele.length - 1]!
      if (event.shiftKey && (document.activeElement === erstes || !dialog.contains(document.activeElement))) {
        event.preventDefault()
        letztes.focus()
      } else if (!event.shiftKey && document.activeElement === letztes) {
        event.preventDefault()
        erstes.focus()
      }
    }

    document.addEventListener('keydown', taste, true)
    ;(start.current ?? fokusziele(dialog)[0] ?? dialog).focus()

    return () => {
      document.removeEventListener('keydown', taste, true)
      for (const eintrag of gesperrt.reverse()) {
        eintrag.element.inert = eintrag.inert
        if (eintrag.inertAttribut) eintrag.element.setAttribute('inert', '')
        else eintrag.element.removeAttribute('inert')
        if (eintrag.ariaHidden === null) eintrag.element.removeAttribute('aria-hidden')
        else eintrag.element.setAttribute('aria-hidden', eintrag.ariaHidden)
      }
      if (vorher?.isConnected && !vorher.closest('[inert]')) vorher.focus()
    }
  }, [root, start])
}
