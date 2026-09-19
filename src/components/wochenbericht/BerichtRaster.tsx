import { motion, useReducedMotion } from 'motion/react'
import { FELDER, USERS } from '../../lib/types'
import { TAGKUERZEL } from '../../lib/dates'
import { BERICHT, EASE } from '../../lib/motion'
import type { Wochenbericht } from '../../lib/wochenbericht'

type Props = { bericht: Wochenbericht; grundVersatz: number }

/**
 * Die Woche als Gitter: fuenf Felder mal sieben Tage, je Person.
 *
 * Es ist dasselbe Raster wie auf der Anzeigetafel, nur zusammengefasst — wer
 * es dort taeglich sieht, muss hier nichts Neues lernen. Gefuellt heisst: an
 * dem Tag hat das Feld gezaehlt. Die Zellen setzen diagonal auf, damit man das
 * Muster der Woche liest und nicht fuenfunddreissig Kaestchen.
 */
export function BerichtRaster({ bericht, grundVersatz }: Props) {
  const reduced = useReducedMotion()
  const offeneAb = bericht.tage.findIndex((tag) => tag > bericht.standTag)

  return (
    <div className="space-y-4">
      {USERS.map((person, personIndex) => (
        <div key={person.id}>
          <div className="flex items-baseline justify-between gap-2">
            <span className="flex items-center gap-1.5 text-[11px] text-kreide-52">
              <span className="size-2 rounded-[1px]" style={{ backgroundColor: person.farbe }} />
              {person.name}
            </span>
            <span className="tnum text-[13px] font-bold" style={{ color: person.farbe }}>
              {bericht.punkte[person.id]}
            </span>
          </div>

          <div className="mt-1.5 grid grid-cols-[2.6rem_repeat(7,1fr)] gap-x-1 gap-y-1">
            <span aria-hidden="true" />
            {TAGKUERZEL.map((kuerzel, spalte) => (
              <span
                key={kuerzel}
                aria-hidden="true"
                className={`text-center text-[9px] uppercase ${
                  offeneAb >= 0 && spalte >= offeneAb ? 'text-kreide-52/50' : 'text-kreide-52'
                }`}
              >
                {kuerzel}
              </span>
            ))}

            {FELDER.map((feld, zeile) => {
              const zeileDaten = bericht.felder.find((f) => f.feld === feld.id)!
              const gesetzt = zeileDaten.tage[person.id]
              const summe = zeileDaten.punkte[person.id]

              return (
                <div key={feld.id} className="contents">
                  <span className="truncate text-[10px] leading-4 text-kreide-52">{feld.label}</span>
                  {gesetzt.map((an, spalte) => {
                    const offen = offeneAb >= 0 && spalte >= offeneAb
                    const verzug =
                      grundVersatz + (zeile + spalte) * BERICHT.zelleVersatz + personIndex * 0.06
                    return (
                      <motion.span
                        key={`${feld.id}-${spalte}`}
                        aria-hidden="true"
                        initial={reduced ? false : { opacity: 0, scale: an ? 0.4 : 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ duration: BERICHT.zelleDauer, ease: EASE, delay: verzug }}
                        className="h-4 rounded-[2px]"
                        style={{
                          backgroundColor: an
                            ? person.farbe
                            : offen
                              ? 'var(--linie-zukunft)'
                              : 'var(--linie)',
                        }}
                      />
                    )
                  })}
                  <span className="sr-only">
                    {feld.label}: {summe} von 7 tagen
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
