import type { KeyboardEvent, ReactNode } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { Minus, Plus } from '@phosphor-icons/react'
import type { AreaDef, TickQuelle } from '../lib/types'
import { EASE, EINGANG, TAKT } from '../lib/motion'
import { Marke } from './Marke'
import { Schritt } from './Schritt'
import { Zahl } from './Zahl'

const UHRZEIT = new Intl.DateTimeFormat('de-DE', {
  hour: '2-digit',
  minute: '2-digit',
})

/** die durchführungszeit der jüngsten einheit, als hh:mm oder leer */
function uhrzeitVon(von: string | null | undefined): string {
  if (!von) return ''
  const d = new Date(von)
  return Number.isFinite(d.getTime()) ? UHRZEIT.format(d) : ''
}

type Props = {
  area: AreaDef
  index: number
  gesetzt: boolean
  wocheIch: number
  abstand: number
  streak: number
  /** summe des tages über alle einheiten */
  wert: number
  /** ob überhaupt eine dauer erfasst ist. 0 minuten und „nie erfasst" sind zwei dinge */
  hatWert: boolean
  /** wert der jüngsten einheit — auf sie wirken die schritte */
  einheitWert: number
  /** durchführungszeit der jüngsten getippten einheit, wenn erfasst */
  einheitVon?: string | null
  /** wie oft die aktivität heute stattgefunden hat */
  anzahl: number
  /** solange die tabelle `einheiten` fehlt, bleibt es bei einer pro tag */
  mehrfachMoeglich: boolean
  /** wie der tick zustande kam. `null`, wo es nichts zu messen gibt */
  quelle: TickQuelle | null
  /** minuten der gemessenen sitzungen des tages, wenn es welche gibt */
  messungMinuten: number | null
  farbe: string
  farbeEr: string
  zeigeUndo: boolean
  onTap: () => void
  onUndo: () => void
  onWert: (delta: number) => void
  onNeueEinheit: () => void
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
  hatWert,
  einheitWert,
  einheitVon,
  anzahl,
  mehrfachMoeglich,
  quelle,
  messungMinuten,
  farbe,
  farbeEr,
  zeigeUndo,
  onTap,
  onUndo,
  onWert,
  onNeueEinheit,
}: Props) {
  const reduced = useReducedMotion()

  /**
   * eine messung ist nicht antippbar — wie die gewichtsmarke. es gäbe sonst
   * einen zustand, in dem ein tap nichts tut, weil der tick schon aus der
   * sitzung kommt.
   */
  const gemessen = quelle === 'gemessen'

  /**
   * den wert liefert die messung nur dort, wo der bereich in minuten rechnet.
   * beim lesen misst der fokus zeit, gezählt werden aber seiten — die schritte
   * bleiben deshalb stehen, sonst wäre eine gemessene lesestunde eine zeile,
   * in der man die seiten nicht mehr eintragen kann.
   */
  const wertAusMessung = gemessen && area.unit === 'min'

  const aufTaste = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onTap()
    }
  }

  const links =
    !wertAusMessung && gesetzt ? 'schritte' : streak > 1 ? 'streak' : 'nichts'
  // der tageswert steht seit jeher rechts — und wurde dort fünf sekunden lang
  // von „rückgängig" verdeckt, also genau so lange, wie man tippt. er steht
  // jetzt zwischen den schritten, die ihn ändern, und der platz rechts gehört
  // allein dem rückgängig und der messung.
  const rechts = gemessen ? 'messung' : zeigeUndo ? 'undo' : 'nichts'

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

        {/* zweite zeile: feste touchhoehe, egal was drinsteht */}
        <div className="flex min-h-11 items-center justify-between">
          <Wechsel schluessel={links}>
            {!wertAusMessung && gesetzt ? (
              <div className="flex items-center gap-1.5">
                {/* die uhrzeit der jüngsten einheit steht fest neben den
                    schritten. der slot bleibt 24px breit, ob sie da ist oder
                    nicht, damit nichts unter dem daumen wegrutscht. */}
                <span className="tnum w-6 text-[10px] leading-none text-kreide-52">
                  {uhrzeitVon(einheitVon)}
                </span>

                <Schritt
                  label={`${area.label} um ${area.step} ${area.unit} verringern`}
                  disabled={einheitWert <= 0}
                  onClick={() => onWert(-area.step)}
                >
                  <Minus size={11} weight="bold" />
                </Schritt>

                {/* der tageswert steht zwischen den knöpfen, die ihn ändern:
                    ein schritt ohne sichtbare folge ist kein schritt. die
                    breite ist fest, damit das plus nicht unter dem daumen
                    wegwandert, wenn aus 45 die 120 wird. */}
                <span
                  className="flex w-[60px] items-baseline justify-center gap-1 leading-none"
                  aria-hidden
                >
                  {hatWert ? (
                    <>
                      <Zahl
                        value={wert}
                        className="text-[13px] font-semibold"
                        style={{ color: 'var(--kreide)' }}
                      />
                      <span className="text-[11px] text-kreide-52">{area.unit}</span>
                    </>
                  ) : (
                    <span className="text-[11px] text-kreide-52">ohne wert</span>
                  )}
                </span>
                <span className="sr-only">
                  {hatWert ? `heute ${wert} ${area.unit}` : 'heute ohne wert'}
                </span>

                <Schritt
                  label={`${area.label} um ${area.step} ${area.unit} erhöhen`}
                  onClick={() => onWert(area.step)}
                >
                  <Plus size={11} weight="bold" />
                </Schritt>

                {/* die zahl ist die summe des tages, die schritte gelten der
                    neuesten einheit — ab der zweiten sagt das der zähler, und
                    er sagt zugleich, dass „+ einheit" etwas getan hat. der
                    platz bleibt leer stehen, damit der knopf daneben liegen
                    bleibt, wo er war. */}
                <span className="w-5 text-[12px] leading-none text-kreide-52">
                  <AnimatePresence mode="wait" initial={false}>
                    {anzahl > 1 && (
                      <motion.span
                        key={anzahl}
                        initial={reduced ? false : { opacity: 0, y: 3 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -3 }}
                        transition={{ duration: 0.16, ease: EASE }}
                        className="tnum inline-block"
                      >
                        {anzahl}×
                      </motion.span>
                    )}
                  </AnimatePresence>
                </span>

                {/* eine zweite runde ersetzt die erste nicht, sie kommt dazu.
                    die schritte darüber gelten dann für die neueste einheit. */}
                {mehrfachMoeglich && !gemessen && (
                  <button
                    type="button"
                    aria-label={`weitere einheit ${area.label} eintragen`}
                    onClick={(e) => {
                      e.stopPropagation()
                      onNeueEinheit()
                    }}
                    className="min-h-11 px-1 text-[11px] text-kreide-52 underline decoration-linie-hell underline-offset-4"
                  >
                    + einheit
                  </button>
                )}
              </div>
            ) : streak > 1 ? (
              <span className="text-[12px] text-kreide-52">
                <span className="tnum">{streak}</span> tage am stück
              </span>
            ) : null}
          </Wechsel>

          <Wechsel schluessel={rechts}>
            {gemessen ? (
              /* beim lesen steht links weiter der seitenzähler zwischen den
                 schritten und hier die gemessene zeit: die seiten sind der wert
                 des bereichs, die minuten der beleg. keine ersetzt die andere. */
              <span className="flex items-center gap-3">
                <span className="flex items-baseline gap-1.5">
                  <Zahl
                    value={messungMinuten ?? 0}
                    className="text-[14px] font-semibold"
                    style={{ color: 'var(--kreide-60)' }}
                  />
                  <span className="text-[12px] text-kreide-52">
                    min · gemessen{anzahl > 1 ? ` · ${anzahl}×` : ''}
                  </span>
                </span>

                {/* eine gemessene sitzung sperrt die schritte, aber nicht den
                    nachtrag: eine zweite, manuell notierte einheit am selben
                    tag ist erlaubt und steht hier neben der messung. */}
                {mehrfachMoeglich && (
                  <button
                    type="button"
                    aria-label={`weitere einheit ${area.label} eintragen`}
                    onClick={(e) => {
                      e.stopPropagation()
                      onNeueEinheit()
                    }}
                    className="min-h-11 px-1 text-[11px] text-kreide-52 underline decoration-linie-hell underline-offset-4"
                  >
                    + einheit
                  </button>
                )}
              </span>
            ) : zeigeUndo ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  onUndo()
                }}
                className="min-h-11 px-1 text-[12px] text-kreide-60 underline decoration-linie-hell underline-offset-4"
              >
                rückgängig
              </button>
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
