import { useRef, useState } from 'react'
import type { KeyboardEvent, ReactNode } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { Minus, Plus } from '@phosphor-icons/react'
import { EASE } from '../lib/motion'
import { formatKg, parseKg } from '../lib/gewicht'
import type { Rohwert } from '../lib/gewicht'
import { Marke } from './Marke'
import { Schritt } from './Schritt'

const STUFE = 0.1

type Props = {
  /** heutiges gewicht, oder null */
  kg: number | null
  /** letzter bekannter eintrag, für die vorbelegung */
  letzte: Rohwert | null
  kgEr: number | null
  nameEr: string
  farbe: string
  farbeEr: string
  streak: number
  onSetze: (kg: number) => void
}

/**
 * eintragen statt abhaken. die marke ist hier absichtlich nicht antippbar: der
 * tick entsteht allein aus einer messung, sonst holte man sich punkte ohne waage.
 */
export function Gewichtszeile({
  kg,
  letzte,
  kgEr,
  nameEr,
  farbe,
  farbeEr,
  streak,
  onSetze,
}: Props) {
  const [entwurf, setEntwurf] = useState<string | null>(null)
  const feld = useRef<HTMLInputElement>(null)
  /**
   * fokus und blur ohne tippen dürfen keinen eintrag erfinden — die vorbelegung
   * ist eine tipphilfe, keine messung.
   */
  const beruehrt = useRef(false)

  const oeffne = () => {
    const start = kg ?? letzte?.kg ?? null
    beruehrt.current = false
    setEntwurf(start === null ? '' : formatKg(start))
  }

  const uebernimm = () => {
    const text = entwurf
    setEntwurf(null)
    if (!beruehrt.current || text === null) return
    const neu = parseKg(text)
    // leer oder unlesbar bricht ab, es löscht nicht. die sichtbare rücknahme
    // ist die rückmeldung — dafür braucht es keinen zweiten fehlertext.
    if (neu === null || neu === kg) return
    onSetze(neu)
  }

  const aufTaste = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      feld.current?.blur()
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      beruehrt.current = false
      setEntwurf(null)
    }
  }

  return (
    <section aria-label="gewicht eintragen" className="mt-7 border-t border-b border-linie">
      <div className="flex flex-col justify-center gap-1.5 py-2 pl-1">
        <div className="flex items-center gap-3">
          <div className="display min-w-0 flex-1 truncate text-[22px] font-semibold lowercase leading-none text-kreide-60">
            gewicht
          </div>

          {entwurf === null ? (
            <button
              type="button"
              onClick={oeffne}
              aria-label={kg === null ? 'gewicht eintragen' : `gewicht ${formatKg(kg)} kilogramm ändern`}
              className="flex items-baseline gap-1.5"
            >
              {kg === null ? (
                <span className="tnum text-[22px] font-bold leading-none text-kreide-52">–</span>
              ) : (
                <span className="tnum text-[22px] font-bold leading-none text-kreide">
                  {formatKg(kg)}
                </span>
              )}
              <span className="text-[12px] text-kreide-52">kg</span>
            </button>
          ) : (
            <div className="flex items-baseline gap-1.5">
              {/* text statt number: number frisst das komma und liefert bei
                  zwischenständen einen leeren wert zurück */}
              <input
                ref={feld}
                type="text"
                inputMode="decimal"
                enterKeyHint="done"
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                autoFocus
                value={entwurf}
                onFocus={(e) => e.currentTarget.select()}
                onChange={(e) => {
                  beruehrt.current = true
                  setEntwurf(e.currentTarget.value)
                }}
                onBlur={uebernimm}
                onKeyDown={aufTaste}
                aria-label="gewicht in kilogramm"
                /* 22px: unter 16px zoomt safari beim fokus hinein und nicht zurück */
                className="tnum w-[4.5em] bg-transparent text-right text-[22px] font-bold leading-none text-kreide outline-none"
              />
              <span className="text-[12px] text-kreide-52">kg</span>
            </div>
          )}

          {/* das gewicht ist immer eine messung, deshalb nie halb */}
          <Marke gesetzt={kg !== null} halb={false} farbe={farbe} />
        </div>

        {/* zweite zeile, feste touchhoehe wie in der bereichszeile */}
        <div className="flex min-h-11 items-center justify-between pr-2">
          <Wechsel schluessel={entwurf === null ? 'schritte' : 'fertig'}>
            {entwurf === null ? (
              <div className="flex items-center gap-1.5">
                <Schritt
                  label="gewicht um 100 gramm verringern"
                  disabled={kg === null}
                  onClick={() => kg !== null && onSetze(kg - STUFE)}
                >
                  <Minus size={11} weight="bold" />
                </Schritt>
                <Schritt
                  label="gewicht um 100 gramm erhöhen"
                  disabled={kg === null}
                  onClick={() => kg !== null && onSetze(kg + STUFE)}
                >
                  <Plus size={11} weight="bold" />
                </Schritt>
              </div>
            ) : (
              /* ios zeigt bei inputMode="decimal" keine return-taste */
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => feld.current?.blur()}
                className="min-h-11 px-1 text-[12px] text-kreide-60 underline decoration-linie-hell underline-offset-4"
              >
                fertig
              </button>
            )}
          </Wechsel>

          <Wechsel schluessel={streak > 1 ? 'streak' : 'er'}>
            {streak > 1 ? (
              <span className="text-[12px] text-kreide-52">
                <span className="tnum">{streak}</span> tage am stück
              </span>
            ) : (
              <span className="text-[12px] text-kreide-52">
                {nameEr}{' '}
                {kgEr === null ? (
                  '–'
                ) : (
                  <span className="tnum" style={{ color: farbeEr }}>
                    {formatKg(kgEr)}
                  </span>
                )}
              </span>
            )}
          </Wechsel>
        </div>
      </div>
    </section>
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
