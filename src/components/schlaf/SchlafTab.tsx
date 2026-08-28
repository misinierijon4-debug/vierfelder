import { useState } from 'react'
import { motion } from 'motion/react'
import type { Schlafnacht, UserId } from '../../lib/types'
import { abendDatum, registrierteSchlafNutzer } from '../../lib/schlafPhasen'
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
  const registrierte = registrierteSchlafNutzer(naechte)

  // Starte standardmäßig mit der letzten Nacht der Woche, für die Daten vorliegen,
  // oder mit heute
  const [gewaehlterTag, setGewaehlterTag] = useState<string>(() => {
    const umgekehrt = [...woche].reverse()
    const letzteMitDaten = umgekehrt.find((tag) =>
      naechte.some((n) => abendDatum(n.einschlafzeit) === tag && n.schlafMinuten > 0)
    )
    return letzteMitDaten ?? (woche.includes(heuteKey) ? heuteKey : woche[0]!)
  })

  // das ziel kommt aus deinem kurzbefehl, nicht aus einer festen 8-stunden-annahme
  const zielMinuten =
    naechte.filter((n) => n.user === me).at(-1)?.zielMinuten ?? naechte.at(-1)?.zielMinuten ?? 480

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
        registrierte={registrierte}
        woche={woche}
        gewaehlterTag={gewaehlterTag}
        zielMinuten={zielMinuten}
        onTagWaehlen={setGewaehlterTag}
      />

      <SchlafNachtDetail
        naechte={naechte}
        registrierte={registrierte}
        gewaehlterTag={gewaehlterTag}
        me={me}
      />

      <SchlafRhythmus
        naechte={naechte}
        registrierte={registrierte}
        woche={woche}
      />
    </motion.div>
  )
}
