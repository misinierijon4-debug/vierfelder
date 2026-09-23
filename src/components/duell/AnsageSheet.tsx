import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { X } from '@phosphor-icons/react'
import { user as userDef } from '../../lib/types'
import type { UserId } from '../../lib/types'
import {
  ANSAGE_FEHLERTEXT,
  ANSAGE_STUFEN,
  ANSAGE_WORT,
  STUFEN_EINSATZ,
  STUFEN_TEXT,
  ansageZielText,
} from '../../lib/ansagen'
import type { AnsageFehler, AnsageFeld, AnsageKandidat, AnsageStufe } from '../../lib/ansagen'
import { fokusRingLoesen } from '../../lib/dialogFokus'
import { useDialogNachlauf } from '../../lib/dialogNachlauf'
import { useScrollSperre } from '../../lib/scrollsperre'
import { ANSAGE, EASE } from '../../lib/motion'
import { Zahl } from '../Zahl'

export type SheetAntwort = { ok: true } | { fehler: AnsageFehler | 'gesperrt' | 'netz' }

type Props = {
  offen: boolean
  me: UserId
  kandidaten: AnsageKandidat[]
  /** eni-sprüche je feld, soweit da */
  sprueche: Partial<Record<AnsageFeld, string>>
  /** womit das blatt aufgeht, etwa aus einem eni-vorschlag */
  start: { feld: AnsageFeld; stufe: AnsageStufe } | null
  onSageAn: (feld: AnsageFeld, stufe: AnsageStufe) => Promise<SheetAntwort>
  onSchliessen: () => void
}

const SPERRGRUND: Record<NonNullable<AnsageKandidat['gesperrt']>, string> = {
  inaktiv: 'macht er gerade nicht',
  schonAngesagt: 'schon angesagt',
  keinZiel: 'passt nicht mehr',
}

const FEHLER_SONST: Record<'gesperrt' | 'netz', string> = {
  gesperrt: 'gerade kann nichts gespeichert werden.',
  netz: 'ansage nicht bestätigt. stand wird abgeglichen.',
}

function schnittText(schnitt: number): string {
  const gerundet = Math.round(schnitt * 10) / 10
  return `⌀ ${String(gerundet).replace('.', ',')} / woche`
}

/**
 * das blatt zum ansagen, von unten: feld wählen, stufe wählen — ziel und
 * einsatz stehen dabei groß da und wechseln mit —, bestätigen. danach fällt
 * ein siegel aufs blatt, und es geht zu.
 */
