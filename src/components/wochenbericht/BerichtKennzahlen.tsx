import { motion, useReducedMotion } from 'motion/react'
import { USERS } from '../../lib/types'
import type { UserId } from '../../lib/types'
import { BERICHT, EASE } from '../../lib/motion'
import { alsDauer, ermittleHighlight } from '../../lib/wochenbericht'
import type { Wochenbericht } from '../../lib/wochenbericht'
import { BerichtTrendPfeil } from './BerichtTrendPfeil'

type Props = { bericht: Wochenbericht; grundVersatz: number }

type Zeile = {
  id: string
  wort: string
  wert: (u: UserId) => string
  delta: (u: UserId) => number | null
  einheit?: '' | 'm'
}

/**
 * Die vier Zahlen der Woche, fuer beide nebeneinander.
 *
 * Nicht "deine Woche" mit dem anderen als Fussnote: es ist ein Duell zu
 * zweit, und zwei Spalten sagen das, ohne dass irgendwo "du" stehen muss. Der
 * Pfeil daneben vergleicht jede Person mit ihrer eigenen Vorwoche — nicht
 * miteinander, das steht schon im Punktestand darueber.
 */
export function BerichtKennzahlen({ bericht, grundVersatz }: Props) {
  const reduced = useReducedMotion()

  const zeilen: Zeile[] = [
    {
      id: 'punkte',
      wort: 'tagespunkte',
      wert: (u) => String(bericht.punkte[u]),
      delta: (u) => bericht.punkte[u] - bericht.vorwoche.punkte[u],
    },
    {
      id: 'punkttage',
      wort: 'punkt-tage',
      wert: (u) => `${bericht.punktTage[u]}/7`,
      delta: (u) => bericht.punktTage[u] - bericht.vorwoche.punktTage[u],
    },
    {
      id: 'schlaf',
      wort: 'schlaf ø',
      wert: (u) => alsDauer(bericht.schlaf.person[u].minuten.wert),
      delta: (u) => bericht.schlaf.person[u].minuten.delta,
      einheit: 'm',
    },
    {
      id: 'qualitaet',
      wort: 'qualität ø',
      wert: (u) => {
        const wert = bericht.schlaf.person[u].wert.wert
        return wert === null ? '—' : String(Math.round(wert))
      },
      delta: (u) => bericht.schlaf.person[u].wert.delta,
    },
  ]

  return (
    <div className="border-t border-linie">
      <div className="grid grid-cols-[5.4rem_1fr_1fr] gap-2 py-2">
        <span aria-hidden="true" />
        {USERS.map((person) => (
          <span key={person.id} className="flex items-center gap-1.5 text-[10px] text-kreide-52">
            <span className="size-2 rounded-[1px]" style={{ backgroundColor: person.farbe }} />
            <span className="truncate">{person.name}</span>
          </span>
        ))}
      </div>

      {zeilen.map((zeile, index) => (
        <motion.div
          key={zeile.id}
          initial={reduced ? false : { opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{
            duration: BERICHT.abschnittDauer,
            ease: EASE,
            delay: grundVersatz + index * 0.045,
          }}
          className="grid grid-cols-[5.4rem_1fr_1fr] items-baseline gap-2 border-t border-linie py-2"
        >
          <span className="text-[10px] uppercase tracking-wide text-kreide-52">{zeile.wort}</span>
          {USERS.map((person) => (
            <span key={person.id} className="flex min-w-0 items-baseline gap-1.5">
              <b className="tnum text-[17px] font-bold leading-none text-kreide">
                {zeile.wert(person.id)}
              </b>
              <BerichtTrendPfeil delta={zeile.delta(person.id)} einheit={zeile.einheit ?? ''} />
            </span>
          ))}
        </motion.div>
      ))}

      <p className="border-t border-linie py-2 text-[10px] text-kreide-52">
        pfeile: jede person gegen ihre eigene vorwoche
      </p>

      <div className="grid grid-cols-2 gap-3 border-t border-linie pt-2 pb-1 text-[11px] leading-tight">
        {USERS.map((person) => {
          const highlight = ermittleHighlight(bericht, person.id)
          return (
            <div key={person.id} className="min-w-0">
              <span
                className="block truncate text-[10px] font-semibold uppercase tracking-wider"
                style={{ color: person.farbe }}
              >
                {person.name}: {highlight.titel}
              </span>
              <span className="mt-0.5 block text-[11px] text-kreide-52">{highlight.text}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
