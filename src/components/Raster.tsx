import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { FELDER, USERS } from '../lib/types'
import type { Ereignis, FeldId, UserId, Zustand } from '../lib/types'
import { TAGKUERZEL } from '../lib/dates'
import { istGesetzt, quelle, wocheBereich } from '../lib/tracker'
import { EASE, STEMPEL, TAKT } from '../lib/motion'

/* rastergeometrie an einer stelle, damit das heute-band exakt unter der spalte liegt */
const LABEL = 38
const SUMME = 22
const SPALT = 5
const ZELLE = `calc((100% - ${LABEL + SUMME + SPALT * 8}px) / 7)`

type Props = {
  zustand: Zustand
  woche: string[]
  heute: string
  ereignis: Ereignis | null
  /** die eigene woche ist noch komplett leer */
  leer: boolean
}

export function Raster({ zustand, woche, heute, ereignis, leer }: Props) {
  const reduced = useReducedMotion()
  const heuteIndex = woche.indexOf(heute)

  return (
    <motion.section
      aria-label="geteiltes wochenraster"
      initial={reduced ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reduced ? 0 : 0.28, ease: EASE, delay: reduced ? 0 : 0.22 }}
      className="mt-6"
    >
      <div className="mb-3 flex items-baseline justify-between">
        {/* der leere zustand steht in derselben zeile wie das label, sonst springt das raster */}
        <span className="text-[12px] text-kreide-52">
          {leer ? 'noch nichts diese woche' : 'woche'}
        </span>
        <div className="flex items-center gap-3">
          {USERS.map((u) => (
            <span key={u.id} className="flex items-center gap-1.5 text-[12px] text-kreide-52">
              <span className="block h-2 w-3 rounded-[1px]" style={{ background: u.farbe }} />
              {u.name}
            </span>
          ))}
        </div>
      </div>

      <div
        className="relative grid items-center gap-x-[5px] gap-y-[4px]"
        style={{ gridTemplateColumns: `${LABEL}px repeat(7, minmax(0, 1fr)) ${SUMME}px` }}
      >
        {heuteIndex >= 0 && (
          <div
            aria-hidden
            className="pointer-events-none absolute -top-1.5 -bottom-1.5 rounded-[3px] bg-flaeche"
            style={{
              left: `calc(${LABEL + SPALT}px + ${heuteIndex} * (${ZELLE} + ${SPALT}px))`,
              width: ZELLE,
            }}
          />
        )}

        <div />
        {TAGKUERZEL.map((kuerzel, i) => (
          <div
            key={kuerzel}
            className="relative z-10 text-center text-[11px] leading-none transition-colors duration-200"
            style={{ color: i === heuteIndex ? 'var(--kreide)' : 'var(--kreide-52)' }}
          >
            {kuerzel}
          </div>
        ))}
        <div />

        {FELDER.map((feld, fi) => (
          <Bereichsblock
            key={feld.id}
            area={feld.id}
            label={feld.label}
            letzter={fi === FELDER.length - 1}
            zustand={zustand}
            woche={woche}
            heute={heute}
            ereignis={ereignis}
          />
        ))}
      </div>
    </motion.section>
  )
}

function Bereichsblock({
  area,
  label,
  letzter,
  zustand,
  woche,
  heute,
  ereignis,
}: {
  area: FeldId
  label: string
  letzter: boolean
  zustand: Zustand
  woche: string[]
  heute: string
  ereignis: Ereignis | null
}) {
  return (
    <>
      {/* der bereichsname überspannt beide zeilen, deshalb lesen sie sich als ein block */}
      <div className="relative z-10 row-span-2 self-center pr-1 text-[11px] leading-tight text-kreide-60">
        {label}
      </div>

      {USERS.map((u) => {
        const treffer =
          ereignis && ereignis.area === area && ereignis.user === u.id ? ereignis : null
        return (
          <Zeile
            key={u.id}
            area={area}
            areaLabel={label}
            user={u.id}
            farbe={u.farbe}
            leer={u.leer}
            name={u.name}
            zustand={zustand}
            woche={woche}
            heute={heute}
            treffer={treffer}
            sweep={treffer && treffer.quelle === 'fremd' ? treffer.id : null}
          />
        )
      })}

      {!letzter && <div aria-hidden className="col-span-full my-1.5 h-px bg-linie" />}
    </>
  )
}

