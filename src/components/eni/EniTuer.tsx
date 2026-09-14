import { motion, useReducedMotion } from 'motion/react'
import { STEMPEL } from '../../lib/motion'
import { EniMarke } from './EniMarke'

type Props = {
  onOeffnen: () => void
}

/**
 * Der Weg zu ENI aus der Anzeigetafel heraus.
 *
 * Hochwertig, ruhig und ausgewogen gestaltet:
 * - 14px Beschriftung fuer klare Lesbarkeit
 * - Mehr Innenraum mit komfortabler 44px-Trefferflaeche
 * - Dezenterer, ruhiger Rand statt harter Kastenkante
 * - Harmonisch proportioniertes Logo
 */
export function EniTuer({ onOeffnen }: Props) {
  const reduziert = useReducedMotion() ?? false

  return (
    <motion.button
      type="button"
      onClick={onOeffnen}
      aria-label="ENI öffnen"
      whileTap={reduziert ? undefined : { scale: 0.97 }}
      transition={STEMPEL}
      className="group relative flex min-h-11 items-center gap-2 rounded-[2px] border border-linie/40 bg-flaeche/70 px-3.5 py-1.5 text-kreide transition-[background-color,border-color,box-shadow] duration-200 hover:border-linie hover:bg-flaeche hover:shadow-[0_0_12px_-3px_rgba(255,255,255,0.06)] active:bg-grund focus-visible:outline-2 focus-visible:outline-fokus"
    >
      <EniMarke groesse={17} grund="var(--flaeche)" />
      <span className="display text-[14px] font-bold leading-none tracking-[0.05em] text-kreide">
        ENI
      </span>
      <span
        aria-hidden="true"
        className="relative ml-0.5 flex size-3.5 items-center justify-center text-kreide-52 transition-transform duration-200 ease-out group-hover:translate-x-0.5 group-hover:text-kreide"
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="m9 18 6-6-6-6" />
        </svg>
      </span>
    </motion.button>
  )
}
