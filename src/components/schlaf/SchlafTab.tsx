import { useCallback, useMemo, useRef, useState } from 'react'
import { motion } from 'motion/react'
import type { Schlafnacht, UserId } from '../../lib/types'
import { abendDatum, registrierteSchlafNutzer } from '../../lib/schlafPhasen'
import { addDays, fromKey, weekDays } from '../../lib/dates'
import { istSelbeWoche, wochenZeitraum } from '../../lib/kalender'
import { SchlafWochenVergleich } from './SchlafWochenVergleich'
import { SchlafNachtDetail } from './SchlafNachtDetail'
import { SchlafNachtVergleich } from './SchlafNachtVergleich'
import { SchlafRhythmus } from './SchlafRhythmus'
import { SchlafKalender } from './SchlafKalender'

type Props = {
  naechte: Schlafnacht[]
  woche: string[]
  heuteKey: string
  me: UserId
  /** der verlauf aelterer naechte kommt erst, wenn eine davon geoeffnet wird */
  onVerlaufBrauchen: (user: UserId, nacht: string) => void
}

export function SchlafTab({ naechte, woche, heuteKey, me, onVerlaufBrauchen }: Props) {
  const registrierte = registrierteSchlafNutzer(naechte)
  const detailRef = useRef<HTMLDivElement>(null)
  const [kalenderOffen, setKalenderOffen] = useState(false)
  const [ansichtUser, setAnsichtUser] = useState<UserId>(me)
  // aus welcher richtung die neue woche hereinkommt: −1 von links, 1 von rechts
  const [richtung, setRichtung] = useState<-1 | 1>(1)

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
  // die laufende woche ist das ende der zeitleiste: weiter nach vorn geht nichts
  const kannVor = sichtbareWoche[0]! < woche[0]!

  /**
   * welcher tag der neuen woche gemeint ist: die letzte nacht, fuer die daten
   * vorliegen, sonst derselbe wochentag wie bisher.
   */
  const tagInWoche = useCallback(
    (ziel: string[], bisher: string) => {
      const mitDaten = [...ziel].reverse().find((tag) =>
        naechte.some((n) => abendDatum(n.einschlafzeit) === tag && n.schlafMinuten > 0)
      )
      const wochentag = weekDays(fromKey(bisher)).indexOf(bisher)
      return mitDaten ?? ziel[wochentag] ?? ziel[0]!
    },
    [naechte]
  )

  const wocheWechseln = useCallback(
    (schritt: -1 | 1) => {
      const ziel = weekDays(addDays(fromKey(gewaehlterTag), schritt * 7))
      // vorwaerts endet die zeitleiste bei der laufenden woche
      if (schritt > 0 && ziel[0]! > woche[0]!) return
      setRichtung(schritt)
      setGewaehlterTag(tagInWoche(ziel, gewaehlterTag))
    },
    [gewaehlterTag, tagInWoche, woche]
  )

  // das ziel kommt je person aus deren letzter nacht, nicht aus einer festen
  // 8-stunden-annahme
  const ziele = useMemo(() => {
    const gefunden: Record<UserId, number> = { erijon: 480, koray: 480 }
    for (const nacht of naechte) {
      if (nacht.zielMinuten > 0) gefunden[nacht.user] = nacht.zielMinuten
    }
    return gefunden
  }, [naechte])

  const waehleKalenderTag = (tag: string) => {
    setRichtung(tag < gewaehlterTag ? -1 : 1)
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
      <SchlafWochenVergleich
        naechte={naechte}
        registrierte={registrierte}
        woche={sichtbareWoche}
        titel={wochenTitel}
        gewaehlterTag={gewaehlterTag}
        ziele={ziele}
        richtung={richtung}
        kannVor={kannVor}
        onTagWaehlen={setGewaehlterTag}
        onWocheWechseln={wocheWechseln}
        onKalenderOeffnen={() => setKalenderOffen(true)}
      />

      <div ref={detailRef}>
        <SchlafNachtDetail
          naechte={naechte}
          registrierte={registrierte}
          gewaehlterTag={gewaehlterTag}
          ansichtUser={ansichtUser}
          onAnsichtUserWaehlen={setAnsichtUser}
          onVerlaufBrauchen={onVerlaufBrauchen}
        />
      </div>

      <SchlafNachtVergleich naechte={naechte} gewaehlterTag={gewaehlterTag} />

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
