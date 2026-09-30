import { motion, useIsPresent } from 'motion/react'
import type { HTMLMotionProps } from 'motion/react'

/** Ausblendende Menüs dürfen weder Fokus noch weitere Klicks annehmen. */
export function EniMenue(props: HTMLMotionProps<'div'>) {
  const praesent = useIsPresent()
  return <motion.div {...props} aria-hidden={!praesent || undefined} inert={!praesent} />
}
