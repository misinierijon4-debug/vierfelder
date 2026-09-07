import { useId, useRef, useState } from 'react'
import type { KeyboardEvent, ReactNode } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { Minus, Plus } from '@phosphor-icons/react'
import { EASE } from '../lib/motion'
import { formatKg, parseKg } from '../lib/gewicht'
import type { Rohwert } from '../lib/gewicht'
import type { TickQuelle } from '../lib/types'
import { useNeustartBlocker } from '../lib/pwaBlocker'
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
  /** woher die heutige zahl kommt: die waage über health, oder der daumen */
  quelle: TickQuelle | null
  onSetze: (kg: number) => void
}

/**
 * eintragen statt abhaken. die marke ist hier absichtlich nicht antippbar: sie
 * folgt der zahl. ob die zahl aus der waage kam oder aus dem daumen, zeigt die
 * marke — voll oder blass, wie in den vier bereichen.
 */
export function Gewichtszeile({
  kg,
  letzte,
  kgEr,
  nameEr,
  farbe,
  farbeEr,
  streak,
  quelle,
  onSetze,
}: Props) {
  const [entwurf, setEntwurf] = useState<string | null>(null)
  const [eingabefehler, setEingabefehler] = useState<string | null>(null)
  useNeustartBlocker(entwurf !== null)
  const feld = useRef<HTMLInputElement>(null)
  const fehlerId = useId()
  /**
   * fokus und blur ohne tippen dürfen keinen eintrag erfinden — die vorbelegung
   * ist eine tipphilfe, keine messung.
   */
  const beruehrt = useRef(false)

  const oeffne = () => {
    const start = kg ?? letzte?.kg ?? null
    beruehrt.current = false
    setEingabefehler(null)
    setEntwurf(start === null ? '' : formatKg(start))
  }

  const uebernimm = () => {
    const text = entwurf
    if (text === null) return
    if (!beruehrt.current) {
      setEntwurf(null)
      setEingabefehler(null)
      return
    }
    const neu = parseKg(text)
    if (neu === null) {
      setEingabefehler('gewicht muss zwischen 30,0 und 300,0 kg liegen')
      return
    }
    setEntwurf(null)
    setEingabefehler(null)
    if (neu !== kg) onSetze(neu)
  }

  const aufTaste = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      feld.current?.blur()
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      beruehrt.current = false
      setEingabefehler(null)
      setEntwurf(null)
    }
  }

  return (
    <section aria-label="gewicht eintragen" className="mt-7 border-t border-b border-linie">
      <div className="flex flex-col justify-center gap-1.5 py-2 pl-1">
        <div className="flex flex-wrap items-center gap-2 min-[260px]:flex-nowrap min-[360px]:gap-3">
          <div className="display basis-full truncate text-[22px] font-semibold lowercase leading-none text-kreide-60 min-[260px]:min-w-0 min-[260px]:flex-1 min-[260px]:basis-auto">
            gewicht
          </div>

          {entwurf === null ? (
            <button
              type="button"
              onClick={oeffne}
              aria-label={kg === null ? 'gewicht eintragen' : `gewicht ${formatKg(kg)} kilogramm ändern`}
              className="ml-auto flex min-h-11 min-w-11 items-center justify-end gap-1.5 px-1 min-[260px]:ml-0"
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
            <div className="ml-auto flex items-baseline gap-1.5 min-[260px]:ml-0">
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
                  setEingabefehler(null)
                  setEntwurf(e.currentTarget.value)
                }}
                onBlur={uebernimm}
                onKeyDown={aufTaste}
                aria-label="gewicht in kilogramm"
                aria-invalid={eingabefehler ? 'true' : undefined}
                aria-describedby={eingabefehler ? fehlerId : undefined}
                aria-errormessage={eingabefehler ? fehlerId : undefined}
                /* 22px: unter 16px zoomt safari beim fokus hinein und nicht zurück */
                className="tnum min-h-11 w-[3.5em] rounded-[2px] border border-kontroll-rand bg-transparent px-1 text-right text-[22px] font-bold leading-none text-kreide outline-none min-[260px]:w-[4em]"
              />
              <span className="text-[12px] text-kreide-52">kg</span>
            </div>
          )}

          {/* voll heißt: die waage hat geschrieben. blass heißt: eingetippt */}
          <Marke gesetzt={kg !== null} halb={quelle === 'getippt'} farbe={farbe} />
        </div>

        {eingabefehler && (
          <p id={fehlerId} role="alert" className="text-pretty text-[11px] font-semibold leading-snug text-kreide">
            {eingabefehler}
          </p>
        )}

        {/* zweite zeile, feste touchhoehe wie in der bereichszeile */}
        <div className="flex min-h-11 flex-wrap items-center justify-between gap-x-2 gap-y-1 pr-2 min-[260px]:flex-nowrap">
          <Wechsel schluessel={entwurf === null ? 'schritte' : 'fertig'}>
            {entwurf === null ? (
              <div className="flex items-center gap-1.5">
                <Schritt
                  label="gewicht um 100 gramm verringern"
                  disabled={kg === null}
                  onClick={() => kg !== null && onSetze(kg - STUFE)}
                >
                  <Minus size={11} weight="bold" aria-hidden="true" />
                </Schritt>
                <Schritt
                  label="gewicht um 100 gramm erhöhen"
                  disabled={kg === null}
                  onClick={() => kg !== null && onSetze(kg + STUFE)}
                >
                  <Plus size={11} weight="bold" aria-hidden="true" />
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
