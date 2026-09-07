import type { ReactNode } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { Minus, Plus } from '@phosphor-icons/react'
import type { MessungsLaufstatus } from '../lib/tracker'
import type { AreaDef, TagesQuelle } from '../lib/types'
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

function laufstatusText(status: MessungsLaufstatus | null | undefined): string {
  if (!status) return ''
  const teile: string[] = []
  if (status.laufend > 0 && status.seit) {
    const seit = uhrzeitVon(status.seit)
    teile.push(status.laufend > 1
      ? `${status.laufend} messungen laufen · älteste läuft seit ${seit}`
      : `läuft seit ${seit}`)
    if (status.mindestdauerErreicht) teile.push('ende fehlt')
    teile.push('noch nicht gezählt')
  }
  if (status.warnungen.length > 0) {
    const eindeutig = [...new Set(status.warnungen)]
    const grund = eindeutig.length > 1
      ? 'mehrere startzeiten sind unplausibel'
      : eindeutig[0] === 'start_ungueltig'
        ? 'startzeit ungültig'
        : eindeutig[0] === 'start_in_zukunft'
          ? 'startzeit liegt in der zukunft'
          : 'seit über 12 stunden ohne ende'
    const anzahl = status.warnungen.length > 1
      ? `${status.warnungen.length} offene messungen prüfen`
      : 'offene messung prüfen'
    teile.push(`${anzahl}: ${grund}`)
  }
  return teile.join(' · ')
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
  quelle: TagesQuelle | null
  /** minuten der gemessenen sitzungen des tages, wenn es welche gibt */
  messungMinuten: number | null
  /** offene Automationen sind nur Status, nie fertige Messminuten */
  laufstatus?: MessungsLaufstatus | null
  farbe: string
  farbeEr: string
  zeigeUndo: boolean
  disabled?: boolean
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
  laufstatus,
  farbe,
  farbeEr,
  zeigeUndo,
  disabled = false,
  onTap,
  onUndo,
  onWert,
  onNeueEinheit,
}: Props) {
  const reduced = useReducedMotion()

  const hatMessung = quelle === 'gemessen' || quelle === 'gemischt'
  const hatManuell = quelle === 'getippt' || quelle === 'gemischt'
  const messungVorhanden = (messungMinuten ?? 0) > 0
  const kurzeMessung = messungVorhanden && !hatMessung
  const laufHinweis = laufstatusText(laufstatus)
  const quellenHinweis = quelle === 'gemischt'
    ? 'gemessen + getippt'
    : kurzeMessung
      ? hatManuell ? 'getippt + kurze messung' : 'kurze messung'
      : ''
  const statuszeile = [
    quellenHinweis,
    quellenHinweis && messungMinuten !== null ? `${messungMinuten} min gemessen` : '',
    kurzeMessung ? 'noch kein punkt' : '',
    laufHinweis,
  ].filter(Boolean).join(' · ')

  /**
   * den wert liefert die messung nur dort, wo der bereich in minuten rechnet.
   * beim lesen misst der fokus zeit, gezählt werden aber seiten — die schritte
   * bleiben deshalb stehen, sonst wäre eine gemessene lesestunde eine zeile,
   * in der man die seiten nicht mehr eintragen kann.
   */
  const wertAusMessung = hatMessung && !hatManuell && area.unit === 'min'

  const links =
    !wertAusMessung && gesetzt ? 'schritte' : streak > 1 ? 'streak' : 'nichts'
  // der tageswert steht seit jeher rechts — und wurde dort fünf sekunden lang
  // von „rückgängig" verdeckt, also genau so lange, wie man tippt. er steht
  // jetzt zwischen den schritten, die ihn ändern, und der platz rechts gehört
  // allein dem rückgängig und der messung.
  const rechts = messungVorhanden
    ? `messung-${quelle ?? 'offen'}-${zeigeUndo ? 'undo' : 'bereit'}`
    : zeigeUndo
      ? 'undo'
      : 'nichts'

  const kopfInhalt = (
    <>
      <span className="min-w-0 basis-full min-[260px]:flex-1 min-[260px]:basis-auto">
        <span
          className="display block truncate text-[22px] font-semibold lowercase leading-none transition-colors duration-200"
          style={{ color: gesetzt ? 'var(--kreide)' : 'var(--kreide-60)' }}
        >
          {area.label}
        </span>
        {statuszeile && (
          <span className="mt-0.5 block text-pretty text-[10px] leading-snug text-kreide-52">
            {statuszeile}
          </span>
        )}
      </span>

      <span className="ml-auto flex items-baseline gap-1.5 min-[260px]:ml-0">
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
      </span>

      <Marke gesetzt={gesetzt} halb={quelle === 'getippt'} farbe={farbe} />
    </>
  )

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
      <div
        aria-busy={disabled || undefined}
        className="flex flex-col justify-center gap-1.5 py-2 pl-1 select-none"
      >
        {quelle === 'gemessen' ? (
          <div
            aria-label={`${area.label}, heute ${hatMessung ? 'gemessen' : 'offen'}${laufHinweis ? `; ${laufHinweis}` : ''}`}
            className="flex min-h-11 w-full flex-wrap items-center gap-2 min-[260px]:flex-nowrap min-[360px]:gap-3"
          >
            {kopfInhalt}
          </div>
        ) : (
          <motion.button
            type="button"
            disabled={disabled}
            aria-pressed={quelle === 'gemischt' ? undefined : gesetzt}
            aria-label={
              quelle === 'gemischt'
                ? `${area.label}, heute gemessen und manuell eingetragen; manuelle eintraege entfernen${laufHinweis ? `; ${laufHinweis}` : ''}`
                : `${area.label}, heute ${gesetzt ? 'eingetragen' : 'offen'}${laufHinweis ? `; ${laufHinweis}` : ''}`
            }
            onClick={onTap}
            whileTap={reduced || disabled ? undefined : { scale: 0.995 }}
            transition={{ duration: 0.09, ease: EASE }}
            className="flex min-h-11 w-full cursor-pointer flex-wrap items-center gap-2 text-left disabled:cursor-default min-[260px]:flex-nowrap min-[360px]:gap-3"
          >
            {kopfInhalt}
          </motion.button>
        )}

        {laufHinweis && (
          <span className="sr-only" role="status" aria-live="polite">
            {area.label}: {laufHinweis}
          </span>
        )}

        {/* zweite zeile: feste touchhoehe, egal was drinsteht */}
        <div className="flex min-h-11 flex-wrap items-center justify-between gap-x-2 gap-y-1 min-[260px]:flex-nowrap">
          <Wechsel schluessel={links}>
            {!wertAusMessung && gesetzt ? (
              <div className="flex w-full flex-wrap items-center gap-1.5 min-[260px]:w-auto min-[260px]:flex-nowrap">
                {/* die uhrzeit der jüngsten einheit steht fest neben den
                    schritten. der slot bleibt 24px breit, ob sie da ist oder
                    nicht, damit nichts unter dem daumen wegrutscht. */}
                <span className="tnum w-6 text-[10px] leading-none text-kreide-52">
                  {uhrzeitVon(einheitVon)}
                </span>

                <Schritt
                  label={`${area.label} um ${area.step} ${area.unit} verringern`}
                  disabled={disabled || einheitWert <= 0}
                  onClick={() => onWert(-area.step)}
                >
                  <Minus size={11} weight="bold" aria-hidden="true" />
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
                  {hatWert
                    ? `${quelle === 'gemischt' ? 'erfasste summe' : 'heute'} ${wert} ${area.unit}`
                    : 'heute ohne wert'}
                </span>

                <Schritt
                  label={`${area.label} um ${area.step} ${area.unit} erhöhen`}
                  disabled={disabled}
                  onClick={() => onWert(area.step)}
                >
                  <Plus size={11} weight="bold" aria-hidden="true" />
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
                {mehrfachMoeglich && !hatMessung && (
                  <button
                    type="button"
                    disabled={disabled}
                    aria-label={`weitere einheit ${area.label} eintragen`}
                    onClick={(e) => {
                      e.stopPropagation()
                      onNeueEinheit()
                    }}
                    className="min-h-11 px-1 text-[11px] text-kreide-52 underline decoration-linie-hell underline-offset-4 disabled:opacity-35"
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
            {hatManuell && messungVorhanden ? (
              <span className="flex flex-wrap items-center justify-end gap-x-2">
                {mehrfachMoeglich && (
                  <button
                    type="button"
                    disabled={disabled}
                    aria-label={`weitere einheit ${area.label} eintragen`}
                    onClick={(e) => {
                      e.stopPropagation()
                      onNeueEinheit()
                    }}
                    className="min-h-11 px-1 text-[11px] text-kreide-52 underline decoration-linie-hell underline-offset-4 disabled:opacity-35"
                  >
                    + einheit
                  </button>
                )}
                {zeigeUndo && (
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={(e) => {
                      e.stopPropagation()
                      onUndo()
                    }}
                    className="min-h-11 px-1 text-[12px] text-kreide-60 underline decoration-linie-hell underline-offset-4 disabled:opacity-35"
                  >
                    rückgängig
                  </button>
                )}
              </span>
            ) : zeigeUndo ? (
              <button
                type="button"
                disabled={disabled}
                onClick={(e) => {
                  e.stopPropagation()
                  onUndo()
                }}
                className="min-h-11 px-1 text-[12px] text-kreide-60 underline decoration-linie-hell underline-offset-4 disabled:opacity-35"
              >
                rückgängig
              </button>
            ) : messungVorhanden ? (
              /* beim lesen steht links weiter der seitenzähler zwischen den
                 schritten und hier die gemessene zeit: die seiten sind der wert
                 des bereichs, die minuten der beleg. keine ersetzt die andere. */
              <span className="flex flex-wrap items-center gap-x-3 gap-y-1 min-[260px]:flex-nowrap">
                <span className="flex items-baseline gap-1.5">
                  <Zahl
                    value={messungMinuten ?? 0}
                    className="text-[14px] font-semibold"
                    style={{ color: 'var(--kreide-60)' }}
                  />
                  <span className="text-[12px] text-kreide-52">
                    min · gemessen
                    {hatMessung ? (anzahl > 1 ? ` · ${anzahl}×` : '') : ' · noch kein punkt'}
                  </span>
                </span>

                {/* eine gemessene sitzung sperrt die schritte, aber nicht den
                    nachtrag: eine zweite, manuell notierte einheit am selben
                    tag ist erlaubt und steht hier neben der messung. */}
                {mehrfachMoeglich && (
                  <button
                    type="button"
                    disabled={disabled}
                    aria-label={`weitere einheit ${area.label} eintragen`}
                    onClick={(e) => {
                      e.stopPropagation()
                      onNeueEinheit()
                    }}
                    className="min-h-11 px-1 text-[11px] text-kreide-52 underline decoration-linie-hell underline-offset-4 disabled:opacity-35"
                  >
                    + einheit
                  </button>
                )}
              </span>
            ) : null}
          </Wechsel>
        </div>
      </div>
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
