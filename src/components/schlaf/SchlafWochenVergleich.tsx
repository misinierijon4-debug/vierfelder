import type { ReactNode } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { CalendarBlank } from '@phosphor-icons/react'
import { TAGKUERZEL } from '../../lib/dates'
import { USERS } from '../../lib/types'
import type { Schlafnacht, UserId } from '../../lib/types'
import { abendDatum, formatDauer, formatStunden } from '../../lib/schlafPhasen'
import { EASE } from '../../lib/motion'

type Props = {
  naechte: Schlafnacht[]
  registrierte: ReadonlySet<UserId>
  woche: string[]
  titel?: string
  gewaehlterTag: string
  /** dein persönliches schlafziel in minuten, aus dem kurzbefehl */
  zielMinuten: number
  /** in welche richtung die zuletzt gewechselte woche hereinkommt: −1 zurück, 1 vor */
  richtung: number
  /** vorwaerts ist am rand der zeitleiste zu ende: die laufende woche ist die letzte */
  kannVor: boolean
  onTagWaehlen: (tag: string) => void
  onWocheWechseln: (richtung: -1 | 1) => void
  onKalenderOeffnen: () => void
}

/** ab hier gilt der zug als wochenwechsel und nicht als verrutschter tipp */
const SCHWELLE = 56
const SCHWUNG = 320

/** aeltere wochen liegen links, neuere rechts — die neue schiebt sich von dort herein */
const VARIANTEN = {
  rein: (richtung: number) => ({ x: richtung > 0 ? '100%' : '-100%', opacity: 0 }),
  da: { x: 0, opacity: 1 },
  raus: (richtung: number) => ({ x: richtung > 0 ? '-100%' : '100%', opacity: 0 }),
}

