import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { Trophy } from '@phosphor-icons/react'
import { other, user as userDef } from '../lib/types'
import type { UserId, Zustand } from '../lib/types'
import { isoWeek, langesDatum } from '../lib/dates'
import { bilanz, wocheGesamt } from '../lib/tracker'
import { belegQuote, berechneDuell, entscheideDuell } from '../lib/duell'
import { EASE_WEICH } from '../lib/motion'
import { Zahl } from './Zahl'

type Props = {
  heute: Date
  woche: string[]
  zustand: Zustand
  me: UserId
  bilanzzeit: boolean
}

export function Kopf({ heute, woche, zustand, me, bilanzzeit }: Props) {
  const reduced = useReducedMotion()
  const kw = isoWeek(heute)
  const heuteKey = woche[heute.getDay() === 0 ? 6 : heute.getDay() - 1] ?? ''
  const match = berechneDuell(zustand, woche, heuteKey, me)
  const ich = userDef(me)
  const er = other(me)

  return (
    <header className="pb-3">
      <AnimatePresence mode="wait" initial={false}>
        {bilanzzeit ? (
          <motion.div
            key="bilanz"
            initial={reduced ? false : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: reduced ? 0 : 0.26, ease: EASE_WEICH }}
          >
            <Bilanz heute={heute} woche={woche} zustand={zustand} me={me} kw={kw} />
          </motion.div>
        ) : (
          <motion.div
            key="stand"
            initial={reduced ? false : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: reduced ? 0 : 0.26, ease: EASE_WEICH }}
            className="space-y-2"
          >
            {/* OBERE ZEILE: TITEL & KW */}
            <div className="flex items-baseline justify-between">
              <div>
                <h1 className="display text-[16px] font-bold lowercase leading-none">
                  vierfelder
                </h1>
                <p className="mt-1 text-[11px] text-kreide-52">
                  kw <span className="tnum">{kw}</span> · {langesDatum(heute)}
                </p>
              </div>

              {/* HEUTE-SCORE BADGE */}
              <div className="flex items-center gap-2 rounded-[2px] border border-linie bg-flaeche px-2 py-1 text-[11px]">
                <span className="text-kreide-52">heute</span>
                <span className="tnum font-bold" style={{ color: ich.farbe }}>
                  {match.heuteIch}
                </span>
                <span className="text-kreide-52">:</span>
                <span className="tnum font-bold" style={{ color: er.farbe }}>
                  {match.heuteEr}
                </span>
              </div>
            </div>

            {/* HEAD-TO-HEAD SCOREBOARD */}
            <div className="flex items-end justify-between gap-4">
              {/* ERIJON / ICH */}
              <div>
                <div className="flex items-center gap-1.5 text-[11px] leading-none text-kreide-52">
                  <span className="size-1.5 rounded-full" style={{ background: ich.farbe }} />
                  <span>{ich.name}</span>
                  <span className="text-[10px] text-kreide-60">({match.heuteIch}/5 h)</span>
                </div>
                <div className="mt-1 flex h-[38px] items-end">
                  {match.wocheIch > 0 ? (
                    <Zahl
                      value={match.wocheIch}
                      className="text-[38px] font-bold leading-none"
                      style={{ color: ich.farbe }}
                    />
                  ) : (
                    <span className="tnum text-[30px] font-bold leading-none text-kreide-52">
                      –
                    </span>
                  )}
                </div>
              </div>

              {/* DOMINANZ-DIFF ANZEIGE */}
              <div className="flex flex-col items-center pb-1">
                <span className="text-[10px] uppercase tracking-wider text-kreide-52">
                  woche
                </span>
                <span className="tnum text-[12px] font-bold text-kreide">
                  {match.wocheDiff > 0 ? `+${match.wocheDiff}` : match.wocheDiff < 0 ? `-${Math.abs(match.wocheDiff)}` : '='}
                </span>
              </div>

              {/* KORAY / ER */}
              <div className="text-right">
                <div className="flex items-center justify-end gap-1.5 text-[11px] leading-none text-kreide-52">
                  <span className="text-[10px] text-kreide-60">({match.heuteEr}/5 h)</span>
                  <span>{er.name}</span>
                  <span className="size-1.5 rounded-full" style={{ background: er.farbe }} />
                </div>
                <div className="mt-1 flex h-[38px] items-end justify-end">
                  {match.wocheEr > 0 ? (
                    <Zahl
                      value={match.wocheEr}
                      className="text-[38px] font-bold leading-none"
                      style={{ color: er.farbe }}
                    />
                  ) : (
                    <span className="tnum text-[30px] font-bold leading-none text-kreide-52">
                      –
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* 2PX DOMINANZ-BALKEN (POLE-POSITION) */}
            <div className="h-[2px] w-full overflow-hidden rounded-full bg-grund">
              <div className="flex h-full w-full">
                <div
                  className="transition-all duration-300"
                  style={{
                    width: `${Math.max(4, Math.min(96, match.dominanzVerhaeltnis * 100))}%`,
                    background: ich.farbe,
                  }}
                />
                <div
                  className="flex-1 transition-all duration-300"
                  style={{ background: er.farbe }}
                />
              </div>
            </div>

            {/* DYNAMISCHE MATCH-STATUSZEILE */}
            <div className="flex items-center justify-between rounded-[2px] bg-flaeche px-2.5 py-1 text-[11px] font-medium text-kreide">
              <span className="truncate">{match.statusText}</span>
              {match.restprogramm.matchballIch && (
                <span className="ml-1 shrink-0 text-[10px] font-bold uppercase" style={{ color: ich.farbe }}>
                  matchball
                </span>
              )}
              {match.restprogramm.matchballEr && (
                <span className="ml-1 shrink-0 text-[10px] font-bold uppercase" style={{ color: er.farbe }}>
                  matchball {er.name}
                </span>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  )
}

function Bilanz({
  woche,
  zustand,
  me,
  kw,
}: {
  heute: Date
  woche: string[]
  zustand: Zustand
  me: UserId
  kw: number
}) {
  const ich = userDef(me)
  const er = other(me)
  const zeilen = bilanz(zustand, woche, me, er.id)
  const meins = wocheGesamt(zustand, me, woche)
  const seins = wocheGesamt(zustand, er.id, woche)
  const diff = meins - seins
  const belegIch = belegQuote(zustand, me, woche).gemessen
  const belegEr = belegQuote(zustand, er.id, woche).gemessen
  const entscheidung = entscheideDuell(meins, seins, belegIch, belegEr)
  const sieger = entscheidung.sieger === 'ich' ? ich : entscheidung.sieger === 'er' ? er : null

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between">
        <div className="flex items-center gap-1.5">
          <Trophy size={16} weight="fill" style={{ color: sieger ? sieger.farbe : 'var(--kreide)' }} />
          <h1 className="display text-[16px] font-bold lowercase leading-none">
            {sieger ? `sieger: ${sieger.name}` : 'woche unentschieden'}
          </h1>
        </div>
        <span className="text-[11px] text-kreide-52">
          kw <span className="tnum">{kw}</span> finale
        </span>
      </div>

      <div className="flex items-baseline justify-between rounded-[2px] border border-linie bg-flaeche p-3">
        <div>
          <span className="text-[12px] text-kreide-52">{ich.name} (du)</span>
          <div className="mt-0.5">
            <Zahl value={meins} className="text-[36px] font-bold" style={{ color: ich.farbe }} />
          </div>
        </div>

        <div className="text-center text-[12px] font-bold text-kreide">
          {diff > 0
            ? `+${diff}`
            : diff < 0
              ? `-${Math.abs(diff)}`
              : entscheidung.grund === 'beleg'
                ? `beleg ${belegIch}:${belegEr}`
                : 'remis'}
        </div>

        <div className="text-right">
          <span className="text-[12px] text-kreide-52">{er.name}</span>
          <div className="mt-0.5">
            <Zahl value={seins} className="text-[36px] font-bold" style={{ color: er.farbe }} />
          </div>
        </div>
      </div>

      {entscheidung.grund === 'beleg' && (
        <p className="text-[11px] font-semibold text-kreide-60">
          Punktgleichstand · der Verifizierungs-Tiebreak entscheidet.
        </p>
      )}

      <p className="flex flex-wrap gap-x-3 gap-y-1 rounded-[2px] bg-flaeche px-2.5 py-1.5 text-[12px] text-kreide-60">
        {zeilen.map((z) => {
          const d = z.ich - z.er
          return (
            <span key={z.area}>
              {z.area}{' '}
              <span
                className="tnum font-semibold"
                style={{ color: d > 0 ? ich.farbe : d < 0 ? er.farbe : 'var(--kreide-52)' }}
              >
                {d > 0 ? `+${d}` : d < 0 ? `−${Math.abs(d)}` : '0'}
              </span>
            </span>
          )
        })}
      </p>
    </div>
  )
}
