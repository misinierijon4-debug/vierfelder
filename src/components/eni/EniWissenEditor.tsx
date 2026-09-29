import { motion } from 'motion/react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { WISSENS_ARTEN } from '../../lib/eniWissen'
import type { WissensEntwurf } from '../../lib/eniWissen'
import { ART_BEISPIEL, ART_HINWEIS, ART_REIHE, schnellwahl } from '../../lib/eniWissenAnsicht'
import { toKey } from '../../lib/dates'
import { EASE, STEMPEL } from '../../lib/motion'
import { IconTrash } from './EniSymbole'

/** der andere, mit dem geteilt wird: name und farbe */
export type Person = { name: string; farbe: string }

export const FELD =
  'min-h-11 w-full rounded-[2px] border border-linie bg-grund px-3 py-2 text-base text-kreide placeholder:text-kreide-52'
export const LEISE =
  'min-h-11 px-2 text-[12px] text-kreide-52 transition-colors hover:text-kreide disabled:opacity-40'

/** die marke aus dem raster: leer ein umriss, gesetzt eine fläche */
export function Marke({ an, farbe = 'var(--kreide)', reduziert }: { an: boolean; farbe?: string; reduziert: boolean }) {
  return (
    <span
      aria-hidden="true"
      className="relative block size-5 rounded-[2px] border transition-colors"
      style={{ borderColor: an ? farbe : 'var(--marke-rand)' }}
    >
      <motion.span
        initial={false}
        animate={{ scale: an ? 1 : 0.4, opacity: an ? 1 : 0 }}
        transition={reduziert ? { duration: 0 } : STEMPEL}
        className="absolute -inset-px rounded-[2px]"
        style={{ background: farbe }}
      />
    </span>
  )
}

/**
 * Ein formular fuer beides, neu und aendern. Die fuenf bereiche stehen
 * nebeneinander, darunter ein satz, wofuer der gewaehlte gut ist — vorher
 * musste man raten, was „was funktioniert" von „über mich" unterscheidet.
 * Das enddatum ist ein tipp statt eines kalenders; der kalender bleibt fuer
 * alles, was keine der ueblichen fristen ist.
 */