export function AnsageSheet({ offen, me, kandidaten, sprueche, start, onSageAn, onSchliessen }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const ich = userDef(me)
  const er = userDef(kandidaten[0]?.an ?? (me === 'erijon' ? 'koray' : 'erijon'))
  const reduced = useReducedMotion()

  const [feld, setFeld] = useState<AnsageFeld | null>(null)
  const [stufe, setStufe] = useState<AnsageStufe | null>(null)
  const [sendet, setSendet] = useState(false)
  const [meldung, setMeldung] = useState<string | null>(null)
  const [siegel, setSiegel] = useState<string | null>(null)

  // beim öffnen frisch: aus dem vorschlag oder leer
  useEffect(() => {
    if (!offen) return
    setFeld(start?.feld ?? null)
    setStufe(start?.stufe ?? null)
    setMeldung(null)
    setSiegel(null)
    setSendet(false)
  }, [offen, start])

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (offen && !dialog.open) dialog.showModal()
    if (!offen && dialog.open) {
      dialog.close()
      fokusRingLoesen()
    }
  }, [offen])

  useScrollSperre(offen)
  const sichtbar = useDialogNachlauf(offen)

  const kandidat = kandidaten.find((k) => k.feld === feld) ?? null
  const ziel = kandidat && stufe ? kandidat.ziele[stufe] : null
  // eine stufe, die für das neue feld nicht passt, fällt auf die empfohlene zurück
  useEffect(() => {
    if (!kandidat || kandidat.gesperrt) return
    if (!stufe || kandidat.ziele[stufe] === null) setStufe(kandidat.empfohlen)
  }, [kandidat, stufe])

  const bestaetigen = async () => {
    if (!feld || !stufe || ziel === null || sendet) return
    setSendet(true)
    setMeldung(null)
    const antwort = await onSageAn(feld, stufe)
    if ('ok' in antwort) {
      setSiegel(ansageZielText(feld, ziel))
      window.setTimeout(onSchliessen, reduced ? 250 : ANSAGE.stempelHalten)
      return
    }
    setSendet(false)
    setMeldung(
      antwort.fehler === 'gesperrt' || antwort.fehler === 'netz'
        ? FEHLER_SONST[antwort.fehler]
        : ANSAGE_FEHLERTEXT[antwort.fehler]
    )
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="ansage-sheet-titel"
      onClose={onSchliessen}
      onClick={(e) => {
        // ein tipp auf den abgedunkelten grund schließt, wie überall bei blättern
        if (e.target === e.currentTarget && !sendet) onSchliessen()
      }}
      className="blatt-unten m-0 w-full max-w-none overflow-hidden border-t border-linie-hell bg-grund p-0 text-kreide backdrop:bg-grund/80"
    >
      {sichtbar && (
        <div
          className="vollbild-safe-x relative mx-auto flex max-h-[88dvh] max-w-[480px] flex-col"
          style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 1rem)' }}
        >
          <div className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-linie-hell" aria-hidden="true" />
          <header className="flex shrink-0 items-center justify-between gap-3 pb-2 pt-2">
            <h2 id="ansage-sheet-titel" className="display text-[20px] font-bold">
              ansage an <span style={{ color: er.farbe }}>{er.name}</span>
            </h2>
            <button
              type="button"
              aria-label="schließen"
              onClick={onSchliessen}
              disabled={sendet}
              className="flex size-11 items-center justify-center rounded-full border border-linie bg-flaeche text-kreide transition-colors hover:border-linie-hell disabled:opacity-40"
            >
              <X size={18} weight="bold" aria-hidden="true" />
            </button>
          </header>

          <div className="min-h-0 overflow-y-auto pb-1">
            <fieldset>
              <legend className="text-[11px] font-bold uppercase tracking-[0.12em] text-kreide-60">feld</legend>
              <div className="mt-2 divide-y divide-linie border-y border-linie">
                {kandidaten.map((k) => {
                  const gewaehlt = k.feld === feld
                  return (
                    <button
                      key={k.feld}
                      type="button"
                      aria-pressed={gewaehlt}
                      disabled={k.gesperrt !== null || sendet}
                      onClick={() => {
                        setFeld(k.feld)
                        setMeldung(null)
                      }}
                      className="relative flex min-h-13 w-full items-center justify-between gap-3 px-3 text-left transition-colors disabled:cursor-default aria-pressed:bg-flaeche"
                    >
                      {gewaehlt && (
                        <motion.span
                          layoutId="ansage-feld-marke"
                          className="absolute inset-y-0 left-0 w-[3px]"
                          style={{ background: ich.farbe }}
                          transition={reduced ? { duration: 0 } : ANSAGE.zelle}
                          aria-hidden="true"
                        />
                      )}
                      <span className={`text-[17px] font-bold ${k.gesperrt ? 'text-kreide-52' : 'text-kreide'}`}>
                        {ANSAGE_WORT[k.feld]}
                      </span>
                      <span className="tnum flex items-center gap-2 text-[11px] text-kreide-52">
                        {k.gesperrt ? (
                          SPERRGRUND[k.gesperrt]
                        ) : (
                          <>
                            {er.name} {schnittText(k.schnitt)}
                            {sprueche[k.feld] && (
                              <span className="rounded-[2px] border border-linie-hell px-1 text-[10px] uppercase tracking-[0.1em] text-kreide-60">
                                eni
                              </span>
                            )}
                          </>
                        )}
                      </span>
                    </button>
                  )
                })}
              </div>
            </fieldset>

            <AnimatePresence initial={false}>
              {kandidat && !kandidat.gesperrt && (
                <motion.div
                  key="stufe"
                  initial={reduced ? false : { opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: ANSAGE.schritt, ease: EASE }}
                >
                  <fieldset className="mt-4">
                    <legend className="text-[11px] font-bold uppercase tracking-[0.12em] text-kreide-60">stufe</legend>
                    <div className="mt-2 grid grid-cols-3 gap-2">
                      {ANSAGE_STUFEN.map((s) => {
                        const z = kandidat.ziele[s]
                        const gewaehlt = s === stufe
                        return (
                          <button
                            key={s}
                            type="button"
                            aria-pressed={gewaehlt}
                            disabled={z === null || sendet}
                            onClick={() => setStufe(s)}
                            className="flex min-h-16 flex-col items-start justify-center rounded-[2px] border px-2.5 text-left transition-colors disabled:opacity-35"
                            style={{
                              borderColor: gewaehlt ? ich.farbe : 'var(--linie-hell)',
                              background: gewaehlt ? 'var(--flaeche)' : 'transparent',
                            }}
                          >
                            <span className="text-[13px] font-bold" style={{ color: gewaehlt ? ich.farbe : 'var(--kreide)' }}>
                              {STUFEN_TEXT[s]}
                            </span>
                            <span className="tnum text-[11px] text-kreide-60">
                              {z === null ? 'passt nicht' : `${z}× · ±${STUFEN_EINSATZ[s]}`}
                            </span>
                          </button>
                        )
                      })}
                    </div>
                  </fieldset>

                  {ziel !== null && stufe && (
                    <div className="mt-4 border-y border-linie py-3" aria-live="polite">
                      <div className="flex items-end justify-between gap-3">
                        <span className="display flex items-baseline gap-2 text-[36px] font-bold leading-none">
                          <Zahl value={`${ziel}×`} />
                          <span>{ANSAGE_WORT[kandidat.feld]}</span>
                        </span>
                        <span className="tnum pb-0.5 text-[20px] font-bold leading-none" style={{ color: ich.farbe }}>
                          ±<Zahl value={STUFEN_EINSATZ[stufe]} />
                        </span>
                      </div>
                      <p className="mt-1.5 text-[12px] leading-5 text-kreide-60">
                        bis so 18 uhr. schafft {er.name} es, bekommt {er.name} {STUFEN_EINSATZ[stufe]}. sonst bekommst du{' '}
                        {STUFEN_EINSATZ[stufe]}.
                      </p>
                      {sprueche[kandidat.feld] && (
                        <p className="mt-1.5 text-[12px] italic leading-5 text-kreide [overflow-wrap:anywhere]">
                          „{sprueche[kandidat.feld]}“
                        </p>
                      )}
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <p aria-live="polite" className="min-h-5 pt-2 text-[12px] text-kreide-60">
            {meldung}
          </p>
          <button
            type="button"
            onClick={() => void bestaetigen()}
            disabled={ziel === null || !stufe || sendet}
            className="mt-1 min-h-14 w-full shrink-0 rounded-[2px] bg-kreide text-[15px] font-bold text-grund transition-opacity disabled:opacity-30"
          >
            {sendet && !siegel
              ? 'wird angesagt …'
              : stufe && ziel !== null
                ? `ansagen · ${STUFEN_EINSATZ[stufe]} ${STUFEN_EINSATZ[stufe] === 1 ? 'punkt' : 'punkte'} setzen`
                : 'feld und stufe wählen'}
          </button>

          <AnimatePresence>
            {siegel && (
              <motion.div
                key="siegel"
                role="status"
                className="pointer-events-none absolute inset-0 flex items-center justify-center bg-grund/70"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.12 }}
              >
                <motion.div
                  className="flex flex-col items-center gap-1 rounded-[2px] border-[3px] px-6 py-4"
                  style={{ borderColor: ich.farbe, color: ich.farbe }}
                  initial={reduced ? false : { scale: 1.8, rotate: -14, opacity: 0 }}
                  animate={{ scale: 1, rotate: -6, opacity: 1 }}
                  transition={ANSAGE.stempel}
                >
                  <span className="display text-[26px] font-bold uppercase tracking-[0.14em]">angesagt</span>
                  <span className="tnum text-[14px] font-semibold">{siegel}</span>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </dialog>
  )
}
