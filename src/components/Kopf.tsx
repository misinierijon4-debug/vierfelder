import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { USERS, other, user as userDef } from '../lib/types'
import type { UserId, Zustand } from '../lib/types'
import { isoWeek, langesDatum } from '../lib/dates'
import { bilanz, wocheGesamt } from '../lib/tracker'
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
  const stand = USERS.map((u) => ({ u, punkte: wocheGesamt(zustand, u.id, woche) }))

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
            className="flex min-h-[55px] items-start justify-between gap-4"
          >
            <div>
              <h1 className="display text-[16px] font-bold lowercase leading-none">
                zweikampf
              </h1>
              <p className="mt-1.5 text-[11px] text-kreide-52">
                kw <span className="tnum">{kw}</span> · {langesDatum(heute)}
              </p>
            </div>

            {/* immer beide blöcke, immer gleich hoch: der kopf darf nicht wachsen */}
            <div className="flex items-end gap-5">
              {stand.map(({ u, punkte }) => (
                <div key={u.id} className="text-right">
                  <div className="text-[11px] leading-none text-kreide-52">{u.name}</div>
                  <div className="mt-1.5 flex h-[38px] items-end justify-end">
                    {punkte > 0 ? (
                      <Zahl
                        value={punkte}
                        className="text-[38px] font-bold"
                        style={{ color: u.farbe }}
                      />
                    ) : (
                      <span className="tnum text-[30px] font-bold leading-none text-kreide-52">
                        –
                      </span>
                    )}
                  </div>
                </div>
              ))}
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

  return (
    <div>
      <div className="flex items-baseline justify-between">
        <h1 className="display text-[16px] font-bold lowercase leading-none">woche zu ende</h1>
        <span className="text-[11px] text-kreide-52">
          kw <span className="tnum">{kw}</span>
        </span>
      </div>

      <div className="mt-3 flex items-baseline gap-3">
        <span className="text-[12px] text-kreide-52">{ich.name}</span>
        <Zahl value={meins} className="text-[40px] font-bold" style={{ color: ich.farbe }} />
        <span className="text-[12px] text-kreide-52">{er.name}</span>
        <Zahl value={seins} className="text-[40px] font-bold" style={{ color: er.farbe }} />
      </div>

      <p className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[12px] text-kreide-60">
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
