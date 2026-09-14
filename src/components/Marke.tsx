import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { EASE, TAKT } from '../lib/motion'

type Props = {
  gesetzt: boolean
  /** gesetzt, aber nur behauptet: blasse fläche statt voller marke */
  halb: boolean
  farbe: string
}

/**
 * die zentrale interaktion. kein natives input, kein häkchen.
 * die marke hat exakt die form einer rasterzelle, nur groß.
 * die zeile darum ist das eigentliche ziel, deshalb ist das hier nur die anzeige.
 */
export function Marke({ gesetzt, halb, farbe }: Props) {
  const reduced = useReducedMotion()

  return (
    <span className="flex h-8 w-12 shrink-0 items-center justify-center">
      <span
        className="relative block h-7 w-10 rounded-[2px] border transition-colors duration-200"
        style={{ borderColor: gesetzt ? farbe : "var(--marke-rand)" }}
      >
        <AnimatePresence initial={false}>
          {gesetzt && (
            <motion.span
              key="fuellung"
              initial={reduced ? { opacity: 1 } : { scaleX: 0.22, opacity: 0.4 }}
              animate={reduced ? { opacity: 1 } : { scaleX: 1, opacity: 1 }}
              exit={reduced ? { opacity: 0 } : { scaleX: 0.22, opacity: 0 }}
              transition={{ duration: reduced ? 0 : TAKT.marke, ease: EASE }}
              style={{
                background: halb ? `color-mix(in srgb, ${farbe} 40%, var(--grund))` : farbe,
                originX: 0,
              }}
              className="absolute inset-[1px] block rounded-[1px]"
            />
          )}
        </AnimatePresence>
      </span>
    </span>
  )
}
