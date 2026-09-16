import { motion, useReducedMotion } from 'motion/react'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ladeWissen,
  loescheWissen,
  speichereWissen,
  WISSENS_ARTEN,
} from '../../lib/eniWissen'
import type { Erinnerung, WissensEntwurf } from '../../lib/eniWissen'
import { useScrollSperre } from '../../lib/scrollsperre'
import { IconX } from './EniSymbole'
import { useDialogNachlauf } from '../../lib/dialogNachlauf'

const LEER: WissensEntwurf = {
  text: '',
  art: 'profil',
  gemeinsam: false,
  bis: null,
  erledigt: false,
}

/**
 * Ein Eingabefeld traegt denselben Rahmen wie alles andere in der App: eine
 * Haarlinie auf dem Grund, zwei Pixel Radius, keine eigene Flaeche. Vorher
 * standen hier native Felder im Browserlook, und der Dialog sah aus wie aus
 * einer anderen App.
 */
const FELD =
  'min-h-11 w-full rounded-[2px] border border-linie bg-grund px-3 py-2 text-base text-kreide'
const LEISE = 'min-h-11 px-2 text-[12px] text-kreide-52 transition-colors hover:text-kreide disabled:opacity-40'

const API = {
  laden: ladeWissen,
  speichern: speichereWissen,
  loeschen: loescheWissen,
}

type Props = {
  offen: boolean
  kontoId: string | null
  start?: { text: string; art: Erinnerung['art'] }
  onSchliessen: () => void
  api?: typeof API
}

