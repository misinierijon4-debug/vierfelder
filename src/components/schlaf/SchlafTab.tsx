import { useMemo, useRef, useState } from 'react'
import { CalendarBlank } from '@phosphor-icons/react'
import { motion } from 'motion/react'
import type { Schlafnacht, UserId } from '../../lib/types'
import { abendDatum, registrierteSchlafNutzer } from '../../lib/schlafPhasen'
import { fromKey, weekDays } from '../../lib/dates'
import { istSelbeWoche, wochenZeitraum } from '../../lib/schlafKalender'
import { SchlafWochenVergleich } from './SchlafWochenVergleich'
import { SchlafNachtDetail } from './SchlafNachtDetail'
import { SchlafRhythmus } from './SchlafRhythmus'
import { SchlafKalender } from './SchlafKalender'

type Props = {
  naechte: Schlafnacht[]
  woche: string[]
  heuteKey: string
  me: UserId
}

export function SchlafTab({ naechte, woche, heuteKey, me }: Props) {
  const registrierte = registrierteSchlafNutzer(naechte)
  const detailRef = useRef<HTMLDivElement>(null)
  const [kalenderOffen, setKalenderOffen] = useState(false)
  const [ansichtUser, setAnsichtUser] = useState<UserId>(me)

  // Starte standardmäßig mit der letzten Nacht der Woche, für die Daten vorliegen,
  // oder mit heute
  const [gewaehlterTag, setGewaehlterTag] = useState<string>(() => {
    const umgekehrt = [...woche].reverse()
    const letzteMitDaten = umgekehrt.find((tag) =>
      naechte.some((n) => abendDatum(n.einschlafzeit) === tag && n.schlafMinuten > 0)
    )
    return letzteMitDaten ?? (woche.includes(heuteKey) ? heuteKey : woche[0]!)
  })

  const sichtbareWoche = useMemo(() => weekDays(fromKey(gewaehlterTag)), [gewaehlterTag])
  const wochenTitel = istSelbeWoche(sichtbareWoche, woche)
    ? 'diese woche'
    : `woche ${wochenZeitraum(sichtbareWoche)}`

  // das ziel kommt aus deinem kurzbefehl, nicht aus einer festen 8-stunden-annahme
  const zielMinuten =
    naechte.filter((n) => n.user === ansichtUser).at(-1)?.zielMinuten ??
    naechte.at(-1)?.zielMinuten ??
    480

  const waehleKalenderTag = (tag: string) => {
    setGewaehlterTag(tag)
    setKalenderOffen(false)
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => detailRef.current?.scrollIntoView({ block: 'start' }))
    })
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.2 }}
      className="space-y-4"
    >
      <div className="space-y-2">
        <div className="flex justify-end pt-1">
          <button
            type="button"
            aria-label="Schlafkalender öffnen"
            aria-haspopup="dialog"
            onClick={() => setKalenderOffen(true)}
            className="flex size-11 items-center justify-center rounded-full border border-linie bg-flaeche text-kreide transition-colors duration-150 hover:border-linie-hell focus-visible:outline-none"
          >
            <CalendarBlank size={21} weight="bold" aria-hidden="true" />
          </button>
        </div>

        <SchlafWochenVergleich
          naechte={naechte}
          registrierte={registrierte}
          woche={sichtbareWoche}
          titel={wochenTitel}
          gewaehlterTag={gewaehlterTag}
          zielMinuten={zielMinuten}
          onTagWaehlen={setGewaehlterTag}
        />
      </div>

      <div ref={detailRef}>
        <SchlafNachtDetail
          naechte={naechte}
          registrierte={registrierte}
          gewaehlterTag={gewaehlterTag}
          ansichtUser={ansichtUser}
          onAnsichtUserWaehlen={setAnsichtUser}
        />
      </div>

      <SchlafRhythmus
        naechte={naechte}
        registrierte={registrierte}
        woche={sichtbareWoche}
      />

      <SchlafKalender
        offen={kalenderOffen}
        naechte={naechte}
        ansichtUser={ansichtUser}
        gewaehlterTag={gewaehlterTag}
        heuteKey={heuteKey}
        onTagWaehlen={waehleKalenderTag}
        onSchliessen={() => setKalenderOffen(false)}
      />
    </motion.div>
  )
}
