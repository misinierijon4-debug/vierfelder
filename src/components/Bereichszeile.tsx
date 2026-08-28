import type { KeyboardEvent, ReactNode } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { Minus, Plus } from '@phosphor-icons/react'
import type { AreaDef, TickQuelle } from '../lib/types'
import { EASE, EINGANG, TAKT } from '../lib/motion'
import { Marke } from './Marke'
import { Schritt } from './Schritt'
import { Zahl } from './Zahl'

type Props = {
  area: AreaDef
  index: number
  gesetzt: boolean
  wocheIch: number
  abstand: number
  streak: number
  wert: number
  /** wie der tick zustande kam. `null`, wo es nichts zu messen gibt */
  quelle: TickQuelle | null
  /** minuten des gemessenen aufenthalts, wenn es einen gibt */
  messungMinuten: number | null
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
  quelle,
  messungMinuten,
  farbe,
  farbeEr,
  zeigeUndo,
  onTap,
  onUndo,
  onWert,
}: Props) {
  const reduced = useReducedMotion()

  /**
   * eine messung ist nicht antippbar — wie die gewichtsmarke. es gäbe sonst
   * einen zustand, in dem ein tap nichts tut, weil der tick schon aus dem
   * aufenthalt kommt. der minutenwert kommt dann aus der messung statt aus
   * dem schrittzähler.
   */
  const gemessen = quelle === 'gemessen'

  const aufTaste = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onTap()
    }
  }

  const links =
    !gemessen && gesetzt ? 'schritte' : streak > 1 ? 'streak' : 'nichts'
  const rechts = gemessen
    ? 'messung'
    : zeigeUndo
      ? 'undo'
      : gesetzt
        ? wert > 0
          ? 'wert'
          : 'ohne'
        : 'nichts'

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
        role={gemessen ? undefined : 'button'}
        tabIndex={gemessen ? undefined : 0}
        aria-pressed={gemessen ? undefined : gesetzt}
        aria-label={
          gemessen
            ? `${area.label}, heute gemessen`
            : `${area.label}, heute ${gesetzt ? 'eingetragen' : 'offen'}`
        }
        onClick={gemessen ? undefined : onTap}
        onKeyDown={gemessen ? undefined : aufTaste}
        whileTap={reduced || gemessen ? undefined : { scale: 0.995 }}
        transition={{ duration: 0.09, ease: EASE }}
        className={`flex flex-col justify-center gap-1.5 py-2 pl-1 select-none${
          gemessen ? '' : ' cursor-pointer'
        }`}
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

          <Marke gesetzt={gesetzt} halb={quelle === 'getippt'} farbe={farbe} />
        </div>

        {/* zweite zeile: immer 24px hoch, egal was drinsteht */}
        <div className="flex h-6 items-center justify-between pr-2">
          <Wechsel schluessel={links}>
            {!gemessen && gesetzt ? (
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
            {gemessen ? (
              <span className="flex items-baseline gap-1.5">
                <Zahl
                  value={messungMinuten ?? 0}
                  className="text-[14px] font-semibold"
                  style={{ color: 'var(--kreide-60)' }}
                />
                <span className="text-[12px] text-kreide-52">min · gemessen</span>
              </span>
            ) : zeigeUndo ? (
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
