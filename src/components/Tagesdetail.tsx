import { useEffect, useRef } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { X } from '@phosphor-icons/react'
import { area as areaDef, gewichtKey, user as userDef } from '../lib/types'
import type { FeldId, UserId, Zustand } from '../lib/types'
import { fromKey, langesDatum } from '../lib/dates'
import { tageseinheiten } from '../lib/tracker'
import { EASE } from '../lib/motion'

const UHRZEIT = new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit' })
const KURZDATUM = new Intl.DateTimeFormat('de-DE', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
})

export type Tagesauswahl = { user: UserId; area: FeldId; tag: string }

type Props = {
  zustand: Zustand
  auswahl: Tagesauswahl
  heute: string
  onSchliessen: () => void
}

function uhrzeit(zeitpunkt: string | null): string | null {
  if (!zeitpunkt) return null
  const d = new Date(zeitpunkt)
  return Number.isFinite(d.getTime()) ? UHRZEIT.format(d) : null
}

/**
 * was an einem tag wirklich passiert ist: jede durchführung einzeln, mit ihrer
 * dauer und ihrer uhrzeit. das fenster zeigt nur an — auch für heute.
 * eingetragen wird oben in der bereichszeile, damit es keine zweite, halb
 * andere eingabemaske gibt.
 */