export function SchlafWochenVergleich({
  naechte,
  registrierte,
  woche,
  titel = 'diese woche',
  gewaehlterTag,
  zielMinuten,
  richtung,
  kannVor,
  onTagWaehlen,
  onWocheWechseln,
  onKalenderOeffnen,
}: Props) {
  const reduced = useReducedMotion()
  const nachUser = new Map<UserId, Map<string, Schlafnacht>>()
  for (const user of USERS) nachUser.set(user.id, new Map())
  for (const nacht of naechte) nachUser.get(nacht.user)?.set(abendDatum(nacht.einschlafzeit), nacht)

  const schnitte = USERS.map((user) => {
    const userNaechte = woche
      .map((tag) => nachUser.get(user.id)?.get(tag))
      .filter((nacht): nacht is Schlafnacht => Boolean(nacht && nacht.schlafMinuten > 0))
    const summe = userNaechte.reduce((acc, nacht) => acc + nacht.schlafMinuten, 0)
    return {
      user,
      schnitt: userNaechte.length > 0 ? summe / userNaechte.length : 0,
      anzahl: userNaechte.length,
    }
  })

  const maxMinuten = Math.max(10 * 60, Math.ceil((zielMinuten + 60) / 60) * 60)

  const inhalt: ReactNode = (
    <>
      <div className="grid grid-cols-2 divide-x divide-linie">
        {schnitte.map(({ user, schnitt, anzahl }) => (
          <div key={user.id} className="min-w-0 px-3 py-2.5">
            <div className="flex items-center gap-1.5 text-[11px]">
              <span className="size-2 rounded-[1px]" style={{ backgroundColor: user.farbe }} />
              <span className="truncate text-kreide-52">{user.name}</span>
            </div>
            {!registrierte.has(user.id) ? (
              <p className="mt-1 text-[11px] text-kreide-52">noch nicht verbunden</p>
            ) : anzahl > 0 ? (
              <div className="mt-1 flex items-baseline justify-between gap-2">
                <span className="tnum truncate text-[17px] font-bold text-kreide">
                  {formatDauer(schnitt)}
                </span>
                <span className="shrink-0 text-[10px] text-kreide-52">
                  ø aus {anzahl} {anzahl === 1 ? 'nacht' : 'nächten'}
                </span>
              </div>
            ) : (
              <p className="mt-1 text-[11px] text-kreide-52">diese woche noch leer</p>
            )}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 border-t border-linie">
        {woche.map((tag, idx) => {
          const istGewaehlt = tag === gewaehlterTag
          const erijonMin = nachUser.get('erijon')?.get(tag)?.schlafMinuten ?? 0
          const korayMin = nachUser.get('koray')?.get(tag)?.schlafMinuten ?? 0
          const hatDaten = erijonMin > 0 || korayMin > 0
          const erijonHoehe = Math.min(100, (erijonMin / maxMinuten) * 100)
          const korayHoehe = Math.min(100, (korayMin / maxMinuten) * 100)

          return (
            <button
              key={tag}
              type="button"
              aria-pressed={istGewaehlt}
              aria-label={`${TAGKUERZEL[idx]}, ${hatDaten ? 'Schlafdaten anzeigen' : 'keine Schlafdaten'}`}
              onClick={() => onTagWaehlen(tag)}
              className={`relative min-w-0 px-0.5 pb-2 pt-2.5 transition-colors duration-150 focus-visible:z-10 focus-visible:outline-none ${
                istGewaehlt ? 'bg-grund/70' : 'hover:bg-grund/35'
              }`}
            >
              <span className={`text-[10px] font-bold uppercase ${istGewaehlt ? 'text-kreide' : 'text-kreide-52'}`}>
                {TAGKUERZEL[idx]}
              </span>

              <div className="relative mx-auto my-2.5 flex h-16 w-full items-end justify-center gap-1">
                <span
                  className="pointer-events-none absolute inset-x-0 border-t border-dashed border-linie-hell/50"
                  style={{ bottom: `${(zielMinuten / maxMinuten) * 100}%` }}
                  aria-hidden="true"
                />
                <div className="flex h-full w-2 flex-col justify-end overflow-hidden bg-grund">
                  {erijonMin > 0 && (
                    <motion.span
                      initial={{ scaleY: 0 }}
                      animate={{ scaleY: 1 }}
                      transition={{ duration: 0.18 }}
                      className="block w-full origin-bottom"
                      style={{ height: `${Math.max(6, erijonHoehe)}%`, backgroundColor: 'var(--erijon)' }}
                    />
                  )}
                </div>
                <div className="flex h-full w-2 flex-col justify-end overflow-hidden bg-grund">
                  {korayMin > 0 && (
                    <motion.span
                      initial={{ scaleY: 0 }}
                      animate={{ scaleY: 1 }}
                      transition={{ duration: 0.18 }}
                      className="block w-full origin-bottom"
                      style={{ height: `${Math.max(6, korayHoehe)}%`, backgroundColor: 'var(--koray)' }}
                    />
                  )}
                </div>
              </div>

              <div className="flex h-7 flex-col items-center justify-center text-[11px] font-semibold leading-[13px]">
                {erijonMin > 0 && (
                  <span className="tnum" style={{ color: 'var(--erijon)' }}>
                    {formatStunden(erijonMin)}
                  </span>
                )}
                {korayMin > 0 && (
                  <span className="tnum" style={{ color: 'var(--koray)' }}>
                    {formatStunden(korayMin)}
                  </span>
                )}
                {!hatDaten && <span className="text-kreide-52">—</span>}
              </div>

              {istGewaehlt && (
                <span className="absolute inset-x-2 bottom-0 h-0.5 bg-kreide" aria-hidden="true" />
              )}
            </button>
          )
        })}
      </div>
    </>
  )

  /** der zug nach rechts holt die aeltere woche, der nach links die neuere */
  const wechsleWennWeitGenug = (weg: number, tempo: number) => {
    if (Math.abs(weg) < SCHWELLE && Math.abs(tempo) < SCHWUNG) return
    const ziel = weg > 0 ? -1 : 1
    if (ziel === 1 && !kannVor) return
    onWocheWechseln(ziel)
  }

  return (
    <section aria-labelledby="schlaf-wochenuebersicht" className="mt-2">
      <div className="mb-2.5 flex items-end justify-between gap-3">
        <h2
          id="schlaf-wochenuebersicht"
          aria-live="polite"
          className="min-w-0 truncate text-[12px] font-semibold text-kreide"
        >
          {titel}
        </h2>
        <div className="flex shrink-0 items-center gap-2 text-[10px] text-kreide-52">
          <span className="block w-4 border-t border-dashed border-linie-hell" aria-hidden="true" />
          <span>{formatDauer(zielMinuten)} ziel</span>
          {/* kleines symbol, volle trefferflaeche: die kopfzeile bleibt so hoch, wie sie war */}
          <button
            type="button"
            aria-label="Schlafkalender öffnen"
            aria-haspopup="dialog"
            onClick={onKalenderOeffnen}
            className="-my-3.5 flex size-11 shrink-0 items-center justify-center rounded-full border border-linie bg-flaeche text-kreide transition-colors duration-150 hover:border-linie-hell focus-visible:outline-none"
          >
            <CalendarBlank size={15} weight="bold" aria-hidden="true" />
          </button>
        </div>
      </div>

      {/*
        die wochenuebersicht liegt auf einer zeitleiste: wischen verschiebt sie
        um sieben tage. pfeiltasten tun dasselbe, damit es auch ohne finger geht.
      */}
      <div
        role="group"
        tabIndex={0}
        aria-label="wochenübersicht, mit den pfeiltasten links und rechts die woche wechseln"
        onKeyDown={(e) => {
          if (e.key === 'ArrowLeft') onWocheWechseln(-1)
          else if (e.key === 'ArrowRight' && kannVor) onWocheWechseln(1)
          else return
          e.preventDefault()
        }}
        className="relative overflow-hidden rounded-[2px] border border-linie bg-flaeche focus-visible:outline-none"
      >
        {reduced ? (
          inhalt
        ) : (
          <AnimatePresence initial={false} mode="popLayout" custom={richtung}>
            <motion.div
              key={woche[0]}
              custom={richtung}
              variants={VARIANTEN}
              initial="rein"
              animate="da"
              exit="raus"
              transition={{ duration: 0.24, ease: EASE }}
              drag="x"
              dragDirectionLock
              dragMomentum={false}
              dragElastic={0.14}
              dragConstraints={{ left: 0, right: 0 }}
              onDragEnd={(_, info) => wechsleWennWeitGenug(info.offset.x, info.velocity.x)}
              className="touch-pan-y"
            >
              {inhalt}
            </motion.div>
          </AnimatePresence>
        )}
      </div>
    </section>
  )
}
