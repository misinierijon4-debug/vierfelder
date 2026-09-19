import { useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { FELDER, USERS } from '../../lib/types'
import type { FeldId, UserId, Zustand } from '../../lib/types'
import { TAGKUERZEL, fromKey } from '../../lib/dates'
import { BERICHT, EASE } from '../../lib/motion'
import type { Wochenbericht } from '../../lib/wochenbericht'
import { tageseinheiten } from '../../lib/tracker'

type Props = { bericht: Wochenbericht; grundVersatz: number; zustand?: Zustand }

/**
 * Die Woche als Gitter: fuenf Felder mal sieben Tage, je Person.
 *
 * Es ist dasselbe Raster wie auf der Anzeigetafel, nur zusammengefasst — wer
 * es dort taeglich sieht, muss hier nichts Neues lernen. Gefuellt heisst: an
 * dem Tag hat das Feld gezaehlt. Die Zellen setzen diagonal auf, damit man das
 * Muster der Woche liest und nicht fuenfunddreissig Kaestchen.
 */
export function BerichtRaster({ bericht, grundVersatz, zustand }: Props) {
  const reduced = useReducedMotion()
  const offeneAb = bericht.tage.findIndex((tag) => tag > bericht.standTag)
  const [ausgewaehlt, setAusgewaehlt] = useState<{
    personId: UserId
    feldId: FeldId
    spalte: number
  } | null>(null)

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
                    const istGewaehlt =
                      ausgewaehlt?.personId === person.id &&
                      ausgewaehlt?.feldId === feld.id &&
                      ausgewaehlt?.spalte === spalte
                    const kuerzel = TAGKUERZEL[spalte]
                    return (
                      <motion.button
                        key={`${feld.id}-${spalte}`}
                        type="button"
                        initial={reduced ? false : { opacity: 0, scale: an ? 0.4 : 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ duration: BERICHT.zelleDauer, ease: EASE, delay: verzug }}
                        onClick={() => {
                          if (istGewaehlt) setAusgewaehlt(null)
                          else setAusgewaehlt({ personId: person.id, feldId: feld.id, spalte })
                        }}
                        className={`h-4 rounded-[2px] transition-transform active:scale-95 focus-visible:outline-none ${
                          istGewaehlt ? 'ring-1 ring-white/80 ring-offset-1 ring-offset-grund' : ''
                        }`}
                        style={{
                          backgroundColor: an
                            ? person.farbe
                            : offen
                              ? 'var(--linie-zukunft)'
                              : 'var(--linie)',
                        }}
                        aria-label={`${person.name}, ${feld.label} am ${kuerzel}: ${
                          an ? 'gezählt' : 'nicht gezählt'
                        }`}
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

          {ausgewaehlt && ausgewaehlt.personId === person.id && (() => {
            const spalte = ausgewaehlt.spalte
            const tag = bericht.tage[spalte]
            const tagDatum = fromKey(tag)
            const feldObj = FELDER.find((f) => f.id === ausgewaehlt.feldId)!
            const monatName = tagDatum.toLocaleDateString('de-DE', { month: 'short' })
            const kuerzel = TAGKUERZEL[spalte]
            let detail = ''
            if (ausgewaehlt.feldId === 'gewicht') {
              const kg = zustand?.gewichte[`${person.id}|${tag}`]
              detail = kg ? `${kg} kg gewogen` : 'kein Gewicht eingetragen'
            } else if (zustand) {
              const einheiten = tageseinheiten(zustand, person.id, ausgewaehlt.feldId, tag)
              if (einheiten.length > 0) {
                detail = einheiten
                  .map((e) =>
                    e.herkunft === 'gemessen'
                      ? `${e.wert} min (${e.ort ?? feldObj.label})`
                      : e.wert
                        ? `${e.wert} ${e.einheit}`
                        : 'erfasst'
                  )
                  .join(', ')
              } else {
                detail = 'keine Einheit eingetragen'
              }
            } else {
              detail = 'Details verfügbar'
            }

            return (
              <motion.div
                initial={{ opacity: 0, y: -2 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-2 flex items-center justify-between rounded-[2px] border border-linie bg-flaeche px-2.5 py-1.5 text-[11px]"
              >
                <span className="truncate">
                  <strong className="font-medium text-kreide">
                    {kuerzel}, {tagDatum.getDate()}. {monatName}
                  </strong>
                  <span className="text-kreide-52"> · {feldObj.label}: </span>
                  <span style={{ color: person.farbe }}>{detail}</span>
                </span>
                <button
                  type="button"
                  onClick={() => setAusgewaehlt(null)}
                  className="ml-2 shrink-0 text-[10px] text-kreide-52 hover:text-kreide"
                >
                  schließen
                </button>
              </motion.div>
            )
          })()}
        </div>
      ))}
    </div>
  )
}