export function WissensEditor({
  entwurf,
  onEntwurf,
  neu,
  partner,
  arbeitet,
  reduziert,
  onSpeichern,
  onAbbrechen,
  onLoeschen,
  grund = 'var(--grund)',
}: {
  entwurf: WissensEntwurf
  onEntwurf: (entwurf: WissensEntwurf) => void
  neu: boolean
  partner: Person
  arbeitet: boolean
  reduziert: boolean
  onSpeichern: () => void
  onAbbrechen: () => void
  onLoeschen?: () => void
  /** worauf das formular liegt — die klebende knopfzeile deckt damit ab */
  grund?: string
}) {
  const feld = useRef<HTMLTextAreaElement>(null)
  const jetzt = new Date()
  const heute = toKey(jetzt)
  const wahl = schnellwahl(entwurf.art, jetzt)
  const [kalender, setKalender] = useState(() => !wahl.some((w) => w.bis === entwurf.bis))
  const zeigtKalender = kalender || !wahl.some((w) => w.bis === entwurf.bis)
  const bereit = entwurf.text.trim().length > 0 && !arbeitet
  const aufgabe = entwurf.art === 'aufgabe'

  // ein übernommener satz steht schon im feld; der cursor gehört ans ende
  useEffect(() => {
    const f = feld.current
    if (!f) return
    f.focus()
    f.setSelectionRange(f.value.length, f.value.length)
  }, [])

  // das feld wächst mit dem text, bis es selbst scrollt
  useLayoutEffect(() => {
    const f = feld.current
    if (!f) return
    f.style.height = 'auto'
    if (f.scrollHeight > 0) f.style.height = `${Math.min(f.scrollHeight + 2, 260)}px`
  }, [entwurf.text])

  return (
    <motion.form
      initial={reduziert ? { opacity: 0 } : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18, ease: EASE }}
      className="space-y-3.5"
      onSubmit={(e) => {
        e.preventDefault()
        if (bereit) onSpeichern()
      }}
    >
      <label className="block">
        <span className="sr-only">{neu ? 'was ENI sich merken soll' : 'eintrag'}</span>
        <textarea
          ref={feld}
          rows={3}
          className={`${FELD} min-h-[84px] resize-none leading-snug`}
          required
          maxLength={1000}
          value={entwurf.text}
          disabled={arbeitet}
          placeholder={ART_BEISPIEL[entwurf.art]}
          onChange={(e) => onEntwurf({ ...entwurf, text: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault()
              if (bereit) onSpeichern()
            }
          }}
        />
        {entwurf.text.length > 800 && (
          <span className="tnum mt-1 block text-right text-[11px] text-kreide-52">
            {entwurf.text.length}/1000
          </span>
        )}
      </label>

      <div>
        <div role="radiogroup" aria-label="bereich" className="flex flex-wrap gap-1.5">
          {ART_REIHE.map((art) => (
            <Wahl
              key={art}
              an={entwurf.art === art}
              disabled={arbeitet}
              onClick={() =>
                onEntwurf({ ...entwurf, art, gemeinsam: art === 'stil' ? false : entwurf.gemeinsam })
              }
            >
              {WISSENS_ARTEN[art].toLowerCase()}
            </Wahl>
          ))}
        </div>
        <p className="mt-2 text-[12px] leading-relaxed text-kreide-52">{ART_HINWEIS[entwurf.art]}</p>
      </div>

      <div>
        <p id="wissen-frist" className="mb-1.5 text-[12px] text-kreide-52">
          {aufgabe ? 'fällig' : 'gilt'}
        </p>
        <div role="radiogroup" aria-labelledby="wissen-frist" className="flex flex-wrap gap-1.5">
          {wahl.map((w) => (
            <Wahl
              key={w.text}
              an={!zeigtKalender && entwurf.bis === w.bis}
              disabled={arbeitet}
              onClick={() => {
                setKalender(false)
                onEntwurf({ ...entwurf, bis: w.bis })
              }}
            >
              {w.text}
            </Wahl>
          ))}
          <Wahl an={zeigtKalender} disabled={arbeitet} onClick={() => setKalender(true)}>
            datum …
          </Wahl>
        </div>
        {zeigtKalender && (
          <input
            type="date"
            aria-label={aufgabe ? 'fällig am' : 'gilt bis'}
            className={`${FELD} mt-2`}
            value={entwurf.bis ?? ''}
            disabled={arbeitet}
            onChange={(e) => onEntwurf({ ...entwurf, bis: e.target.value || null })}
          />
        )}
        {!aufgabe && entwurf.bis && entwurf.bis < heute && (
          <p className="mt-2 text-[12px] leading-relaxed text-kreide">
            das datum ist vorbei. ENI liest den eintrag erst mit einem neuen datum wieder.
          </p>
        )}
      </div>

      {entwurf.art !== 'stil' && (
        <button
          type="button"
          role="checkbox"
          aria-checked={entwurf.gemeinsam}
          disabled={arbeitet}
          onClick={() => onEntwurf({ ...entwurf, gemeinsam: !entwurf.gemeinsam })}
          className="flex w-full items-start text-left disabled:opacity-40"
        >
          <span className="flex h-11 w-10 shrink-0 items-center justify-start">
            <Marke an={entwurf.gemeinsam} farbe={partner.farbe} reduziert={reduziert} />
          </span>
          <span className="min-w-0 flex-1 py-2.5">
            <span className="block text-[13px] font-semibold text-kreide">mit {partner.name} teilen</span>
            <span className="block text-[12px] leading-snug text-kreide-52">
              {partner.name} und sein ENI können den eintrag dann lesen.
            </span>
          </span>
        </button>
      )}

      {/*
        Die knoepfe kleben unten am formular. Mit offener tastatur bleibt vom
        blatt kaum die haelfte, und „merken" lag darunter, erreichbar erst nach
        einem wisch, den niemand vermutet.
      */}
      <div className="sticky bottom-0 flex items-center gap-1 py-1.5" style={{ background: grund }}>
        <button
          type="submit"
          disabled={!bereit}
          className="min-h-11 rounded-[2px] border px-5 text-[13px] font-semibold transition-colors"
          style={
            bereit
              ? { borderColor: 'var(--kreide)', background: 'var(--kreide)', color: 'var(--grund)' }
              : { borderColor: 'var(--linie-hell)', background: 'transparent', color: 'var(--kreide-52)' }
          }
        >
          {arbeitet ? 'speichert …' : neu ? 'merken' : 'speichern'}
        </button>
        <button type="button" className={LEISE} disabled={arbeitet} onClick={onAbbrechen}>
          abbrechen
        </button>
        {onLoeschen && (
          <button
            type="button"
            className={`${LEISE} ml-auto flex items-center gap-1.5`}
            disabled={arbeitet}
            onClick={onLoeschen}
          >
            <IconTrash size={14} />
            löschen
          </button>
        )}
      </div>
    </motion.form>
  )
}

function Wahl({
  an,
  disabled,
  onClick,
  children,
}: {
  an: boolean
  disabled: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={an}
      disabled={disabled}
      onClick={onClick}
      className="min-h-11 rounded-[2px] border px-3 text-[13px] transition-colors disabled:opacity-40"
      style={{
        borderColor: an ? 'var(--kreide)' : 'var(--linie-hell)',
        background: an ? 'var(--kreide)' : 'transparent',
        color: an ? 'var(--grund)' : 'var(--kreide-60)',
        fontWeight: an ? 600 : 400,
      }}
    >
      {children}
    </button>
  )
}
