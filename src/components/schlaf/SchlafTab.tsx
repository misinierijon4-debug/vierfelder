import { useState } from 'react'
import { motion } from 'motion/react'
import type { Schlafnacht, UserId } from '../../lib/types'
import { SchlafWochenVergleich } from './SchlafWochenVergleich'
import { SchlafNachtDetail } from './SchlafNachtDetail'
import { SchlafRhythmus } from './SchlafRhythmus'

type Props = {
  naechte: Schlafnacht[]
  woche: string[]
  heuteKey: string
  me: UserId
}

export function SchlafTab({ naechte, woche, heuteKey, me }: Props) {
  // Starte standardmäßig mit der letzten Nacht der Woche, für die Daten vorliegen,
  // oder mit heute
  const [gewaehlterTag, setGewaehlterTag] = useState<string>(() => {
    const umgekehrt = [...woche].reverse()
    const letzteMitDaten = umgekehrt.find((tag) =>
      naechte.some((n) => n.nacht === tag && n.schlafMinuten > 0)
    )
    return letzteMitDaten ?? (woche.includes(heuteKey) ? heuteKey : woche[0]!)
  })

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.2 }}
      className="space-y-4"
    >
      <SchlafWochenVergleich
        naechte={naechte}
        woche={woche}
        gewaehlterTag={gewaehlterTag}
        onTagWaehlen={setGewaehlterTag}
      />

      <SchlafNachtDetail
        naechte={naechte}
        gewaehlterTag={gewaehlterTag}
        me={me}
      />

      <SchlafRhythmus
        naechte={naechte}
        woche={woche}
      />
    </motion.div>
  )
}
