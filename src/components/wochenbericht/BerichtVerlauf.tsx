import { motion, useReducedMotion } from 'motion/react'
import { USERS } from '../../lib/types'
import type { UserId } from '../../lib/types'
import { TAGKUERZEL } from '../../lib/dates'
import { BERICHT, EASE } from '../../lib/motion'
import type { Wochenbericht } from '../../lib/wochenbericht'

type Props = { bericht: Wochenbericht; grundVersatz: number }

const LINKS = 26
const RECHTS = 306
const OBEN = 12
const UNTEN = 116

/**
 * Die Achse schnappt auf eine gerade Zahl.
 *
 * Nicht aus Schoenheit: die mittlere Marke ist die Haelfte des Maximums, und
 * bei einer ungeraden Obergrenze staende dort `2,5 Punkte` — eine Zahl, die
 * es in diesem Spiel nicht gibt.
 */
function achsenMaximum(bericht: Wochenbericht): number {
  const hoechster = Math.max(
    1,
    ...bericht.verlauf.flatMap((p) => [p.summe.erijon, p.summe.koray])
  )
  return Math.max(4, Math.ceil(hoechster / 2) * 2)
}

/**
 * Der Punktestand, Tag fuer Tag aufaddiert.
 *
 * Eine Wochensumme sagt, wer gewonnen hat. Erst der Verlauf sagt, wann — ob
 * jemand die Woche am Montag entschieden hat oder am Sonntagabend. Die Linien
 * zeichnen sich von links nach rechts, weil genau das die Aussage ist.
 *
 * In der laufenden Woche endet die Linie am heutigen Tag. Die kommenden Tage
 * sind nicht null, sie sind offen — und stehen deshalb hinter einem Schleier
 * statt als Absturz auf die Grundlinie.
 */
export function BerichtVerlauf({ bericht, grundVersatz }: Props) {
  const reduced = useReducedMotion()
  const max = achsenMaximum(bericht)
  const gezaehlt = bericht.verlauf.filter((p) => p.gezaehlt)
  const letzterIndex = gezaehlt.length - 1

  const x = (index: number) => LINKS + (index * (RECHTS - LINKS)) / 6
  const y = (wert: number) => UNTEN - (wert / max) * (UNTEN - OBEN)

  const punkteVon = (u: UserId) =>
    gezaehlt.map((p, i) => `${x(i).toFixed(1)},${y(p.summe[u]).toFixed(1)}`).join(' ')

  const marken = [0, max / 2, max]
  const beschreibung = USERS.map(
    (p) => `${p.name} ${bericht.punkte[p.id]}`
  ).join(', ')

  return (
    <figure className="m-0">
      <svg
        viewBox="0 0 320 140"
        className="w-full"
        role="img"
        aria-label={`punkteverlauf der woche, ende: ${beschreibung}`}
      >
        {marken.map((wert) => (
          <line
            key={wert}
            x1={LINKS}
            x2={RECHTS}
            y1={y(wert)}
            y2={y(wert)}
            stroke="var(--linie)"
            strokeWidth={1}
          />
        ))}
        {marken.map((wert) => (
          <text
            key={`m${wert}`}
            x={LINKS - 6}
            y={y(wert) + 3}
            textAnchor="end"
            className="tnum"
            fill="var(--kreide-52)"
            fontSize={8}
          >
            {wert}
          </text>
        ))}

        {/* der rest der laufenden woche: da ist nichts passiert, da ist noch nichts */}
        {letzterIndex < 6 && (
          <rect
            x={x(letzterIndex)}
            y={OBEN - 6}
            width={RECHTS - x(letzterIndex)}
            height={UNTEN - OBEN + 12}
            fill="var(--flaeche)"
            opacity={0.55}
          />
        )}

        {USERS.map((person, i) => (
          <motion.polyline
            key={person.id}
            points={punkteVon(person.id)}
            fill="none"
            stroke={person.farbe}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={reduced ? false : { pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{
              duration: BERICHT.linieDauer,
              ease: EASE,
              delay: grundVersatz + i * 0.08,
            }}
          />
        ))}

        {USERS.map((person, i) =>
          gezaehlt.map((punkt, index) => (
            <motion.circle
              key={`${person.id}-${punkt.tag}`}
              cx={x(index)}
              cy={y(punkt.summe[person.id])}
              r={2.6}
              fill="var(--grund)"
              stroke={person.farbe}
              strokeWidth={1.6}
              initial={reduced ? false : { opacity: 0, scale: 0.4 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{
                duration: BERICHT.punktDauer,
                ease: EASE,
                delay:
                  grundVersatz
                  + BERICHT.linieDauer * 0.55
                  + index * BERICHT.punktVersatz
                  + i * 0.04,
              }}
            />
          ))
        )}

        {TAGKUERZEL.map((kuerzel, index) => (
          <text
            key={kuerzel}
            x={x(index)}
            y={UNTEN + 18}
            textAnchor="middle"
            fill={index > letzterIndex ? 'color-mix(in srgb, var(--kreide) 28%, var(--grund))' : 'var(--kreide-52)'}
            fontSize={8}
          >
            {kuerzel}
          </text>
        ))}
      </svg>
    </figure>
  )
}