export function Tagesdetail({ zustand, auswahl, heute, onSchliessen }: Props) {
  const reduced = useReducedMotion()
  const schliessen = useRef<HTMLButtonElement>(null)
  const person = userDef(auswahl.user)
  const feld = auswahl.area
  const bereich = feld === 'gewicht' ? null : areaDef(feld)
  const istGewicht = bereich === null
  const label = bereich?.label ?? 'gewicht'
  const einheit = bereich?.unit ?? 'kg'

  const liste = tageseinheiten(zustand, auswahl.user, auswahl.area, auswahl.tag)
  const gesamt = liste.reduce((s, e) => (e.einheit === einheit ? s + (e.wert ?? 0) : s), 0)
  /**
   * beim lesen misst der fokus minuten, gezählt werden aber seiten. die dauer
   * steht deshalb neben der summe und nicht darin — addiert ergäbe sie eine
   * zahl, die nichts bedeutet.
   */
  const dauer = liste.reduce((s, e) => (e.einheit === einheit ? s : s + (e.wert ?? 0)), 0)
  const ohneWert = liste.some((e) => e.wert === null)
  const kg = istGewicht ? zustand.gewichte[gewichtKey(auswahl.user, auswahl.tag)] : undefined

  const datum = fromKey(auswahl.tag)
  const vergangen = auswahl.tag < heute

  useEffect(() => {
    schliessen.current?.focus()
    const aufTaste = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onSchliessen()
    }
    document.addEventListener('keydown', aufTaste)
    return () => document.removeEventListener('keydown', aufTaste)
  }, [onSchliessen])

  return (
    <motion.div
      key="tagesdetail"
      initial={reduced ? { opacity: 0 } : { opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: reduced ? 0 : 0.16, ease: EASE }}
      className="fixed inset-0 z-50 flex items-end justify-center"
    >
      {/* der hintergrund schließt: auf dem telefon ist er die größte fläche */}
      <button
        type="button"
        aria-label="tagesansicht schließen"
        onClick={onSchliessen}
        className="absolute inset-0 block bg-black/55"
      />

      <motion.section
        role="dialog"
        aria-modal="true"
        aria-labelledby="tagesdetail-titel"
        initial={reduced ? false : { y: 18 }}
        animate={{ y: 0 }}
        exit={reduced ? undefined : { y: 18 }}
        transition={{ duration: reduced ? 0 : 0.18, ease: EASE }}
        className="relative w-full max-w-[420px] rounded-t-[6px] border-t border-linie-hell bg-grund px-5 pt-4 pb-[calc(env(safe-area-inset-bottom)+20px)]"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-[11px] text-kreide-52">
              <span className="block h-2 w-3 rounded-[1px]" style={{ background: person.farbe }} />
              {person.name}
            </p>
            <h2
              id="tagesdetail-titel"
              className="display mt-1 truncate text-[22px] font-semibold lowercase leading-none"
            >
              {label}
            </h2>
            <p className="mt-1.5 text-[11px] text-kreide-52">
              {langesDatum(datum)} · <span className="tnum">{KURZDATUM.format(datum)}</span>
            </p>
          </div>

          <button
            ref={schliessen}
            type="button"
            onClick={onSchliessen}
            aria-label="tagesansicht schließen"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[2px] border border-linie text-kreide-60"
          >
            <X size={14} weight="bold" />
          </button>
        </div>

        <div className="mt-4 border-t border-linie pt-3">
          {istGewicht ? (
            <p className="text-[13px] text-kreide-60">
              {kg === undefined ? (
                'nicht gewogen'
              ) : (
                <>
                  <span className="tnum text-[22px] font-bold text-kreide">
                    {kg.toFixed(1).replace('.', ',')}
                  </span>{' '}
                  kg
                </>
              )}
            </p>
          ) : liste.length === 0 ? (
            <p className="text-[13px] text-kreide-52">nichts eingetragen</p>
          ) : (
            <>
              <p className="flex items-baseline gap-1.5 text-[12px] text-kreide-52">
                <span className="tnum text-[15px] font-semibold text-kreide">{liste.length}</span>
                {liste.length === 1 ? 'einheit' : 'einheiten'}
                {gesamt > 0 && (
                  <>
                    <span aria-hidden>·</span>
                    <span className="tnum text-[15px] font-semibold text-kreide">{gesamt}</span>
                    {einheit} gesamt
                  </>
                )}
                {dauer > 0 && (
                  <>
                    <span aria-hidden>·</span>
                    <span className="tnum text-[15px] font-semibold text-kreide">{dauer}</span>
                    min gemessen
                  </>
                )}
              </p>

              <ul className="mt-3 divide-y divide-linie border-t border-linie">
                {liste.map((e, i) => {
                  const zeit = uhrzeit(e.erfasst)
                  return (
                    <li key={e.id} className="flex items-baseline justify-between gap-3 py-2.5">
                      <span className="flex min-w-0 items-baseline gap-2">
                        <span className="tnum text-[11px] text-kreide-52">{i + 1}.</span>
                        <span className="truncate text-[12px] text-kreide-60">
                          {zeit ? `${zeit} uhr` : 'ohne uhrzeit'}
                          {e.herkunft === 'gemessen' && e.ort ? ` · ${e.ort}` : ''}
                        </span>
                      </span>
                      <span className="flex shrink-0 items-baseline gap-1.5">
                        {e.wert === null ? (
                          <span className="text-[12px] text-kreide-52">ohne wert</span>
                        ) : (
                          <>
                            <span className="tnum text-[14px] font-semibold text-kreide">
                              {e.wert}
                            </span>
                            <span className="text-[12px] text-kreide-52">{e.einheit}</span>
                          </>
                        )}
                        <span className="w-[52px] text-right text-[10px] text-kreide-52">
                          {e.herkunft}
                        </span>
                      </span>
                    </li>
                  )
                })}
              </ul>

              {ohneWert && (
                <p className="mt-2.5 text-[10px] text-kreide-52">
                  für einheiten ohne wert wurde nie eine dauer erfasst. nachgetragen wird nichts.
                </p>
              )}
            </>
          )}
        </div>

        <p className="mt-4 border-t border-linie pt-3 text-[10px] text-kreide-52">
          {vergangen
            ? 'vergangene tage lassen sich nicht mehr ändern.'
            : 'heute änderst du oben in der zeile.'}
        </p>
      </motion.section>
    </motion.div>
  )
}
