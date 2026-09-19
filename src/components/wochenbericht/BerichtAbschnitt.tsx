import type { ReactNode } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { BERICHT, EASE } from '../../lib/motion'
import { USERS } from '../../lib/types'

type Props = {
  titel: string
  /** ein satz darunter, der sagt, was man sieht */
  unter?: string
  /** stelle in der reihenfolge — davon haengt der versatz ab */
  nr: number
  /** zeigt die zwei farbmarken ueber dem inhalt */
  legende?: boolean
  kinder: ReactNode
}

/**
 * Ein Abschnitt des Berichts.
 *
 * Alle sehen gleich aus und kommen gestaffelt herein, von oben nach unten —
 * das ist der ganze Trick am Aufschlagen: man liest in der Reihenfolge, in der
 * die Abschnitte auftauchen, statt eine fertige Wand zu suchen.
 */
export function BerichtAbschnitt({ titel, unter, nr, legende = false, kinder }: Props) {
  const reduced = useReducedMotion()

  return (
    <motion.section
      initial={reduced ? false : { opacity: 0, y: BERICHT.abschnittWeg }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: BERICHT.abschnittDauer,
        ease: EASE,
        delay: BERICHT.vorlauf + nr * BERICHT.abschnittVersatz,
      }}
      className="border-t border-linie pt-4"
      aria-labelledby={`bericht-${nr}`}
    >
      <h3 id={`bericht-${nr}`} className="text-[15px] font-bold text-kreide">
        {titel}
      </h3>
      {unter && <p className="mt-0.5 text-pretty text-[11px] text-kreide-52">{unter}</p>}
      {legende && <BerichtLegende />}
      <div className="mt-3">{kinder}</div>
    </motion.section>
  )
}

export function BerichtLegende() {
  return (
    <div className="mt-2 flex items-center gap-4" aria-hidden="true">
      {USERS.map((person) => (
        <span key={person.id} className="flex items-center gap-1.5 text-[10px] text-kreide-52">
          <span className="size-2 rounded-[1px]" style={{ backgroundColor: person.farbe }} />
          {person.name}
        </span>
      ))}
    </div>
  )
}
