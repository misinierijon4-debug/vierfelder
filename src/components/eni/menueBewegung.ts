import { EASE, MENUE } from '../../lib/motion'
import type { Variants } from 'motion/react'

/** von welcher ecke das menü aufgeht — dort, wo sein knopf steht */
export type Ecke = 'oben-rechts' | 'unten-links'

const ZIEHT = { 'oben-rechts': -MENUE.weg, 'unten-links': MENUE.weg } as const
const ANKER = { 'oben-rechts': 'top right', 'unten-links': 'bottom left' } as const

export function ankerVon(ecke: Ecke) {
  return ANKER[ecke]
}

/**
 * Die Hülle des Menüs: sie wächst aus der Ecke ihres Knopfes heraus statt
 * fertig dazustehen. `scale` bleibt dicht an 1 — ein Menü, das aus dem Nichts
 * aufpoppt, sieht nach Spielzeug aus; 4 Prozent reichen, damit das Auge die
 * Richtung mitbekommt.
 *
 * Bei `prefers-reduced-motion` bleibt nur die Deckkraft. Die Bewegung ist die
 * Zugabe, die Auskunft steht auch ohne sie da.
 */
export function huelleBewegung(ecke: Ecke, reduziert: boolean): Variants {
  if (reduziert) {
    return {
      zu: { opacity: 0 },
      auf: { opacity: 1, transition: { duration: 0.1 } },
      weg: { opacity: 0, transition: { duration: 0.1 } },
    }
  }
  return {
    zu: { opacity: 0, scale: 0.96, y: ZIEHT[ecke] },
    auf: {
      opacity: 1,
      scale: 1,
      y: 0,
      transition: {
        duration: MENUE.auf,
        ease: EASE,
        staggerChildren: MENUE.staffel,
        delayChildren: MENUE.vorlauf,
      },
    },
    weg: {
      opacity: 0,
      scale: 0.985,
      y: ZIEHT[ecke] / 2,
      transition: { duration: MENUE.zu, ease: EASE },
    },
  }
}

/**
 * Die einzelnen Zeilen kommen knapp gestaffelt hinterher. Beim Zugehen nicht:
 * das Menü verschwindet als ein Stück, sonst zerfällt es beim Schließen.
 */
export function zeileBewegung(reduziert: boolean): Variants {
  if (reduziert) return { zu: {}, auf: {}, weg: {} }
  return {
    zu: { opacity: 0, y: -3 },
    auf: { opacity: 1, y: 0, transition: { duration: 0.16, ease: EASE } },
    weg: { opacity: 1 },
  }
}