function Zeile({
  area,
  areaLabel,
  user,
  farbe,
  leer,
  name,
  zustand,
  woche,
  heute,
  treffer,
  sweep,
}: {
  area: FeldId
  areaLabel: string
  user: UserId
  farbe: string
  leer: string
  name: string
  zustand: Zustand
  woche: string[]
  heute: string
  treffer: Ereignis | null
  sweep: number | null
}) {
  const summe = wocheBereich(zustand, user, area, woche)

  return (
    <>
      {woche.map((tag, i) => (
        <Zelle
          key={tag}
          gefuellt={istGesetzt(zustand, user, area, tag)}
          // halb heißt: gesetzt, aber nur behauptet. bei lernen und lesen gibt
          // es nichts zu messen, dort bleibt jede zelle voll.
          halb={quelle(zustand, user, area, tag) === 'getippt'}
          farbe={farbe}
          leer={leer}
          zukunft={tag > heute}
          animiert={treffer && treffer.tag === tag ? treffer : null}
          sweep={sweep}
          sweepIndex={i}
          label={`${name}, ${areaLabel}, ${tag}`}
        />
      ))}
      <div className="relative z-10 text-right text-[13px] font-semibold leading-none">
        <span className="sr-only">{`${name}, ${areaLabel}: ${summe} von 7 tagen`}</span>
        {summe > 0 ? (
          <span aria-hidden className="tnum" style={{ color: farbe }}>
            {summe}
          </span>
        ) : (
          <span aria-hidden className="tnum text-kreide-52">
            –
          </span>
        )}
      </div>
    </>
  )
}

function Zelle({
  gefuellt,
  halb,
  farbe,
  leer,
  zukunft,
  animiert,
  sweep,
  sweepIndex,
  label,
}: {
  gefuellt: boolean
  halb: boolean
  farbe: string
  leer: string
  zukunft: boolean
  animiert: Ereignis | null
  sweep: number | null
  sweepIndex: number
  label: string
}) {
  const reduced = useReducedMotion()
  const verzoegerung = animiert
    ? animiert.quelle === 'selbst'
      ? TAKT.zelle
      : TAKT.fremd
    : 0

  return (
    <span
      aria-hidden
      data-tag={label}
      className="relative z-10 block h-[22px] rounded-[2px] border transition-colors duration-200"
      style={{
        borderColor: gefuellt
          ? halb
            ? farbe
            : 'transparent'
          : zukunft
            ? 'var(--linie)'
            : leer,
      }}
    >
      <AnimatePresence initial={false}>
        {gefuellt && (
          <motion.span
            key="fuellung"
            initial={animiert && !reduced ? { scale: 0.4, opacity: 0 } : { scale: 1, opacity: 1 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={reduced ? { opacity: 0 } : { scale: 0.5, opacity: 0 }}
            transition={
              animiert && !reduced
                ? { ...STEMPEL, delay: verzoegerung }
                : { duration: reduced ? 0 : 0.12 }
            }
            // ein getippter tick bleibt ein rand mit blasser fläche: er zählt
            // genauso, sieht aber nicht aus wie eine messung.
            style={{
              background: halb ? `color-mix(in srgb, ${farbe} 40%, var(--grund))` : farbe,
            }}
            className={
              halb
                ? 'absolute inset-0 block rounded-[1px]'
                : 'absolute inset-[-1px] block rounded-[2px]'
            }
          />
        )}
      </AnimatePresence>

      {/* der eintrag des anderen läuft als licht über seine zeile */}
      {sweep !== null && !reduced && (
        <motion.span
          key={`sweep-${sweep}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 1, 0] }}
          transition={{ duration: 0.28, delay: sweepIndex * 0.035, ease: 'linear' }}
          style={{ background: 'var(--linie-hell)' }}
          className="pointer-events-none absolute inset-[-1px] block rounded-[2px]"
        />
      )}
    </span>
  )
}
