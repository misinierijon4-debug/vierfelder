import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import {
  alleRollen,
  einstellungKurz,
  GRENZEN,
  istVorlage,
  LAENGEN,
  ladeEinstellungen,
  mitRolle,
  ohneRolle,
  ROLLEN_VORLAGEN,
  speichereEinstellungen,
  STANDARD,
  TOENE,
  vorschau,
  VORSCHAU_FRAGE,
} from '../../lib/eniEinstellungen'
import type { EniEinstellungen, EniLaenge, EniRolle, EniTon } from '../../lib/eniEinstellungen'
import { EASE } from '../../lib/motion'
import { user } from '../../lib/types'
import type { UserId } from '../../lib/types'
import { fokusRingLoesen } from '../../lib/dialogFokus'
import { useScrollSperre } from '../../lib/scrollsperre'
import { useDialogNachlauf } from '../../lib/dialogNachlauf'
import { Feldsymbol } from '../Feldsymbole'
import { EniMarke } from './EniMarke'
import { IconFood, IconGedaechtnis, IconMoon, IconPencil, IconPlus, IconX } from './EniSymbole'

const API = { laden: ladeEinstellungen, speichern: speichereEinstellungen }

/** so lange nach der letzten eingabe wird gespeichert */
const SPEICHERN_NACH_MS = 700

type Status = 'ruhe' | 'wartet' | 'speichert' | 'gespeichert' | 'fehler'

type Props = {
  offen: boolean
  kontoId: string | null
  me?: UserId
  onSchliessen: () => void
  /** öffnet die liste dessen, was ENI sich gemerkt hat */
  onGedaechtnis?: () => void
  api?: typeof API
}

const FELD =
  'w-full rounded-[2px] border border-linie bg-grund px-3 py-2.5 text-base text-kreide placeholder:text-kreide-52 focus:border-kreide-60 focus:outline-none'

/**
 * „So redet ENI mit dir": die einstellungen wie bei ChatGPT.
 *
 * Oben steht eine vorschau — dieselbe frage, ENIs antwort im gewaehlten ton
 * und in der gewaehlten laenge. Wer eine kachel antippt, sieht sofort, was sie
 * bewirkt, statt es erst im naechsten chat zu merken. Darunter ton, eigene
 * anweisungen, laenge und rollen. Gespeichert wird von selbst, kurz nach der
 * letzten aenderung; oben rechts steht, ob es geklappt hat.
 */
