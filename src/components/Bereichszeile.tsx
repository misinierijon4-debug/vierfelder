import type { KeyboardEvent, ReactNode } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { Minus, Plus } from '@phosphor-icons/react'
import type { AreaDef } from '../lib/types'
import { EASE, EINGANG, TAKT } from '../lib/motion'
import { Marke } from './Marke'
import { Zahl } from './Zahl'

type Props = {
  area: AreaDef
  index: number
  gesetzt: boolean
  wocheIch: number
  abstand: number
  streak: number
  wert: number
  farbe: string
  farbeEr: string
  zeigeUndo: boolean
  onTap: () => void
  onUndo: () => void
  onWert: (delta: number) => void
}

/**
 * feste zeilenhöhe. die zweite zeile ist immer da und wechselt nur ihren inhalt,
 * damit beim eintragen nichts unter dem daumen wegrutscht.
 */
export function Bereichszeile({
  area,
  index,
  gesetzt,
  wocheIch,
  abstand,
  streak,
  wert,
  farbe,
  farbeEr,
  zeigeUndo,
  onTap,
  onUndo,
  onWert,
}: Props) {
  const reduced = useReducedMotion()

  const aufTaste = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onTap()
    }
  }

  const links = gesetzt ? 'schritte' : streak > 1 ? 'streak' : 'nichts'
  const rechts = zeigeUndo ? 'undo' : gesetzt ? (wert > 0 ? 'wert' : 'ohne') : 'nichts'

  return (
    <motion.div
      initial={reduced ? false : { opacity: 0, y: EINGANG.weg }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: reduced ? 0 : EINGANG.dauer,
        ease: EASE,
        delay: reduced ? 0 : index * EINGANG.versatz,
      }}
      className="border-b border-linie"
    >
      <motion.div
        role="button"
        tabIndex={0}
        aria-pressed={gesetzt}
        aria-label={`${area.label}, heute ${gesetzt ? 'eingetragen' : 'offen'}`}
        onClick={onTap}
        onKeyDown={aufTaste}
        whileTap={reduced ? undefined : { scale: 0.995 }}
        transition={{ duration: 0.09, ease: EASE }}
        className="flex cursor-pointer flex-col justify-center gap-1.5 py-2 pl-1 select-none"
      >
        <div className="flex items-center gap-3">
          <div
            className="display min-w-0 flex-1 truncate text-[22px] font-semibold lowercase leading-none transition-colors duration-200"
            style={{ color: gesetzt ? 'var(--kreide)' : 'var(--kreide-60)' }}
          >
            {area.label}
          </div>

          <div className="flex items-baseline gap-1.5">
            {wocheIch > 0 ? (
              <Zahl
                value={wocheIch}
                delay={TAKT.zahl}
                className="text-[30px] font-bold"
                style={{ color: 'var(--kreide)' }}
              />
            ) : (
              <span className="tnum text-[30px] font-bold leading-none text-kreide-52">–</span>
            )}

            <span className="w-6 text-[13px] font-semibold leading-none">
              <AnimatePresence mode="wait" initial={false}>
                {abstand !== 0 && (
                  <motion.span
                    key={abstand}
                    initial={reduced ? false : { opacity: 0, y: 3 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -3 }}
                    transition={{ duration: 0.16, ease: EASE }}
                    className="tnum inline-block"
                    style={{ color: abstand > 0 ? farbe : farbeEr }}
                  >
                    {abstand > 0 ? `+${abstand}` : `−${Math.abs(abstand)}`}
                  </motion.span>
                )}
              </AnimatePresence>
            </span>
          </div>

          <Marke gesetzt={gesetzt} farbe={farbe} />
        </div>

        {/* zweite zeile: immer 24px hoch, egal was drinsteht */}
        <div className="flex h-6 items-center justify-between pr-2">
          <Wechsel schluessel={links}>
            {gesetzt ? (
              <div className="flex items-center gap-1.5">
                <Schritt
                  label={`${area.label} um ${area.step} ${area.unit} verringern`}
                  disabled={wert <= 0}
                  onClick={() => onWert(-area.step)}
                >
                  <Minus size={11} weight="bold" />
                </Schritt>
                <Schritt
                  label={`${area.label} um ${area.step} ${area.unit} erhöhen`}
                  onClick={() => onWert(area.step)}
                >
                  <Plus size={11} weight="bold" />
                </Schritt>
              </div>
            ) : streak > 1 ? (
              <span className="text-[12px] text-kreide-52">
                <span className="tnum">{streak}</span> tage am stück
              </span>
            ) : null}
          </Wechsel>

          <Wechsel schluessel={rechts}>
            {zeigeUndo ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  onUndo()
                }}
                className="text-[12px] text-kreide-60 underline decoration-linie-hell underline-offset-4"
              >
                rückgängig
              </button>
            ) : gesetzt ? (
              <span className="flex items-baseline gap-1.5">
                {wert > 0 ? (
                  <>
                    <Zahl
                      value={wert}
                      className="text-[14px] font-semibold"
                      style={{ color: 'var(--kreide-60)' }}
                    />
                    <span className="text-[12px] text-kreide-52">{area.unit}</span>
                  </>
                ) : (
                  <span className="text-[12px] text-kreide-52">ohne wert</span>
                )}
              </span>
            ) : null}
          </Wechsel>
        </div>
      </motion.div>
    </motion.div>
  )
}

/** wechselt den inhalt eines slots fester höhe, ohne das layout anzufassen */
function Wechsel({ schluessel, children }: { schluessel: string; children: ReactNode }) {
  const reduced = useReducedMotion()
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={schluessel}
        initial={reduced ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: reduced ? 0 : 0.14, ease: EASE }}
        className="flex items-center"
      >
        {children}
      </motion.div>
    </AnimatePresence>
  )
}

function Schritt({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string
  disabled?: boolean
  onClick: () => void
  children: ReactNode
}) {
  const reduced = useReducedMotion()
  return (
    <motion.button
      type="button"
      aria-label={label}
      disabled={disabled}
      whileTap={reduced || disabled ? undefined : { scale: 0.9 }}
      transition={{ duration: 0.09, ease: EASE }}
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      className="flex h-6 w-8 items-center justify-center rounded-[2px] border border-linie text-kreide-60 disabled:opacity-35"
    >
      {children}
    </motion.button>
  )
}