export function EniWissenDialog({
  offen,
  kontoId,
  start,
  onSchliessen,
  api = API,
}: Props) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [liste, setListe] = useState<Erinnerung[]>([])
  const [entwurf, setEntwurf] = useState<WissensEntwurf>(LEER)
  const [bearbeitet, setBearbeitet] = useState<Erinnerung | null>(null)
  const [fehler, setFehler] = useState<string | null>(null)
  const [status, setStatus] = useState('')
  const [laedt, setLaedt] = useState(false)
  const [arbeitet, setArbeitet] = useState(false)
  const ladeNr = useRef(0)
  const [loeschen, setLoeschen] = useState<string | null>(null)
  useScrollSperre(offen)

  const laden = useCallback(async () => {
    const nr = ++ladeNr.current
    setLaedt(true)
    setFehler(null)
    try {
      const neu = await api.laden()
      if (nr === ladeNr.current) setListe(neu)
    } catch (e) {
      if (nr === ladeNr.current) setFehler((e as Error).message)
    } finally {
      if (nr === ladeNr.current) setLaedt(false)
    }
  }, [api])

  useEffect(() => {
    if (offen) {
      dialog.current?.showModal()
      setListe([])
      setEntwurf({ ...LEER, ...start })
      setBearbeitet(null)
      setLoeschen(null)
      setStatus('')
      if (kontoId) void laden()
    } else dialog.current?.close()
    return () => {
      ladeNr.current++
    }
  }, [offen, kontoId, start, laden])

  /*
   * Ein aus dem Chat uebernommener Satz steht schon im Feld. Ohne Fokus liegt
   * er unterhalb der Liste ausserhalb des Bildes, und der Dialog sah aus, als
   * haette er die Uebernahme vergessen.
   */
  useEffect(() => {
    if (!offen || !start?.text) return
    const feld = dialog.current?.querySelector('textarea')
    feld?.focus()
    feld?.setSelectionRange(feld.value.length, feld.value.length)
  }, [offen, start])

  async function aendere(arbeit: () => Promise<void>, meldung: string) {
    if (arbeitet) return
    setArbeitet(true)
    setFehler(null)
    try {
      await arbeit()
      setStatus(meldung)
      await laden()
    } catch (e) {
      setFehler((e as Error).message)
    } finally {
      setArbeitet(false)
    }
  }

  // inhalt bleibt stehen, solange das blatt ausblendet
  const sichtbar = useDialogNachlauf(offen)
  const reduziert = useReducedMotion() ?? false

  return (
    <dialog
      ref={dialog}
      aria-label="Das weiß ENI über mich"
      onCancel={(e) => {
        e.preventDefault()
        if (!arbeitet) onSchliessen()
      }}
      className="m-0 h-[100dvh] max-h-none w-screen max-w-none bg-grund p-0 text-kreide backdrop:bg-grund/80 backdrop:backdrop-blur-sm"
    >
      {sichtbar && (
        <motion.div
          // Kein `exit`: das Blatt blendet als <dialog> per CSS aus, und ohne
          // ein umschliessendes AnimatePresence liefe ein exit ohnehin nie.
          // useDialogNachlauf haelt den Inhalt so lange stehen.
          initial={reduziert ? { opacity: 0 } : { opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
          className="vollbild-safe-x flex h-full flex-col pb-[calc(var(--app-safe-bottom)+1rem)] pt-[calc(var(--app-safe-top)+1rem)]"
        >
          <header className="mx-auto flex w-full max-w-[576px] items-center justify-between gap-2 border-b border-linie px-2 pb-3">
            <h2 className="display text-[16px] font-bold lowercase leading-none">
              das weiß ENI über mich
            </h2>
            <button
              className="-mr-2 flex size-11 shrink-0 items-center justify-center text-kreide-60 transition-colors hover:text-kreide"
              aria-label="Gedächtnis schließen"
              disabled={arbeitet}
              onClick={onSchliessen}
            >
              <IconX size={18} />
            </button>
          </header>

          {/*
            Die knopfzeilen darunter ziehen sich mit `-mx-2` nach aussen, damit
            ihre beschriftung an der spaltenkante steht. Ohne dieses padding
            wurden daraus 576 px in einer 560 px breiten spalte, und der dialog
            liess sich waagerecht schieben — am handy genauso.
          */}
          <div className="mx-auto w-full max-w-[576px] min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 py-4">
            <p className="text-[12px] leading-relaxed text-kreide-52">
              du bestimmst, was ENI in späteren chats berücksichtigen darf. privat,
              solange du einen eintrag nicht ausdrücklich teilst. änderungen gelten
              für künftige antworten; bereits geschriebene chats bleiben stehen.
            </p>

            {!kontoId ? (
              <p role="status" className="mt-6 text-[13px] text-kreide-60">
                melde dich an, um dein persönliches gedächtnis zu nutzen.
              </p>
            ) : (
              <>
                {/*
                  Fehler und Bestaetigung haben dieselbe Form wie im Chat: ein
                  Kasten mit Ueberschrift. Vorher stand beides als nackter Satz
                  zwischen Formular und Liste und las sich wie Fliesstext.
                */}
                {fehler && (
                  <div
                    role="alert"
                    aria-atomic="true"
                    className="mt-4 rounded-[2px] border border-linie bg-flaeche p-3"
                  >
                    <p className="text-[13px] font-bold">Das hat nicht geklappt</p>
                    <p className="mt-1 break-words text-[13px] leading-relaxed text-kreide-60">
                      {fehler}
                    </p>
                  </div>
                )}
                {status && (
                  <p
                    role="status"
                    className="mt-4 rounded-[2px] bg-flaeche px-3 py-2 text-[12px] leading-relaxed text-kreide-60"
                  >
                    {status}
                  </p>
                )}

                {/*
                  Was ENI schon weiss, steht oben. Die Frage des Dialogs lautet
                  „was weiss er ueber mich", nicht „was traegst du jetzt ein" —
                  vorher kam zuerst ein leeres Formular und die Antwort darunter.
                */}
                <div className="mt-7 flex items-baseline justify-between gap-2 border-b border-linie pb-2">
                  <h3 className="display text-[13px] font-bold lowercase">
                    was eni weiß
                  </h3>
                  <button
                    className={LEISE}
                    disabled={laedt || arbeitet}
                    onClick={() => void laden()}
                  >
                    neu laden
                  </button>
                </div>

                {laedt ? (
                  <p role="status" className="py-4 text-[13px] text-kreide-52">
                    lädt …
                  </p>
                ) : liste.length === 0 ? (
                  <p className="py-4 text-[13px] leading-relaxed text-kreide-52">
                    {fehler
                      ? 'nichts geladen.'
                      : 'noch nichts. fang mit einem ziel an oder damit, wie eni mit dir sprechen soll.'}
                  </p>
                ) : (
                  <ul className="divide-y divide-linie">
                    {liste.map((eintrag) => (
                      <li key={eintrag.id} className="space-y-1.5 py-3.5">
                        <p className="text-[11px] text-kreide-52">
                          {WISSENS_ARTEN[eintrag.art].toLowerCase()} ·{' '}
                          {eintrag.user_id !== kontoId
                            ? 'vom duellpartner geteilt'
                            : eintrag.gemeinsam
                              ? 'für euch beide'
                              : 'nur für dich'}
                          {eintrag.erledigt ? ' · erledigt' : ''}
                        </p>
                        <p className="whitespace-pre-wrap break-words text-[15px] leading-snug">
                          {eintrag.text}
                        </p>
                        <p className="text-[11px] text-kreide-52">
                          stand{' '}
                          {new Date(eintrag.geaendert).toLocaleDateString('de-DE')}
                          {eintrag.bis
                            ? ` · ${eintrag.art === 'aufgabe' ? 'fällig' : 'gültig bis'} ${new Date(`${eintrag.bis}T00:00:00`).toLocaleDateString('de-DE')}`
                            : ''}
                        </p>
                        {eintrag.user_id === kontoId && (
                          <div className="-mx-2 flex flex-wrap items-center">
                            <button
                              className={LEISE}
                              disabled={arbeitet}
                              onClick={() => {
                                setBearbeitet(eintrag)
                                setEntwurf({
                                  text: eintrag.text,
                                  art: eintrag.art,
                                  gemeinsam: eintrag.gemeinsam,
                                  bis: eintrag.bis,
                                  erledigt: eintrag.erledigt,
                                })
                                dialog.current?.querySelector('textarea')?.focus()
                              }}
                            >
                              bearbeiten
                            </button>
                            {eintrag.art === 'aufgabe' && (
                              <button
                                className={LEISE}
                                disabled={arbeitet}
                                onClick={() =>
                                  void aendere(
                                    () =>
                                      api.speichern(
                                        kontoId,
                                        { ...eintrag, erledigt: !eintrag.erledigt },
                                        eintrag.id,
                                        eintrag.geaendert,
                                      ),
                                    eintrag.erledigt
                                      ? 'Aufgabe wieder offen.'
                                      : 'Aufgabe erledigt.',
                                  )
                                }
                              >
                                {eintrag.erledigt ? 'wieder öffnen' : 'als erledigt markieren'}
                              </button>
                            )}
                            {loeschen === eintrag.id ? (
                              <>
                                <button
                                  className={`${LEISE} text-kreide`}
                                  disabled={arbeitet}
                                  onClick={() =>
                                    void aendere(
                                      () => api.loeschen(kontoId, eintrag.id),
                                      'Eintrag gelöscht. Bereits geschriebene Chats bleiben stehen.',
                                    )
                                  }
                                >
                                  endgültig löschen
                                </button>
                                <button className={LEISE} onClick={() => setLoeschen(null)}>
                                  behalten
                                </button>
                              </>
                            ) : (
                              <button
                                className={LEISE}
                                disabled={arbeitet}
                                onClick={() => setLoeschen(eintrag.id)}
                              >
                                löschen
                              </button>
                            )}
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                )}

                <form
                  className="mt-8 space-y-4 border-t border-linie pt-5"
                  onSubmit={(e) => {
                    e.preventDefault()
                    void aendere(async () => {
                      await api.speichern(
                        kontoId,
                        entwurf,
                        bearbeitet?.id,
                        bearbeitet?.geaendert,
                      )
                      setEntwurf(LEER)
                      setBearbeitet(null)
                    }, 'Gespeichert. ENI kann den Eintrag ab deiner nächsten Frage berücksichtigen.')
                  }}
                >
                  <h3 className="display text-[13px] font-bold lowercase">
                    {bearbeitet ? 'eintrag bearbeiten' : 'etwas hinzufügen'}
                  </h3>

                  {/*
                    Fuenf Arten als Klappliste hiessen: eine Auswahl, die man
                    erst oeffnen muss, um zu wissen, dass es sie gibt. Nebenein-
                    ander stehen sie da und die gewaehlte ist die gefuellte —
                    dieselbe Sprache wie eine gesetzte Marke im Raster.
                  */}
                  <fieldset className="space-y-2">
                    <legend className="text-[12px] text-kreide-52">bereich</legend>
                    <div className="flex flex-wrap gap-1.5">
                      {Object.entries(WISSENS_ARTEN).map(([key, text]) => {
                        const dran = entwurf.art === key
                        return (
                          <button
                            key={key}
                            type="button"
                            role="radio"
                            aria-checked={dran}
                            disabled={arbeitet}
                            onClick={() =>
                              setEntwurf({
                                ...entwurf,
                                art: key as Erinnerung['art'],
                                gemeinsam: key === 'stil' ? false : entwurf.gemeinsam,
                              })
                            }
                            className="min-h-11 rounded-[2px] border px-3 text-[13px] transition-colors disabled:opacity-40"
                            style={{
                              borderColor: dran ? 'var(--kreide)' : 'var(--linie-hell)',
                              background: dran ? 'var(--kreide)' : 'transparent',
                              color: dran ? 'var(--grund)' : 'var(--kreide-60)',
                              fontWeight: dran ? 600 : 400,
                            }}
                          >
                            {text.toLowerCase()}
                          </button>
                        )
                      })}
                    </div>
                  </fieldset>

                  <label className="block space-y-1.5 text-[12px] text-kreide-52">
                    deine angabe
                    <textarea
                      className={`${FELD} min-h-28`}
                      required
                      maxLength={1000}
                      value={entwurf.text}
                      disabled={arbeitet}
                      onChange={(e) => setEntwurf({ ...entwurf, text: e.target.value })}
                      placeholder={
                        entwurf.art === 'stil'
                          ? 'Direkt, aber bei persönlichen Sorgen erst zuhören.'
                          : entwurf.art === 'aufgabe'
                            ? 'Am Montag 20 Minuten Matheaufgaben üben.'
                            : 'Mein Ziel ist …'
                      }
                    />
                  </label>

                  <label className="block space-y-1.5 text-[12px] text-kreide-52">
                    {entwurf.art === 'aufgabe' ? 'fällig am (optional)' : 'gültig bis (optional)'}
                    <input
                      className={FELD}
                      type="date"
                      value={entwurf.bis ?? ''}
                      disabled={arbeitet}
                      onChange={(e) => setEntwurf({ ...entwurf, bis: e.target.value || null })}
                    />
                  </label>

                  {/*
                    Die Freigabe ist die folgenreichste Eingabe des Dialogs und
                    war eine graue Systemcheckbox. Sie traegt jetzt die Marke aus
                    dem Raster: leer ein Umriss, gesetzt eine volle Flaeche.
                  */}
                  {entwurf.art !== 'stil' && (
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={entwurf.gemeinsam}
                      disabled={arbeitet}
                      onClick={() =>
                        setEntwurf({ ...entwurf, gemeinsam: !entwurf.gemeinsam })
                      }
                      className="flex w-full items-start gap-3 py-1 text-left disabled:opacity-40"
                    >
                      <span className="flex size-11 shrink-0 items-center justify-center">
                        <span
                          className="block size-5 rounded-[2px] border transition-colors"
                          style={{
                            borderColor: entwurf.gemeinsam
                              ? 'var(--kreide)'
                              : 'var(--marke-rand)',
                            background: entwurf.gemeinsam ? 'var(--kreide)' : 'transparent',
                          }}
                        />
                      </span>
                      <span className="min-w-0 flex-1 pt-3 text-[13px] leading-snug text-kreide-60">
                        für uns beide freigeben. dein duellpartner und sein eni können
                        diesen eintrag lesen.
                      </span>
                    </button>
                  )}

                  {entwurf.art === 'aufgabe' && (
                    <p className="text-[12px] leading-relaxed text-kreide-52">
                      wird als aufgabe gespeichert. keine benachrichtigung, kein
                      trackerpunkt.
                    </p>
                  )}

                  <div className="-mx-2 flex flex-wrap items-center gap-1">
                    <button
                      className="mx-2 min-h-11 rounded-[2px] border px-4 text-[13px] font-semibold transition-colors"
                      style={
                        arbeitet || !entwurf.text.trim()
                          ? { borderColor: 'var(--linie-hell)', background: 'transparent', color: 'var(--kreide-52)' }
                          : { borderColor: 'var(--kreide)', background: 'var(--kreide)', color: 'var(--grund)' }
                      }
                      disabled={arbeitet || !entwurf.text.trim()}
                    >
                      {arbeitet ? 'speichert …' : 'bewusst speichern'}
                    </button>
                    {bearbeitet && (
                      <button
                        type="button"
                        className={LEISE}
                        disabled={arbeitet}
                        onClick={() => {
                          setBearbeitet(null)
                          setEntwurf(LEER)
                        }}
                      >
                        verwerfen
                      </button>
                    )}
                  </div>
                </form>
              </>
            )}
          </div>
        </motion.div>
      )}
    </dialog>
  )
}