export function EniEinstellungen({ offen, kontoId, me, onSchliessen, onGedaechtnis, api = API }: Props) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [stand, setStand] = useState<EniEinstellungen | null>(null)
  const [ladefehler, setLadefehler] = useState<string | null>(null)
  const [status, setStatus] = useState<Status>('ruhe')
  const [fehler, setFehler] = useState<string | null>(null)
  const [aufgeklappt, setAufgeklappt] = useState<string | null>(null)
  const [zuruecksetzen, setZuruecksetzen] = useState(false)
  const offenerStand = useRef<EniEinstellungen | null>(null)
  const timer = useRef<number | undefined>(undefined)
  const kette = useRef<Promise<void>>(Promise.resolve())
  const ladeNr = useRef(0)
  useScrollSperre(offen)

  const farbe = me ? user(me).farbe : 'var(--kreide)'

  const laden = useCallback(async () => {
    const nr = ++ladeNr.current
    setLadefehler(null)
    try {
      const geladen = await api.laden()
      if (nr === ladeNr.current) setStand(geladen)
    } catch (e) {
      if (nr === ladeNr.current) setLadefehler((e as Error).message)
    }
  }, [api])

  /** schreibt den letzten offenen stand. läuft immer nacheinander, nie zwei zugleich. */
  const speichern = useCallback(() => {
    window.clearTimeout(timer.current)
    kette.current = kette.current.then(async () => {
      const e = offenerStand.current
      if (!e) return
      offenerStand.current = null
      setStatus('speichert')
      try {
        await api.speichern(kontoId, e)
        if (!offenerStand.current) setStatus('gespeichert')
        setFehler(null)
      } catch (ursache) {
        // der stand bleibt offen, damit „erneut" ihn noch hat
        offenerStand.current ??= e
        setFehler((ursache as Error).message)
        setStatus('fehler')
      }
    })
    return kette.current
  }, [api, kontoId])

  useEffect(() => {
    if (offen) {
      if (!dialog.current?.open) dialog.current?.showModal()
      setStand(null)
      setStatus('ruhe')
      setFehler(null)
      setAufgeklappt(null)
      setZuruecksetzen(false)
      offenerStand.current = null
      void laden()
    } else if (dialog.current?.open) {
      dialog.current.close()
      fokusRingLoesen()
    }
    return () => {
      ladeNr.current++
    }
  }, [offen, laden])

  // was beim schliessen noch offen ist, wird sofort geschrieben
  useEffect(() => () => void speichern(), [speichern])

  function aendere(neu: EniEinstellungen) {
    setStand(neu)
    setZuruecksetzen(false)
    offenerStand.current = neu
    setStatus('wartet')
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => void speichern(), SPEICHERN_NACH_MS)
  }

  function schliessen() {
    if (offenerStand.current) void speichern()
    onSchliessen()
  }

  const sichtbar = useDialogNachlauf(offen)
  const reduziert = useReducedMotion() ?? false

  const rollen = stand ? alleRollen(stand) : []

  return (
    <dialog
      ref={dialog}
      aria-label="So redet ENI mit dir"
      onCancel={(e) => {
        e.preventDefault()
        if (aufgeklappt) setAufgeklappt(null)
        else schliessen()
      }}
      className="m-0 h-[100dvh] max-h-none w-screen max-w-none bg-grund p-0 text-kreide backdrop:bg-grund/80 backdrop:backdrop-blur-sm"
    >
      {sichtbar && (
        <motion.div
          initial={reduziert ? { opacity: 0 } : { opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.18, ease: EASE }}
          className="vollbild-safe-x flex h-full flex-col pb-[max(0.75rem,var(--app-safe-bottom))] pt-[calc(var(--app-safe-top)+0.75rem)]"
        >
          <header className="mx-auto flex w-full max-w-[560px] shrink-0 items-center justify-between gap-3 pb-2">
            <div className="flex min-w-0 items-center gap-2.5">
              <EniMarke groesse={20} />
              <h2 className="display truncate text-[17px] font-bold leading-none">ENI anpassen</h2>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <Speicherstand status={status} onErneut={() => void speichern()} />
              <button
                type="button"
                className="-mr-2 flex size-11 items-center justify-center text-kreide-60 transition-colors hover:text-kreide"
                aria-label="Einstellungen schließen"
                onClick={schliessen}
              >
                <IconX size={18} />
              </button>
            </div>
          </header>

          <div className="ohne-balken mx-auto w-full max-w-[560px] min-h-0 flex-1 overflow-y-auto overscroll-contain">
            {ladefehler ? (
              <div role="alert" className="mt-4 rounded-[2px] border border-linie bg-flaeche p-4">
                <p className="text-[15px] font-semibold">Einstellungen nicht lesbar</p>
                <p className="mt-1 break-words text-[13px] leading-relaxed text-kreide-60">{ladefehler}</p>
                <button
                  type="button"
                  onClick={() => void laden()}
                  className="mt-3 min-h-11 rounded-[2px] bg-kreide px-4 text-[13px] font-bold text-grund"
                >
                  erneut versuchen
                </button>
              </div>
            ) : !stand ? (
              <p role="status" className="pt-8 text-center text-[13px] text-kreide-52">
                lädt …
              </p>
            ) : (
              <div className="space-y-9 pb-8 pt-2">
                <Vorschau stand={stand} farbe={farbe} reduziert={reduziert} />

                <Abschnitt titel="Ton" text="Wie ENI klingt, wenn er mit dir redet.">
                  <div role="radiogroup" aria-label="Ton" className="grid grid-cols-2 gap-2">
                    {(Object.keys(TOENE) as EniTon[]).map((ton) => (
                      <TonKachel
                        key={ton}
                        ton={ton}
                        an={stand.ton === ton}
                        farbe={farbe}
                        onClick={() => {
                          aendere({ ...stand, ton })
                          if (ton === 'eigener')
                            window.requestAnimationFrame(() =>
                              dialog.current?.querySelector<HTMLTextAreaElement>('#eni-anweisungen')?.focus(),
                            )
                        }}
                      />
                    ))}
                  </div>
                </Abschnitt>

                <Abschnitt
                  titel="Eigene Anweisungen"
                  text={
                    stand.ton === 'eigener'
                      ? 'Beschreib hier deinen eigenen Ton. Gilt in jedem Chat.'
                      : 'Gilt in jedem Chat, zusätzlich zum Ton.'
                  }
                  fuer="eni-anweisungen"
                >
                  <Textfeld
                    id="eni-anweisungen"
                    wert={stand.anweisungen}
                    grenze={GRENZEN.anweisungen}
                    zeilen={4}
                    platzhalter={
                      stand.ton === 'eigener'
                        ? 'Zum Beispiel: Rede wie ein alter Boxtrainer aus dem Ruhrpott. Kurze Sätze, trockener Humor, ehrlich bis zur Schmerzgrenze.'
                        : 'Zum Beispiel: Nenn mich Chef. Rechne in Kilogramm. Frag nach, bevor du einen Plan machst.'
                    }
                    onWert={(anweisungen) => aendere({ ...stand, anweisungen })}
                  />
                </Abschnitt>

                <Abschnitt titel="Antwortlänge" text="Wie viel ENI schreibt, wenn du nichts anderes sagst.">
                  <div
                    role="radiogroup"
                    aria-label="Antwortlänge"
                    className="grid grid-cols-3 gap-1 rounded-[2px] border border-linie bg-flaeche p-1"
                  >
                    {(Object.keys(LAENGEN) as EniLaenge[]).map((laenge, i) => {
                      const an = stand.laenge === laenge
                      return (
                        <button
                          key={laenge}
                          type="button"
                          role="radio"
                          aria-checked={an}
                          onClick={() => aendere({ ...stand, laenge })}
                          className="flex min-h-14 flex-col items-center justify-center gap-1.5 rounded-[2px] border text-[13px] transition-colors"
                          style={{
                            borderColor: an ? 'var(--kreide-52)' : 'transparent',
                            background: an ? 'var(--grund)' : 'transparent',
                            color: an ? 'var(--kreide)' : 'var(--kreide-60)',
                            fontWeight: an ? 600 : 400,
                          }}
                        >
                          <LaengenZeichen stufe={i + 1} an={an} farbe={farbe} />
                          {LAENGEN[laenge].name}
                        </button>
                      )
                    })}
                  </div>
                </Abschnitt>

                <Abschnitt
                  titel="Rollen"
                  text="Sag ENI, wer er für dich sein soll. Ist eine Rolle an, wechselt er von selbst hinein, sobald es um ihr Thema geht."
                >
                  <ul className="divide-y divide-linie rounded-[2px] border border-linie">
                    {rollen.map((rolle) => (
                      <RollenZeile
                        key={rolle.id}
                        rolle={rolle}
                        farbe={farbe}
                        offen={aufgeklappt === rolle.id}
                        reduziert={reduziert}
                        onUmschalten={() => setAufgeklappt((vorher) => (vorher === rolle.id ? null : rolle.id))}
                        onRolle={(neu) => aendere(mitRolle(stand, neu))}
                        onZuruecksetzen={
                          istVorlage(rolle.id) ? () => aendere(ohneRolle(stand, rolle.id)) : undefined
                        }
                        onLoeschen={
                          istVorlage(rolle.id)
                            ? undefined
                            : () => {
                                setAufgeklappt(null)
                                aendere(ohneRolle(stand, rolle.id))
                              }
                        }
                      />
                    ))}
                    <li>
                      <button
                        type="button"
                        disabled={stand.rollen.length >= GRENZEN.rollen}
                        onClick={() => {
                          const id = `eigen-${Math.random().toString(36).slice(2, 10)}`
                          aendere(mitRolle(stand, { id, name: '', thema: '', anweisung: '', aktiv: true }))
                          setAufgeklappt(id)
                        }}
                        className="flex min-h-14 w-full items-center gap-3 px-3 text-left text-kreide-60 transition-colors hover:text-kreide disabled:opacity-40"
                      >
                        <span className="flex size-9 shrink-0 items-center justify-center rounded-[2px] border border-dashed border-linie-hell">
                          <IconPlus size={16} />
                        </span>
                        <span className="text-[15px] font-semibold">Eigene Rolle</span>
                      </button>
                    </li>
                  </ul>
                </Abschnitt>

                {onGedaechtnis && (
                  <button
                    type="button"
                    onClick={onGedaechtnis}
                    className="flex min-h-16 w-full items-center gap-3 rounded-[2px] border border-linie px-3 text-left transition-colors hover:border-linie-hell"
                  >
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-[2px] border border-linie text-kreide-60">
                      <IconGedaechtnis size={16} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[15px] font-semibold">Was ENI sich gemerkt hat</span>
                      <span className="block text-[12px] text-kreide-60">Gemerkte Sätze ansehen und löschen</span>
                    </span>
                    <span aria-hidden="true" className="text-kreide-52">
                      ›
                    </span>
                  </button>
                )}

                {JSON.stringify(stand) !== JSON.stringify(STANDARD) && (
                  <div className="flex justify-center">
                    {zuruecksetzen ? (
                      <span className="flex items-center gap-1">
                        <button
                          type="button"
                          className="min-h-11 px-3 text-[13px] font-semibold text-kreide"
                          onClick={() => {
                            aendere({ ...STANDARD, rollen: [] })
                            setAufgeklappt(null)
                          }}
                        >
                          ja, alles zurücksetzen
                        </button>
                        <button
                          type="button"
                          className="min-h-11 px-3 text-[13px] text-kreide-52"
                          onClick={() => setZuruecksetzen(false)}
                        >
                          doch nicht
                        </button>
                      </span>
                    ) : (
                      <button
                        type="button"
                        className="min-h-11 px-3 text-[13px] text-kreide-52 transition-colors hover:text-kreide"
                        onClick={() => setZuruecksetzen(true)}
                      >
                        auf Standard zurücksetzen
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {fehler && status === 'fehler' && (
            <div
              role="alert"
              className="mx-auto flex w-full max-w-[560px] shrink-0 items-center gap-2 border-t border-linie pt-2"
            >
              <span className="min-w-0 flex-1 break-words text-[12px] leading-snug text-kreide-60">
                <b className="text-kreide">Nicht gespeichert.</b> {fehler}
              </span>
              <button
                type="button"
                className="min-h-11 shrink-0 px-2 text-[12px] font-semibold text-kreide"
                onClick={() => void speichern()}
              >
                erneut
              </button>
            </div>
          )}
        </motion.div>
      )}
    </dialog>
  )
}

function Speicherstand({ status, onErneut }: { status: Status; onErneut: () => void }) {
  if (status === 'fehler')
    return (
      <button type="button" onClick={onErneut} className="min-h-11 px-1 text-[12px] font-semibold text-kreide">
        erneut speichern
      </button>
    )
  const text =
    status === 'wartet' || status === 'speichert' ? 'speichert …' : status === 'gespeichert' ? 'gespeichert' : ''
  return (
    <span role="status" aria-live="polite" className="text-[12px] text-kreide-52">
      {text}
    </span>
  )
}

function Abschnitt({
  titel,
  text,
  fuer,
  children,
}: {
  titel: string
  text: string
  fuer?: string
  children: ReactNode
}) {
  return (
    <section>
      {fuer ? (
        <label htmlFor={fuer} className="display block text-[19px] font-bold leading-tight">
          {titel}
        </label>
      ) : (
        <h3 className="display text-[19px] font-bold leading-tight">{titel}</h3>
      )}
      <p className="mb-3 mt-1 text-[13px] leading-snug text-kreide-60">{text}</p>
      {children}
    </section>
  )
}

/**
 * Die frage links vom daumen, ENIs antwort darunter — wie im chat. Die
 * antwort blendet beim wechsel neu ein, damit man sieht, dass sie sich
 * geaendert hat.
 */
function Vorschau({ stand, farbe, reduziert }: { stand: EniEinstellungen; farbe: string; reduziert: boolean }) {
  const antwort = vorschau(stand.ton, stand.laenge)
  return (
    <section aria-label="Vorschau" className="rounded-[2px] border border-linie bg-flaeche/60 p-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-kreide-52">Vorschau</p>
      <p
        className="ml-auto mt-3 w-fit max-w-[85%] rounded-[2px] border-r-2 bg-grund px-3 py-2 text-[14px] leading-snug"
        style={{ borderColor: farbe }}
      >
        {VORSCHAU_FRAGE}
      </p>
      <div className="mt-3 flex items-start gap-2.5">
        <span className="mt-0.5">
          <EniMarke groesse={18} />
        </span>
        {/* kein warten auf das ausblenden: die neue antwort steht sofort da und blendet nur ein */}
        <motion.p
          key={antwort}
          aria-live="polite"
          initial={reduziert ? { opacity: 0 } : { opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.18, ease: EASE }}
          className="min-h-[3lh] text-[15px] leading-relaxed"
        >
          {antwort}
        </motion.p>
      </div>
      <p className="mt-3 border-t border-linie pt-2.5 text-[12px] text-kreide-60">
        {einstellungKurz(stand)}
        {stand.anweisungen.trim() ? ' · eigene Anweisungen' : ''}
        {stand.ton === 'eigener' ? ' — die Vorschau zeigt den Standard' : ''}
      </p>
    </section>
  )
}

/** kleine zeichen für die töne, gezeichnet wie der rest: linien, keine flächen */
const TON_ZEICHEN: Record<EniTon, ReactNode> = {
  standard: null,
  streng: <path d="M13 2.5 5 13.5h6l-1 8 8-11h-6z" />,
  locker: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M8.5 14.2c1.9 2.2 5.1 2.2 7 0" />
      <path d="M9 9.6v.4M15 9.6v.4" />
    </>
  ),
  sanft: <path d="M12 20s-7.5-4.4-7.5-10A4.2 4.2 0 0 1 12 7.4 4.2 4.2 0 0 1 19.5 10c0 5.6-7.5 10-7.5 10z" />,
  sachlich: (
    <>
      <path d="M5 7h14M5 12h14M5 17h9" />
    </>
  ),
  eigener: null,
}

function TonKachel({ ton, an, farbe, onClick }: { ton: EniTon; an: boolean; farbe: string; onClick: () => void }) {
  const vorlage = TOENE[ton]
  return (
    <button
      type="button"
      role="radio"
      aria-checked={an}
      onClick={onClick}
      className="relative flex min-h-[92px] flex-col items-start gap-2 rounded-[2px] border bg-flaeche p-3 text-left transition-colors"
      style={{ borderColor: an ? farbe : 'var(--linie)', boxShadow: an ? `inset 0 0 0 1px ${farbe}` : undefined }}
    >
      <span className="flex h-5 items-center" style={{ color: an ? farbe : 'var(--kreide-60)' }}>
        {ton === 'standard' ? (
          <EniMarke groesse={18} />
        ) : ton === 'eigener' ? (
          <IconPencil size={18} />
        ) : (
          <svg
            width={20}
            height={20}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.9"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            {TON_ZEICHEN[ton]}
          </svg>
        )}
      </span>
      <span>
        <span className="block text-[15px] font-bold leading-tight">{vorlage.name}</span>
        <span className="mt-0.5 block text-[12px] leading-snug text-kreide-60">{vorlage.kurz}</span>
      </span>
      {an && (
        <span
          aria-hidden="true"
          className="absolute right-2.5 top-2.5 flex size-5 items-center justify-center rounded-[2px]"
          style={{ background: farbe }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--grund)" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12.5 10 17 19 7" />
          </svg>
        </span>
      )}
    </button>
  )
}

/** eine, zwei oder drei zeilen — die länge als bild */
function LaengenZeichen({ stufe, an, farbe }: { stufe: number; an: boolean; farbe: string }) {
  return (
    <span aria-hidden="true" className="flex h-3.5 w-7 flex-col justify-center gap-[3px]">
      {[1, 2, 3].map((n) => (
        <span
          key={n}
          className="block h-[2px] rounded-[1px]"
          style={{
            width: n === stufe ? '65%' : '100%',
            background: n <= stufe ? (an ? farbe : 'var(--kreide-60)') : 'transparent',
          }}
        />
      ))}
    </span>
  )
}

function RollenZeichen({ rolle }: { rolle: EniRolle }) {
  switch (rolle.id) {
    case 'ernaehrung':
      return <IconFood size={17} />
    case 'training':
      return <Feldsymbol feld="gym" size={18} />
    case 'boxen':
      return <Feldsymbol feld="boxen" size={18} />
    case 'lernen':
      return <Feldsymbol feld="lernen" size={18} />
    case 'schlaf':
      return <IconMoon size={16} />
    case 'faszien':
      return (
        <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden="true">
          <path d="M3 9c3-3 6 3 9 0s6 3 9 0M3 15c3-3 6 3 9 0s6 3 9 0" />
        </svg>
      )
    default:
      return (
        <span className="display text-[15px] font-bold leading-none">
          {(rolle.name.trim()[0] ?? '?').toUpperCase()}
        </span>
      )
  }
}

function RollenZeile({
  rolle,
  farbe,
  offen,
  reduziert,
  onUmschalten,
  onRolle,
  onZuruecksetzen,
  onLoeschen,
}: {
  rolle: EniRolle
  farbe: string
  offen: boolean
  reduziert: boolean
  onUmschalten: () => void
  onRolle: (rolle: EniRolle) => void
  onZuruecksetzen?: () => void
  onLoeschen?: () => void
}) {
  const vorlage = ROLLEN_VORLAGEN.find((v) => v.id === rolle.id)
  const geaendert =
    !!vorlage && (vorlage.thema !== rolle.thema || vorlage.anweisung !== rolle.anweisung || vorlage.name !== rolle.name)
  const titel = rolle.name.trim() || 'Neue Rolle'
  return (
    <li>
      <div className="flex min-h-16 items-center gap-3 pl-3">
        <span
          className="flex size-9 shrink-0 items-center justify-center rounded-[2px] border transition-colors"
          style={{
            borderColor: rolle.aktiv ? farbe : 'var(--linie)',
            color: rolle.aktiv ? farbe : 'var(--kreide-60)',
          }}
        >
          <RollenZeichen rolle={rolle} />
        </span>
        <button
          type="button"
          aria-expanded={offen}
          onClick={onUmschalten}
          className="flex min-h-16 min-w-0 flex-1 flex-col justify-center py-2 text-left"
        >
          <span className={`block truncate text-[15px] font-semibold ${rolle.name.trim() ? '' : 'text-kreide-52'}`}>
            {titel}
          </span>
          <span className="block truncate text-[12px] text-kreide-60">
            {offen ? 'zuklappen' : rolle.thema.trim() || 'Thema und Anweisung festlegen'}
          </span>
        </button>
        <Schalter
          an={rolle.aktiv}
          farbe={farbe}
          label={`${titel} ${rolle.aktiv ? 'ausschalten' : 'einschalten'}`}
          onClick={() => onRolle({ ...rolle, aktiv: !rolle.aktiv })}
        />
      </div>
      <AnimatePresence initial={false}>
        {offen && (
          <motion.div
            initial={reduziert ? { opacity: 0 } : { opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={reduziert ? { opacity: 0 } : { opacity: 0, height: 0 }}
            transition={{ duration: 0.2, ease: EASE }}
            className="overflow-hidden"
          >
            <div className="space-y-3 px-3 pb-4 pt-1">
              {!vorlage && (
                <Feldblock label="Wer soll ENI sein?" fuer={`${rolle.id}-name`}>
                  <input
                    id={`${rolle.id}-name`}
                    className={FELD}
                    value={rolle.name}
                    maxLength={GRENZEN.name}
                    placeholder="z. B. Faszienberater"
                    autoFocus={!rolle.name}
                    onChange={(e) => onRolle({ ...rolle, name: e.target.value })}
                  />
                  {!rolle.name.trim() && (
                    <span className="mt-1 block text-[12px] text-kreide-52">Ohne Namen wird die Rolle nicht gespeichert.</span>
                  )}
                </Feldblock>
              )}
              <Feldblock label="Wann? (Thema)" fuer={`${rolle.id}-thema`}>
                <input
                  id={`${rolle.id}-thema`}
                  className={FELD}
                  value={rolle.thema}
                  maxLength={GRENZEN.thema}
                  placeholder="z. B. Rücken, Dehnen, Verspannungen"
                  onChange={(e) => onRolle({ ...rolle, thema: e.target.value })}
                />
              </Feldblock>
              <Feldblock label="Wie soll ENI sich verhalten?" fuer={`${rolle.id}-anweisung`}>
                <Textfeld
                  id={`${rolle.id}-anweisung`}
                  wert={rolle.anweisung}
                  grenze={GRENZEN.anweisung}
                  zeilen={4}
                  platzhalter="Du bist mein … Achte darauf, dass …"
                  onWert={(anweisung) => onRolle({ ...rolle, anweisung })}
                />
              </Feldblock>
              <div className="flex items-center justify-between gap-2">
                {geaendert && onZuruecksetzen ? (
                  <button
                    type="button"
                    className="min-h-11 text-[13px] text-kreide-52 transition-colors hover:text-kreide"
                    onClick={onZuruecksetzen}
                  >
                    Vorlage wiederherstellen
                  </button>
                ) : onLoeschen ? (
                  <button
                    type="button"
                    className="min-h-11 text-[13px] text-kreide-52 transition-colors hover:text-kreide"
                    onClick={onLoeschen}
                  >
                    Rolle löschen
                  </button>
                ) : (
                  <span />
                )}
                <button
                  type="button"
                  className="min-h-11 rounded-[2px] border border-linie-hell px-4 text-[13px] font-semibold"
                  onClick={onUmschalten}
                >
                  fertig
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </li>
  )
}

function Feldblock({ label, fuer, children }: { label: string; fuer: string; children: ReactNode }) {
  return (
    <div>
      <label htmlFor={fuer} className="mb-1.5 block text-[12px] font-semibold text-kreide-60">
        {label}
      </label>
      {children}
    </div>
  )
}

/** ein schalter mit kleinen radien wie der rest der app, kein runder pillenknopf */
function Schalter({ an, farbe, label, onClick }: { an: boolean; farbe: string; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={an}
      aria-label={label}
      onClick={onClick}
      className="flex h-16 w-[62px] shrink-0 items-center justify-center"
    >
      <span
        className="relative block h-6 w-[42px] rounded-[3px] border transition-colors"
        style={{ borderColor: an ? farbe : 'var(--kontroll-rand)', background: an ? farbe : 'transparent' }}
      >
        <motion.span
          initial={false}
          animate={{ x: an ? 18 : 0 }}
          transition={{ type: 'spring', stiffness: 520, damping: 34 }}
          className="absolute left-[3px] top-[3px] block size-4 rounded-[2px]"
          style={{ background: an ? 'var(--grund)' : 'var(--kreide-60)' }}
        />
      </span>
    </button>
  )
}

/** ein textfeld, das mit dem text wächst */
function Textfeld({
  id,
  wert,
  grenze,
  zeilen,
  platzhalter,
  onWert,
}: {
  id: string
  wert: string
  grenze: number
  zeilen: number
  platzhalter: string
  onWert: (wert: string) => void
}) {
  const feld = useRef<HTMLTextAreaElement>(null)
  useLayoutEffect(() => {
    const f = feld.current
    if (!f) return
    f.style.height = 'auto'
    if (f.scrollHeight > 0) f.style.height = `${Math.min(f.scrollHeight + 2, 320)}px`
  }, [wert])
  return (
    <>
      <textarea
        ref={feld}
        id={id}
        rows={zeilen}
        className={`${FELD} resize-none leading-relaxed`}
        value={wert}
        maxLength={grenze}
        placeholder={platzhalter}
        onChange={(e) => onWert(e.target.value)}
      />
      {wert.length > grenze * 0.8 && (
        <span className="tnum mt-1 block text-right text-[11px] text-kreide-52">
          {wert.length}/{grenze}
        </span>
      )}
    </>
  )
}
