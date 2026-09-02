import type { ReactNode } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { EASE } from '../lib/motion'

/** der kleine kasten mit plus oder minus. bereichszeile und gewichtszeile teilen ihn */
export function Schritt({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string
  disabled?: boolean
  onClick: () => void
  children: ReactNode
}) {
  const reduced = useReducedMotion()
  return (
    <motion.button
      type="button"
      aria-label={label}
      disabled={disabled}
      whileTap={reduced || disabled ? undefined : { scale: 0.9 }}
      transition={{ duration: 0.09, ease: EASE }}
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      className="flex h-11 w-11 items-center justify-center rounded-[2px] text-kreide-60 disabled:opacity-35"
    >
      <span className="flex h-6 w-8 items-center justify-center rounded-[2px] border border-linie">
        {children}
      </span>
    </motion.button>
  )
}
