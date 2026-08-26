import type { CSSProperties } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { EASE } from '../lib/motion'

type Props = {
  value: number
  delay?: number
  className?: string
  style?: CSSProperties
}

/** zahlen werden nie hart getauscht, sie rollen. tabellarische ziffern, nichts springt */
export function Zahl({ value, delay = 0, className = '', style }: Props) {
  const reduced = useReducedMotion()
  const chars = String(value).split('')

  if (reduced) {
    return (
      <span className={`tnum ${className}`} style={style}>
        {value}
      </span>
    )
  }

  return (
    <span className={`tnum inline-flex leading-none ${className}`} style={style}>
      <span className="sr-only">{value}</span>
      {chars.map((char, i) => (
        <span
          key={chars.length - i}
          aria-hidden
          className="relative inline-block overflow-hidden"
        >
          <AnimatePresence initial={false} mode="popLayout">
            <motion.span
              key={char}
              initial={{ y: '95%', opacity: 0 }}
              animate={{ y: '0%', opacity: 1 }}
              exit={{ y: '-95%', opacity: 0 }}
              transition={{ duration: 0.22, ease: EASE, delay: delay + i * 0.03 }}
              className="inline-block"
            >
              {char}
            </motion.span>
          </AnimatePresence>
        </span>
      ))}
    </span>
  )
}
