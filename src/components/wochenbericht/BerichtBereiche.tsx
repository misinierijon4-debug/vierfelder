import { motion, useReducedMotion } from 'motion/react'
import { FELDER, USERS } from '../../lib/types'
import { BERICHT, EASE } from '../../lib/motion'
import type { BerichtFeldzeile, Wochenbericht } from '../../lib/wochenbericht'

type Props = { bericht: Wochenbericht; grundVersatz: number }

function feldLabel(zeile: BerichtFeldzeile): string {
  return FELDER.find((f) => f.id === zeile.feld)?.label ?? zeile.feld
}

/**
 * Die Menge hinter den Punkten.
 *
 * Ein Punkt sagt nur, dass etwas stattgefunden hat. Drei Boxeinheiten koennen
 * neunzig oder dreihundert Minuten sein, und das ist nicht dasselbe. Beim
 * Lesen stehen Seiten, weil dort Seiten gezaehlt werden; gemessene
 * Fokusminuten kaemen aus einer anderen Einheit und stehen deshalb nicht
 * daneben addiert.
 */
function menge(zeile: BerichtFeldzeile, user: 'erijon' | 'koray'): string | null {
  if (zeile.feld === 'gewicht') return null
  if (zeile.seiten) {
    const seiten = zeile.seiten[user]
    return seiten > 0 ? `${seiten} s.` : null
  }
  const minuten = zeile.minuten[user]
  return minuten > 0 ? `${minuten} min` : null
}

/**
 * Punkte je Feld, das Staerkste zuerst.
 *
 * Zwei Balken uebereinander statt nebeneinander: so steht derselbe Nullpunkt
 * links, und der Vergleich ist eine Laenge und kein Suchbild.
 */
export function BerichtBereiche({ bericht, grundVersatz }: Props) {
  const reduced = useReducedMotion()

  return (
    <ul className="space-y-3">
      {bericht.felder.map((zeile, index) => (
        <li key={zeile.feld}>
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-[12px] text-kreide">{feldLabel(zeile)}</span>
            <span className="tnum shrink-0 text-[11px] text-kreide-52">
              <span style={{ color: 'var(--erijon)' }}>{zeile.punkte.erijon}</span>
              <span className="px-1 text-kreide-52">:</span>
              <span style={{ color: 'var(--koray)' }}>{zeile.punkte.koray}</span>
            </span>
          </div>

          <div className="mt-1 space-y-1">
            {USERS.map((person, i) => {
              const punkte = zeile.punkte[person.id]
              const text = menge(zeile, person.id)
              return (
                <div key={person.id} className="flex items-center gap-2">
                  <span className="relative h-2 flex-1 overflow-hidden rounded-[2px] bg-linie">
                    <motion.span
                      aria-hidden="true"
                      className="absolute inset-y-0 left-0 block origin-left rounded-[2px]"
                      style={{ backgroundColor: person.farbe, width: `${(punkte / 7) * 100}%` }}
                      initial={reduced ? false : { scaleX: 0 }}
                      animate={{ scaleX: 1 }}
                      transition={{
                        duration: BERICHT.balkenDauer,
                        ease: EASE,
                        delay: grundVersatz + index * BERICHT.balkenVersatz + i * 0.03,
                      }}
                    />
                  </span>
                  <span className="tnum w-14 shrink-0 text-right text-[10px] text-kreide-52">
                    {text ?? ''}
                  </span>
                </div>
              )
            })}
          </div>

          <span className="sr-only">
            {feldLabel(zeile)}: erijon {zeile.punkte.erijon} punkte, koray {zeile.punkte.koray} punkte
          </span>
        </li>
      ))}
    </ul>
  )
}
