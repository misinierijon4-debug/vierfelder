import { useCallback, useEffect, useRef, useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { IconArrowUp, IconMicrophone, IconPaperclip } from './EniSymbole'
import { STEMPEL, TAKT } from '../../lib/motion'
import { useNeustartBlocker } from '../../lib/pwaBlocker'
import { fuegeAn, useDiktat } from '../../lib/eniDiktat'
import { MAX_ANHAENGE } from '../../lib/eniAnhang'
import type { VorbereiteterAnhang } from '../../lib/eniAnhang'
import { EniAnhangStreifen } from './EniAnhangStreifen'

/** über fünf zeilen wächst das feld nicht weiter, sonst frisst es den dialog */
const MAX_ZEILEN = 5

const ANNEHMBAR =
  'image/*,text/*,.md,.markdown,.csv,.tsv,.json,.yml,.yaml,.xml,.log,.ts,.tsx,.js,.jsx,.css,.html,.sql,.py,.sh,.toml,.ini'

type Props = {
  gesperrt: boolean
  onVorlegen: (text: string) => void
  vorgabe?: { text: string; nr: number } | null
  anhaengenMoeglich: boolean
  anhaenge: VorbereiteterAnhang[]
  onAnhaengen: (dateien: File[]) => void
  onAnhangEntfernen: (id: string) => void
  onTextChange?: (text: string) => void
  onAbbrechen?: () => void
}

export function EniEingabe({
  gesperrt,
  onVorlegen,
  vorgabe,
  anhaengenMoeglich,
  anhaenge,
  onAnhaengen,
  onAnhangEntfernen,
  onTextChange,
  onAbbrechen,
}: Props) {
  const [text, setText] = useState('')
  const [absendeNr, setAbsendeNr] = useState(0)
  const feldRef = useRef<HTMLTextAreaElement>(null)
  const dateiRef = useRef<HTMLInputElement>(null)

  const handleTextChange = useCallback(
    (neuerText: string) => {
      setText(neuerText)
      onTextChange?.(neuerText)
    },
    [onTextChange]
  )

  const nimmDiktat = useCallback(
    (stueck: string) => {
      setText((vorher) => {
        const aktualisiert = fuegeAn(vorher, stueck)
        onTextChange?.(aktualisiert)
        return aktualisiert
      })
    },
    [onTextChange]
  )
  const diktat = useDiktat(nimmDiktat)

  const etwasDabei = text.trim().length > 0 || anhaenge.length > 0

  useNeustartBlocker(etwasDabei)

  useEffect(() => {
    if (!vorgabe) return
    setText(vorgabe.text)
    onTextChange?.(vorgabe.text)
    feldRef.current?.focus()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vorgabe?.nr])

  useEffect(() => {
    const feld = feldRef.current
    if (!feld) return
    feld.style.height = 'auto'
    const zeile = Number.parseFloat(getComputedStyle(feld).lineHeight) || 24
    feld.style.height = `${Math.min(feld.scrollHeight, zeile * MAX_ZEILEN + 20)}px`
  }, [text])

  const legeVor = () => {
    const sauber = text.trim()
    if (!etwasDabei || gesperrt) return
    if (diktat.laeuft) diktat.stoppe()
    onVorlegen(sauber)
    setText('')
    onTextChange?.('')
    setAbsendeNr((n) => n + 1)
    try {
      navigator.vibrate?.(12)
    } catch {
      /* vibrate ist optional */
    }
  }

  const frei = MAX_ANHAENGE - anhaenge.length

  return (
    <form
      className="border-t border-linie pt-2.5"
      onSubmit={(event) => {
        event.preventDefault()
        legeVor()
      }}
    >
      <div className="rounded-[2px] border border-linie bg-flaeche transition-colors focus-within:border-kreide has-[textarea:focus-visible]:[outline:2px_solid_var(--fokus)] has-[textarea:focus-visible]:[outline-offset:3px]">
        <EniAnhangStreifen
          anhaenge={anhaenge}
          gesperrt={gesperrt}
          onEntfernen={onAnhangEntfernen}
        />

        <label htmlFor="eni-eingabe" className="sr-only">
          was du ENI vorlegst
        </label>
        <textarea
          id="eni-eingabe"
          ref={feldRef}
          rows={1}
          value={text}
          onChange={(event) => handleTextChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault()
              legeVor()
            }
          }}
          onPaste={(event) => {
            if (!anhaengenMoeglich || frei <= 0) return
            const bilder = [...event.clipboardData.files].filter((datei) =>
              datei.type.startsWith('image/')
            )
            if (bilder.length === 0) return
            event.preventDefault()
            onAnhaengen(bilder.slice(0, frei))
          }}
          placeholder="sag es gerade heraus"
          enterKeyHint="send"
          data-ring="rahmen"
          autoComplete="off"
          className="block min-h-11 w-full resize-none border-0 bg-transparent px-3 pt-3 text-[16px] leading-6 text-kreide placeholder:text-kreide-52 focus:outline-none"
        />

        <div className="flex items-center gap-1 px-1.5 pb-1">
          {anhaengenMoeglich && (
            <>
              <input
                ref={dateiRef}
                type="file"
                multiple
                accept={ANNEHMBAR}
                className="sr-only"
                onChange={(event) => {
                  const dateien = [...(event.target.files ?? [])].slice(0, frei)
                  event.target.value = ''
                  if (dateien.length > 0) onAnhaengen(dateien)
                }}
              />
              <button
                type="button"
                onClick={() => dateiRef.current?.click()}
                disabled={gesperrt || frei <= 0}
                aria-label={
                  frei <= 0
                    ? `mehr als ${MAX_ANHAENGE} anhänge gehen nicht`
                    : 'bild oder datei anhängen'
                }
                className="flex size-11 shrink-0 items-center justify-center rounded-[2px] text-kreide-60 transition-colors hover:text-kreide disabled:opacity-40"
              >
                <IconPaperclip size={18} />
              </button>
            </>
          )}

          {diktat.moeglich && (
            <button
              type="button"
              onClick={() => (diktat.laeuft ? diktat.stoppe() : diktat.starte())}
              disabled={gesperrt}
              aria-pressed={diktat.laeuft}
              aria-label={diktat.laeuft ? 'diktat beenden' : 'diktieren'}
              className="flex size-11 shrink-0 items-center justify-center rounded-[2px] transition-colors disabled:opacity-40"
              style={{ color: diktat.laeuft ? 'var(--erijon)' : 'var(--kreide-60)' }}
            >
              <IconMicrophone size={18} />
            </button>
          )}

          <div className="min-w-0 flex-1 px-1">
            {diktat.laeuft ? (
              <span className="block truncate text-[11px] italic text-kreide-52">
                {diktat.vorlaeufig || 'hört zu …'}
              </span>
            ) : gesperrt && onAbbrechen ? (
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-kreide-52">wird verarbeitet</span>
                <button
                  type="button"
                  onClick={onAbbrechen}
                  className="text-[11px] font-semibold text-kreide-60 hover:text-kreide underline underline-offset-2"
                >
                  abbrechen
                </button>
              </div>
            ) : null}
          </div>

          <motion.button
            type="submit"
            whileTap={{ scale: 0.96 }}
            transition={STEMPEL}
            disabled={!etwasDabei || gesperrt}
            aria-label="vorlegen"
            className="flex min-h-11 w-11 shrink-0 items-center justify-center rounded-[2px] border border-transparent bg-kreide text-grund transition-all hover:bg-white active:bg-kreide-60 disabled:border-linie disabled:bg-transparent disabled:text-kreide-52 disabled:opacity-40"
          >
            <IconArrowUp size={18} />
          </motion.button>
        </div>
      </div>

      {diktat.laeuft && (
        <p className="mt-1.5 text-[10px] leading-4 text-kreide-52">
          das mikrofon läuft über die spracherkennung deines browsers. dein ton geht dafür an google oder apple, nicht an ENI.
        </p>
      )}
      {diktat.fehler && (
        <p role="alert" className="mt-1.5 text-[11px]" style={{ color: 'var(--erijon)' }}>
          {diktat.fehler}
        </p>
      )}

      <Stempel nr={absendeNr} />
    </form>
  )
}

function Stempel({ nr }: { nr: number }) {
  const reduced = useReducedMotion()
  if (nr === 0 || reduced) return <div className="mt-2 h-px" aria-hidden="true" />

  return (
    <div className="mt-2 h-px overflow-hidden" aria-hidden="true">
      <motion.div
        key={nr}
        className="h-px bg-kreide"
        initial={{ scaleX: 0, opacity: 1 }}
        animate={{ scaleX: 1, opacity: 0 }}
        transition={{ duration: TAKT.sweep, ease: 'easeOut' }}
        style={{ originX: 0 }}
      />
    </div>
  )
}
