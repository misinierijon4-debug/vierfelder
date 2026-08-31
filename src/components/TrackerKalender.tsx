import { useEffect, useMemo, useRef } from 'react'
import { X } from '@phosphor-icons/react'
import { FELDER, user as userDef } from '../lib/types'
import type { UserId, Zustand } from '../lib/types'
import { TAGKUERZEL, fromKey } from '../lib/dates'
import { kalenderMonate } from '../lib/kalender'
import { erledigteFelder, tageMitDaten } from '../lib/tracker'

const MONAT = new Intl.DateTimeFormat('de-DE', { month: 'long' })
const DATUM = new Intl.DateTimeFormat('de-DE', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
})

type Props = {
  offen: boolean
  zustand: Zustand
  me: UserId
  gewaehlterTag: string
  heuteKey: string
  onTagWaehlen: (tag: string) => void
  onSchliessen: () => void
}

/**
 * die historie der gewohnheiten, nach dem muster des schlafkalenders: derselbe
 * vollbild-dialog, dieselbe monatsliste, dieselbe bedienung. der ring zeigt,
 * wie viele der fünf felder an dem tag standen — die woche bleibt die schnelle
 * navigation, der kalender ist nur der weg zurück.
 */
export function TrackerKalender({
  offen,
  zustand,
  me,
  gewaehlterTag,
  heuteKey,
  onTagWaehlen,
  onSchliessen,
}: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const person = userDef(me)

  const monate = useMemo(
    () => kalenderMonate(tageMitDaten(zustand, me), heuteKey, gewaehlterTag),
    [gewaehlterTag, heuteKey, me, zustand]
  )

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return

    if (offen && !dialog.open) dialog.showModal()
    if (!offen && dialog.open) dialog.close()
  }, [offen])

  useEffect(() => {
    if (!offen) return

    const vorher = document.documentElement.style.overflow
    document.documentElement.style.overflow = 'hidden'
    const frame = window.requestAnimationFrame(() => {
      const monat = scrollRef.current?.querySelector<HTMLElement>(
        `[data-monat="${gewaehlterTag.slice(0, 7)}"]`
      )
      monat?.scrollIntoView({ block: 'center' })
    })

    return () => {
      window.cancelAnimationFrame(frame)
      document.documentElement.style.overflow = vorher
    }
  }, [gewaehlterTag, offen])

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="tracker-kalender-titel"
      onClose={onSchliessen}
      className="m-0 size-full max-h-none max-w-none overflow-hidden bg-grund p-0 text-kreide backdrop:bg-grund"
    >
      <div className="flex h-dvh flex-col bg-grund">
        <header
          className="grid shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-3 border-b border-linie px-5 pb-3"
          style={{ paddingTop: 'calc(env(safe-area-inset-top) + 0.75rem)' }}
        >
          <button
            type="button"
            aria-label="Kalender schließen"
            onClick={onSchliessen}
            className="flex size-11 items-center justify-center rounded-full border border-linie bg-flaeche text-kreide transition-colors duration-150 hover:border-linie-hell focus-visible:outline-none"
          >
            <X size={20} weight="bold" aria-hidden="true" />
          </button>

          <h2 id="tracker-kalender-titel" className="text-balance text-[16px] font-bold text-kreide">
            kalender
          </h2>

          <div className="flex min-w-0 items-center justify-end gap-1.5 text-[11px] text-kreide-52">
            <span className="size-2 shrink-0 rounded-[1px]" style={{ backgroundColor: person.farbe }} />
            <span className="truncate">{person.name}</span>
          </div>
        </header>

        <div
          ref={scrollRef}
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pt-4"
          style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 1.5rem)' }}
        >
          <div className="mx-auto w-full max-w-[420px]">
            <div className="sticky top-0 z-10 grid grid-cols-7 border-b border-linie bg-grund pb-2 pt-1">
              {TAGKUERZEL.map((tag) => (
                <span
                  key={tag}
                  className="text-center text-[10px] font-semibold uppercase text-kreide-52"
                >
                  {tag}
                </span>
              ))}
            </div>

            <div className="space-y-7 pt-5">
              {monate.map((monat) => (
                <section key={monat.key} data-monat={monat.key} aria-labelledby={`monat-${monat.key}`}>
                  <h3
                    id={`monat-${monat.key}`}
                    className="text-balance text-[22px] font-bold text-kreide"
                  >
                    {MONAT.format(new Date(monat.jahr, monat.monat, 1)).toLowerCase()}
                    {monat.jahr !== fromKey(heuteKey).getFullYear() && (
                      <span className="ml-2 text-[13px] font-medium text-kreide-52">{monat.jahr}</span>
                    )}
                  </h3>

                  <div className="mt-3 grid grid-cols-7">
                    {monat.tage.map((tag, index) => {
                      if (!tag) return <span key={`${monat.key}-leer-${index}`} aria-hidden="true" />

                      const datum = fromKey(tag)
                      const istGewaehlt = tag === gewaehlterTag
                      const istHeute = tag === heuteKey
                      const istZukunft = tag > heuteKey
                      const erledigt = istZukunft ? 0 : erledigteFelder(zustand, me, tag)
                      const grad = (erledigt / FELDER.length) * 360
                      const ring =
                        erledigt === 0
                          ? 'var(--linie)'
                          : `conic-gradient(from -90deg, ${person.farbe} 0deg ${grad}deg, var(--linie) ${grad}deg 360deg)`
                      const status =
                        erledigt === 0
                          ? 'nichts eingetragen'
                          : `${erledigt} von ${FELDER.length} feldern`

                      return (
                        <button
                          key={tag}
                          type="button"
                          disabled={istZukunft}
                          aria-current={istHeute ? 'date' : undefined}
                          aria-pressed={istGewaehlt}
                          aria-label={`${DATUM.format(datum)}, ${status}`}
                          onClick={() => onTagWaehlen(tag)}
                          className={`flex min-h-[72px] min-w-0 flex-col items-center justify-start rounded-[2px] pt-1 focus-visible:outline-none ${
                            istZukunft ? 'cursor-default opacity-25' : 'hover:bg-flaeche/60'
                          }`}
                        >
                          <span className="tnum text-[11px] font-semibold text-kreide">
                            {datum.getDate()}
                          </span>
                          <span
                            aria-hidden="true"
                            className="relative mt-1 size-9 rounded-full min-[360px]:size-10"
                            style={{
                              background: ring,
                              boxShadow: istGewaehlt ? '0 0 0 2px var(--kreide)' : undefined,
                            }}
                          >
                            {/* die zahl in der mitte, weil fünf felder ein
                                abzählbarer stand sind und kein prozentwert */}
                            <span className="absolute inset-1 flex items-center justify-center rounded-full bg-grund">
                              {erledigt > 0 && (
                                <span className="tnum text-[11px] font-semibold text-kreide-60">
                                  {erledigt}
                                </span>
                              )}
                            </span>
                          </span>
                          <span
                            aria-hidden="true"
                            className={`mt-1 size-1 rounded-full ${istHeute ? 'bg-kreide' : 'bg-transparent'}`}
                          />
                        </button>
                      )
                    })}
                  </div>
                </section>
              ))}
            </div>
          </div>
        </div>
      </div>
    </dialog>
  )
}
