import { motion, useReducedMotion } from 'motion/react'
import { USERS } from '../../lib/types'
import type { UserDef } from '../../lib/types'
import { BERICHT, EASE } from '../../lib/motion'
import type { BerichtGewichtPerson, Wochenbericht } from '../../lib/wochenbericht'

type Props = { bericht: Wochenbericht; grundVersatz: number }

const EINE_STELLE = new Intl.NumberFormat('de-DE', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
})

/**
 * Zwei Karten statt eines Diagramms.
 *
 * Zwei Gewichte in ein Bild zu legen heisst, den Abstand zwischen zwei
 * Personen zu zeigen — und der sagt nichts. Interessant ist die eigene Kurve.
 * Jede Karte hat deshalb ihre eigene Skala, und die Zahl daneben nennt den
 * Bereich, damit die Steigung nicht groesser aussieht, als sie ist.
 */
export function BerichtGewicht({ bericht, grundVersatz }: Props) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {USERS.map((person, i) => (
        <Karte
          key={person.id}
          person={person}
          werte={bericht.gewicht[person.id]}
          versatz={grundVersatz + i * 0.08}
        />
      ))}
    </div>
  )
}

function Karte({
  person,
  werte,
  versatz,
}: {
  person: UserDef
  werte: BerichtGewichtPerson
  versatz: number
}) {
  const reduced = useReducedMotion()
  const anzahl = werte.punkte.length

  return (
    <div className="rounded-[2px] border border-linie bg-flaeche p-2.5">
      <div className="flex items-baseline justify-between gap-1">
        <span className="flex min-w-0 items-center gap-1.5 text-[11px] text-kreide-52">
          <span className="size-2 shrink-0 rounded-[1px]" style={{ backgroundColor: person.farbe }} />
          <span className="truncate">{person.name}</span>
        </span>
        <span className="tnum shrink-0 text-[9px] text-kreide-52">
          {anzahl === 0 ? '—' : `${anzahl}×`}
        </span>
      </div>

      {anzahl === 0 ? (
        <p className="mt-2 text-[11px] text-kreide-52">nichts gewogen</p>
      ) : (
        <>
          <p className="tnum mt-1.5 text-[17px] font-bold leading-none text-kreide">
            {EINE_STELLE.format(werte.schnitt!)}
            <span className="ml-1 text-[10px] font-medium text-kreide-52">kg ø</span>
          </p>
          <p className="mt-1 text-[10px] text-kreide-52">
            {werte.delta === null
              ? 'eine messung'
              : `${werte.delta > 0 ? '+' : werte.delta < 0 ? '−' : '±'}${EINE_STELLE.format(
                  Math.abs(werte.delta)
                )} kg über die woche`}
          </p>
          <Kurve punkte={werte.punkte} farbe={person.farbe} versatz={versatz} reduced={!!reduced} />
        </>
      )}
    </div>
  )
}

function Kurve({
  punkte,
  farbe,
  versatz,
  reduced,
}: {
  punkte: Array<{ tag: string; kg: number }>
  farbe: string
  versatz: number
  reduced: boolean
}) {
  if (punkte.length < 2) return null

  const werte = punkte.map((p) => p.kg)
  const min = Math.min(...werte)
  const max = Math.max(...werte)
  // eine flache woche bleibt flach: ohne mindestspanne macht ein hundert-gramm-
  // tag einen bergsturz, und bei max === min wird jedes y zu NaN
  const spanne = Math.max(0.6, max - min)
  const mitte = (max + min) / 2
  const von = mitte - spanne / 2

  const x = (i: number) => 4 + (i * 92) / (punkte.length - 1)
  const y = (kg: number) => 26 - ((kg - von) / spanne) * 20

  const linie = punkte.map((p, i) => `${x(i).toFixed(1)},${y(p.kg).toFixed(1)}`).join(' ')

  return (
    <svg viewBox="0 0 100 32" className="mt-2 w-full" aria-hidden="true">
      <motion.polyline
        points={linie}
        fill="none"
        stroke={farbe}
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={reduced ? false : { pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: BERICHT.linieDauer, ease: EASE, delay: versatz }}
      />
      {punkte.map((p, i) => (
        <motion.circle
          key={p.tag}
          cx={x(i)}
          cy={y(p.kg)}
          r={1.8}
          fill={farbe}
          initial={reduced ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{
            duration: BERICHT.punktDauer,
            ease: EASE,
            delay: versatz + BERICHT.linieDauer * 0.6 + i * 0.04,
          }}
        />
      ))}
    </svg>
  )
}
