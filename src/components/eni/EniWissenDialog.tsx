import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import {
  ladeWissen,
  loescheWissen,
  speichereWissen,
  WISSENS_ARTEN,
} from '../../lib/eniWissen'
import type { Erinnerung, WissensEntwurf } from '../../lib/eniWissen'
import {
  ART_BEISPIEL,
  ART_HINWEIS,
  ART_KURZ,
  ART_REIHE,
  fristText,
  ordneWissen,
  passtZurSuche,
  standText,
} from '../../lib/eniWissenAnsicht'
import type { WissensAnsicht, WissensArt } from '../../lib/eniWissenAnsicht'
import { toKey } from '../../lib/dates'
import { EASE } from '../../lib/motion'
import { other } from '../../lib/types'
import type { UserId } from '../../lib/types'
import { fokusRingLoesen } from '../../lib/dialogFokus'
import { useScrollSperre } from '../../lib/scrollsperre'
import { useDialogNachlauf } from '../../lib/dialogNachlauf'
import { IconCaretDown, IconPlus, IconX } from './EniSymbole'
import { FELD, LEISE, Marke, WissensEditor } from './EniWissenEditor'
import type { Person } from './EniWissenEditor'

const LEER: WissensEntwurf = {
  text: '',
  art: 'profil',
  gemeinsam: false,
  bis: null,
  erledigt: false,
}

const API = {
  laden: ladeWissen,
  speichern: speichereWissen,
  loeschen: loescheWissen,
}

/** ab so vielen einträgen lohnt sich ein suchfeld */
const SUCHE_AB = 6

/** so lange bleibt eine erfolgsmeldung stehen; mit rückgängig etwas länger */
const MELDUNG_MS = 5000
const RUECKGAENGIG_MS = 9000

type Meldung = { art: 'ok' | 'fehler'; text: string; zurueck?: Erinnerung }

type Props = {
  offen: boolean
  kontoId: string | null
  /** wer schaut — daraus kommen name und farbe des anderen */
  me?: UserId
  start?: { text: string; art: Erinnerung['art'] }
  onSchliessen: () => void
  api?: typeof API
}

function entwurfAus(e: Erinnerung): WissensEntwurf {
  return { text: e.text, art: e.art, gemeinsam: e.gemeinsam, bis: e.bis, erledigt: e.erledigt }
}

/**
 * Das gedaechtnis als tafel, nicht als formular.
 *
 * Oben steht, wie viel ENI gerade mitliest, und in fuenf spalten, wovon — die
 * spalten sind zugleich der filter. Darunter die eintraege nach bereich,
 * schritte als abhakbare marken wie im raster. Was ENI nicht mehr liest,
 * erledigt oder abgelaufen, liegt eingeklappt unter „ruht": vorher stand es
 * gleichrangig zwischen dem, was gilt, und niemand konnte sehen, was ENI
 * davon ueberhaupt noch beruecksichtigt.
 *
 * Neues entsteht unten, wo im chat auch geschrieben wird. Bearbeitet wird an
 * ort und stelle: vorher sprang „bearbeiten" in ein formular ans ende der
 * liste, weit weg von dem eintrag, den man gerade meinte.
 */
export function EniWissenDialog({ offen, kontoId, me, start, onSchliessen, api = API }: Props) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [liste, setListe] = useState<Erinnerung[]>([])
  const [laedt, setLaedt] = useState(false)
  const [geladen, setGeladen] = useState(false)
  const [ladefehler, setLadefehler] = useState<string | null>(null)
  const [meldung, setMeldung] = useState<Meldung | null>(null)
  const [arbeitet, setArbeitet] = useState(false)
  const arbeitetRef = useRef(false)
  const [neu, setNeu] = useState<WissensEntwurf>(LEER)
  const [neuOffen, setNeuOffen] = useState(false)
  const [aenderung, setAenderung] = useState<{ eintrag: Erinnerung; entwurf: WissensEntwurf } | null>(
    null,
  )
  const [filter, setFilter] = useState<WissensArt | null>(null)
  const [suche, setSuche] = useState('')
  const [ruhtOffen, setRuhtOffen] = useState(false)
  const [halten, setHalten] = useState<ReadonlySet<string>>(new Set())
  const ladeNr = useRef(0)
  useScrollSperre(offen)

  const partner: Person = me
    ? { name: other(me).name, farbe: other(me).farbe }
    : { name: 'duellpartner', farbe: 'var(--kreide-60)' }

  /** `leise` lädt nach einer änderung nach, ohne die liste gegen „lädt …" zu tauschen */
  const laden = useCallback(
    async (leise = false) => {
      const nr = ++ladeNr.current
      if (!leise) setLaedt(true)
      try {
        const frisch = await api.laden()
        if (nr !== ladeNr.current) return
        setListe(frisch)
        setGeladen(true)
        setLadefehler(null)
      } catch (e) {
        if (nr === ladeNr.current) setLadefehler((e as Error).message)
      } finally {
        if (nr === ladeNr.current) setLaedt(false)
      }
    },
    [api],
  )

  useEffect(() => {
    if (offen) {
      if (!dialog.current?.open) dialog.current?.showModal()
      setListe([])
      setGeladen(false)
      setLadefehler(null)
      setMeldung(null)
      setNeu({ ...LEER, ...start })
      setNeuOffen(Boolean(start?.text))
      setAenderung(null)
      setFilter(null)
      setSuche('')
      setRuhtOffen(false)
      setHalten(new Set())
      if (kontoId) void laden()
    } else if (dialog.current?.open) {
      dialog.current.close()
      fokusRingLoesen()
    }
    return () => {
      ladeNr.current++
    }
  }, [offen, kontoId, start, laden])

  // eine erfolgsmeldung geht von selbst, ein fehler bleibt stehen
  useEffect(() => {
    if (meldung?.art !== 'ok') return
    const timer = window.setTimeout(
      () => setMeldung(null),
      meldung.zurueck ? RUECKGAENGIG_MS : MELDUNG_MS,
    )
    return () => window.clearTimeout(timer)
  }, [meldung])

  async function aendere(
    arbeit: () => Promise<void>,
    erfolg: Meldung,
    { zuruecksetzen = false } = {},
  ) {
    if (arbeitetRef.current) return
    arbeitetRef.current = true
    setArbeitet(true)
    setMeldung(null)
    try {
      await arbeit()
      setMeldung(erfolg)
      await laden(true)
    } catch (e) {
      setMeldung({ art: 'fehler', text: (e as Error).message })
      // eine vorab gezeigte änderung wird durch den echten stand ersetzt
      if (zuruecksetzen) await laden(true)
    } finally {
      arbeitetRef.current = false
      setArbeitet(false)
    }
  }

  const heute = toKey(new Date())
  const ansicht = useMemo(
    () => (kontoId ? ordneWissen(liste, kontoId, heute, halten) : null),
    [liste, kontoId, heute, halten],
  )
  const gefunden = useMemo(
    () =>
      kontoId && suche.trim()
        ? ordneWissen(
            liste.filter((e) => passtZurSuche(e, suche)),
            kontoId,
            heute,
            halten,
          )
        : ansicht,
    [liste, kontoId, heute, halten, suche, ansicht],
  )

  function oeffneNeu(art?: WissensArt) {
    setAenderung(null)
    setNeu((vorher) => {
      const gewaehlt = art ?? vorher.art
      return { ...vorher, art: gewaehlt, gemeinsam: gewaehlt === 'stil' ? false : vorher.gemeinsam }
    })
    setNeuOffen(true)
  }

  function bearbeite(e: Erinnerung) {
    setNeuOffen(false)
    setAenderung({ eintrag: e, entwurf: entwurfAus(e) })
  }

  function speichereNeu() {
    if (!kontoId) return
    const entwurf = neu
    void aendere(
      async () => {
        await api.speichern(kontoId, entwurf)
        setNeu({ ...LEER, art: entwurf.art })
        setNeuOffen(false)
        // ein filter auf einen anderen bereich hätte das neue gerade versteckt
        setFilter((vorher) => (vorher ? entwurf.art : null))
      },
      { art: 'ok', text: 'gemerkt. ENI liest das ab deiner nächsten frage mit.' },
    )
  }

  function speichereAenderung() {
    if (!kontoId || !aenderung) return
    const { eintrag, entwurf } = aenderung
    void aendere(
      async () => {
        await api.speichern(kontoId, entwurf, eintrag.id, eintrag.geaendert)
        setAenderung(null)
      },
      { art: 'ok', text: 'gespeichert. gilt ab deiner nächsten frage.' },
    )
  }

  function schalteErledigt(e: Erinnerung) {
    if (!kontoId || arbeitetRef.current) return
    const erledigt = !e.erledigt
    // die marke setzt sofort, gespeichert wird dahinter
    setListe((vorher) => vorher.map((x) => (x.id === e.id ? { ...x, erledigt } : x)))
    if (erledigt) setHalten((vorher) => new Set(vorher).add(e.id))
    void aendere(
      () => api.speichern(kontoId, { ...entwurfAus(e), erledigt }, e.id, e.geaendert),
      {
        art: 'ok',
        text: erledigt ? 'abgehakt. ENI kommt nicht mehr darauf zurück.' : 'wieder offen.',
      },
      { zuruecksetzen: true },
    )
  }

  function loesche(e: Erinnerung) {
    if (!kontoId) return
    void aendere(
      async () => {
        await api.loeschen(kontoId, e.id)
        setAenderung(null)
      },
      { art: 'ok', text: 'gelöscht. bereits geschriebene chats bleiben stehen.', zurueck: e },
    )
  }

  function holeZurueck(e: Erinnerung) {
    if (!kontoId) return
    void aendere(() => api.speichern(kontoId, entwurfAus(e)), { art: 'ok', text: 'wieder da.' })
  }

  // inhalt bleibt stehen, solange das blatt ausblendet
  const sichtbar = useDialogNachlauf(offen)
  const reduziert = useReducedMotion() ?? false

  const sucht = suche.trim() !== ''
  const leer = geladen && !ladefehler && liste.length === 0
  const zeigeListe = !!ansicht && liste.length > 0
  const abschnitte = gefunden
    ? gefunden.abschnitte.filter((a) => (filter ? a.art === filter : a.eintraege.length > 0))
    : []
  const ruht = gefunden ? gefunden.ruht.filter((e) => !filter || e.art === filter) : []
  const nichtsGefunden = sucht && abschnitte.every((a) => a.eintraege.length === 0) && ruht.length === 0
  // beim suchen steht auch das ruhende offen, sonst fände man es nie
  const ruhtSichtbar = ruhtOffen || sucht

  const zeile = (e: Erinnerung, ruhend: boolean) => (
    <EintragZeile
      key={e.id}
      eintrag={e}
      kontoId={kontoId!}
      heute={heute}
      partner={partner}
      ruhend={ruhend}
      reduziert={reduziert}
      arbeitet={arbeitet}
      bearbeitung={
        aenderung?.eintrag.id === e.id ? (
          <WissensEditor
            entwurf={aenderung.entwurf}
            onEntwurf={(entwurf) => setAenderung({ eintrag: e, entwurf })}
            neu={false}
            partner={partner}
            arbeitet={arbeitet}
            reduziert={reduziert}
            onSpeichern={speichereAenderung}
            onAbbrechen={() => setAenderung(null)}
            onLoeschen={() => loesche(e)}
            grund="var(--flaeche)"
          />
        ) : null
      }
      onBearbeiten={() => bearbeite(e)}
      onErledigt={() => schalteErledigt(e)}
    />
  )

  return (
    <dialog
      ref={dialog}
      aria-label="Das weiß ENI über mich"
      onCancel={(e) => {
        e.preventDefault()
        if (arbeitetRef.current) return
        // esc schliesst erst das, woran man gerade schreibt, dann das blatt
        if (aenderung) setAenderung(null)
        else if (neuOffen) setNeuOffen(false)
        else onSchliessen()
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
          transition={{ duration: 0.18, ease: EASE }}
          className="vollbild-safe-x flex h-full flex-col pb-[max(0.75rem,var(--app-safe-bottom))] pt-[calc(var(--app-safe-top)+1rem)]"
        >
          <header className="mx-auto flex w-full max-w-[560px] shrink-0 items-center justify-between gap-2 border-b border-linie pb-3">
            <h2 className="display text-[16px] font-bold lowercase leading-none">
              das weiß ENI über mich
            </h2>
            <button
              type="button"
              className="-mr-2 flex size-11 shrink-0 items-center justify-center text-kreide-60 transition-colors hover:text-kreide"
              aria-label="Gedächtnis schließen"
              disabled={arbeitet}
              onClick={onSchliessen}
            >
              <IconX size={18} />
            </button>
          </header>

          <div className="ohne-balken mx-auto w-full max-w-[560px] min-h-0 flex-1 overflow-y-auto overscroll-contain">
            {!kontoId ? (
              <p role="status" className="mt-6 text-[13px] text-kreide-60">
                melde dich an, um dein persönliches gedächtnis zu nutzen.
              </p>
            ) : (
              <>
                {ladefehler && (
                  <div role="alert" aria-atomic="true" className="mt-5 border-y border-linie bg-flaeche px-3 py-3">
                    <p className="text-[13px] font-bold">das gedächtnis ist gerade nicht lesbar</p>
                    <p className="mt-1 break-words text-[13px] leading-relaxed text-kreide-60">
                      {ladefehler}
                    </p>
                    <button
                      type="button"
                      className="-mx-2 mt-1 min-h-11 px-2 text-[12px] font-semibold text-kreide"
                      disabled={laedt}
                      onClick={() => void laden()}
                    >
                      {laedt ? 'lädt …' : 'erneut versuchen'}
                    </button>
                  </div>
                )}

                {!geladen && !ladefehler && (
                  <p role="status" className="pt-6 text-[13px] text-kreide-52">
                    lädt, was ENI über dich weiß …
                  </p>
                )}

                {leer && <Leer onStart={oeffneNeu} partner={partner} />}

                {zeigeListe && ansicht && (
                  <>
                    <Ueberblick
                      ansicht={ansicht}
                      partner={partner}
                      filter={filter}
                      onFilter={(art) => {
                        setFilter((vorher) => (vorher === art ? null : art))
                        setAenderung(null)
                      }}
                    />

                    {liste.length >= SUCHE_AB && (
                      <label className="mt-3 block">
                        <span className="sr-only">einträge durchsuchen</span>
                        <input
                          type="search"
                          className={FELD}
                          placeholder="durchsuchen"
                          value={suche}
                          onChange={(e) => setSuche(e.target.value)}
                        />
                      </label>
                    )}

                    {nichtsGefunden && (
                      <p className="pt-5 text-[13px] text-kreide-52">
                        nichts gefunden für „{suche.trim()}“.
                      </p>
                    )}

                    {abschnitte.map(({ art, eintraege }) => (
                      <section key={art} aria-labelledby={`wissen-${art}`} className="mt-7">
                        <div className="flex items-center justify-between gap-2 border-b border-linie">
                          <h3
                            id={`wissen-${art}`}
                            className="display flex items-baseline gap-2 py-2 text-[13px] font-bold lowercase"
                          >
                            {WISSENS_ARTEN[art].toLowerCase()}
                            <span className="tnum text-[12px] font-normal text-kreide-52">
                              {eintraege.length}
                            </span>
                          </h3>
                          {/*
                            keine negativen raender in der scrollspalte: was
                            ueber ihre kante ragt, macht sie waagerecht
                            schiebbar. das plus steht deshalb rechtsbuendig in
                            seiner flaeche statt mit -mr nach aussen gezogen.
                          */}
                          <span className="flex items-center">
                            {filter && (
                              <button type="button" className={LEISE} onClick={() => setFilter(null)}>
                                alle zeigen
                              </button>
                            )}
                            <button
                              type="button"
                              aria-label={`zu „${WISSENS_ARTEN[art].toLowerCase()}“ hinzufügen`}
                              disabled={arbeitet}
                              onClick={() => oeffneNeu(art)}
                              className="flex size-11 items-center justify-end text-kreide-52 transition-colors hover:text-kreide disabled:opacity-40"
                            >
                              <IconPlus size={15} />
                            </button>
                          </span>
                        </div>
                        {filter && (
                          <p className="pt-2 text-[12px] leading-relaxed text-kreide-52">
                            {ART_HINWEIS[art]}
                          </p>
                        )}
                        {eintraege.length === 0 ? (
                          <p className="py-4 text-[13px] text-kreide-52">
                            {sucht ? 'hier passt nichts zur suche.' : 'noch nichts in diesem bereich.'}
                          </p>
                        ) : (
                          <ul className="divide-y divide-linie">
                            <AnimatePresence initial={false}>
                              {eintraege.map((e) => zeile(e, false))}
                            </AnimatePresence>
                          </ul>
                        )}
                      </section>
                    ))}

                    {ruht.length > 0 && (
                      <section aria-labelledby="wissen-ruht" className="mt-9">
                        <h3 id="wissen-ruht">
                          <button
                            type="button"
                            aria-expanded={ruhtSichtbar}
                            onClick={() => setRuhtOffen((vorher) => !vorher)}
                            className="flex min-h-11 w-full items-center justify-between gap-2 border-b border-linie text-left"
                          >
                            <span className="display flex items-baseline gap-2 text-[13px] font-bold lowercase text-kreide-60">
                              ruht
                              <span className="tnum text-[12px] font-normal text-kreide-52">{ruht.length}</span>
                            </span>
                            <span className="flex items-center gap-1.5 text-[12px] text-kreide-52">
                              {ruhtSichtbar ? 'einklappen' : 'zeigen'}
                              <IconCaretDown
                                size={11}
                                className={`transition-transform ${ruhtSichtbar ? 'rotate-180' : ''}`}
                              />
                            </span>
                          </button>
                        </h3>
                        {ruhtSichtbar && (
                          <>
                            <p className="pt-2 text-[12px] leading-relaxed text-kreide-52">
                              erledigt oder abgelaufen. ENI liest das nicht mehr mit. ein neues datum
                              oder wieder öffnen holt es zurück.
                            </p>
                            <ul className="divide-y divide-linie">
                              <AnimatePresence initial={false}>
                                {ruht.map((e) => zeile(e, true))}
                              </AnimatePresence>
                            </ul>
                          </>
                        )}
                      </section>
                    )}
                  </>
                )}
              </>
            )}
            {/* abstand als element, nicht als padding: sonst klebt die knopfzeile
                einer bearbeitung um das padding zu hoch, und darunter scheint
                der rest des formulars durch */}
            <div aria-hidden="true" className="h-6" />
          </div>

          {kontoId && (
            <div className="mx-auto w-full max-w-[560px] shrink-0">
              <AnimatePresence initial={false}>
                {meldung && (
                  <motion.div
                    key={`${meldung.art}-${meldung.text}`}
                    role={meldung.art === 'fehler' ? 'alert' : 'status'}
                    initial={reduziert ? { opacity: 0 } : { opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.16, ease: EASE }}
                    className="flex min-h-11 items-center gap-2 border-t border-linie py-1 pl-0.5"
                  >
                    {meldung.art === 'fehler' && (
                      <span className="shrink-0 text-[12px] font-bold text-kreide">nicht geklappt:</span>
                    )}
                    <span className="min-w-0 flex-1 break-words text-[12px] leading-snug text-kreide-60">
                      {meldung.text}
                    </span>
                    {meldung.zurueck && (
                      <button
                        type="button"
                        className="min-h-11 shrink-0 px-2 text-[12px] font-semibold text-kreide"
                        disabled={arbeitet}
                        onClick={() => holeZurueck(meldung.zurueck!)}
                      >
                        rückgängig
                      </button>
                    )}
                    <button
                      type="button"
                      aria-label="meldung schließen"
                      className="-mr-2 flex size-11 shrink-0 items-center justify-center text-kreide-52 hover:text-kreide"
                      onClick={() => setMeldung(null)}
                    >
                      <IconX size={14} />
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>

              {neuOffen ? (
                <div className="ohne-balken max-h-[72dvh] overflow-y-auto overscroll-contain border-t border-linie-hell pt-3">
                  <WissensEditor
                    entwurf={neu}
                    onEntwurf={setNeu}
                    neu
                    partner={partner}
                    arbeitet={arbeitet}
                    reduziert={reduziert}
                    onSpeichern={speichereNeu}
                    onAbbrechen={() => {
                      setNeu(LEER)
                      setNeuOffen(false)
                    }}
                  />
                </div>
              ) : (
                <div className="border-t border-linie pt-3">
                  <button
                    type="button"
                    disabled={arbeitet}
                    // ein entwurf behält seinen bereich, ein leeres feld nimmt den gefilterten
                    onClick={() => oeffneNeu(neu.text ? undefined : (filter ?? undefined))}
                    className="flex min-h-12 w-full items-center gap-3 rounded-[2px] border border-linie bg-flaeche px-3.5 text-left transition-colors hover:border-linie-hell disabled:opacity-60"
                  >
                    <IconPlus size={16} className="shrink-0 text-kreide-60" />
                    <span
                      className={`min-w-0 flex-1 truncate text-[15px] ${neu.text ? 'text-kreide' : 'text-kreide-52'}`}
                    >
                      {neu.text || 'was soll ENI sich merken?'}
                    </span>
                    {neu.text && <span className="shrink-0 text-[11px] text-kreide-52">entwurf</span>}
                  </button>
                </div>
              )}
            </div>
          )}
        </motion.div>
      )}
    </dialog>
  )
}

/**
 * Die zahl oben ist die antwort auf die frage des dialogs: so viel liest ENI
 * gerade mit. Die fuenf spalten darunter sagen, wovon — und filtern beim
 * tippen, wie eine tabelle, deren kopf man anfasst.
 */
function Ueberblick({
  ansicht,
  partner,
  filter,
  onFilter,
}: {
  ansicht: WissensAnsicht
  partner: Person
  filter: WissensArt | null
  onFilter: (art: WissensArt) => void
}) {
  const teile = [
    ansicht.geteilt > 0 && `${ansicht.geteilt} davon teilst du mit ${partner.name}`,
    ansicht.fremd > 0 && `${ansicht.fremd} von ${partner.name}`,
    ansicht.ruht.length > 0 && `${ansicht.ruht.length} ${ansicht.ruht.length === 1 ? 'ruht' : 'ruhen'}`,
  ].filter(Boolean)
  return (
    <section aria-label="überblick" className="pt-5">
      <div className="flex items-end gap-3">
        <span className="display tnum text-[52px] font-bold leading-[0.8]">{ansicht.aktiv}</span>
        <span className="pb-px text-[13px] leading-tight text-kreide-60">
          {ansicht.aktiv === 1 ? 'eintrag liest' : 'einträge liest'} ENI
          <br />
          bei persönlichen fragen mit
        </span>
      </div>
      {teile.length > 0 && <p className="mt-2.5 text-[12px] text-kreide-52">{teile.join(' · ')}</p>}
      <div role="group" aria-label="nach bereich filtern" className="mt-4 grid grid-cols-5 border-y border-linie">
        {ART_REIHE.map((art) => {
          const an = filter === art
          const n = ansicht.zahlen[art]
          return (
            <button
              key={art}
              type="button"
              aria-pressed={an}
              aria-label={`${WISSENS_ARTEN[art].toLowerCase()}: ${n}`}
              onClick={() => onFilter(art)}
              className="flex min-h-[62px] flex-col items-start justify-between border-l border-linie px-2 py-2 text-left transition-colors first:border-l-0 hover:bg-flaeche"
              style={an ? { background: 'var(--kreide)', color: 'var(--grund)' } : undefined}
            >
              <span
                className="display tnum text-[22px] font-bold leading-none"
                style={an ? undefined : { color: n > 0 ? 'var(--kreide)' : 'var(--kreide-52)' }}
              >
                {n}
              </span>
              <span className="text-[11px] leading-none" style={an ? undefined : { color: 'var(--kreide-60)' }}>
                {ART_KURZ[art]}
              </span>
            </button>
          )
        })}
      </div>
      <p className="mt-2.5 text-[12px] leading-relaxed text-kreide-52">
        bei einer persönlichen frage sucht ENI bis zu zwölf passende einträge heraus, dein ton steht
        immer vorn. privat, bis du etwas teilst.
      </p>
    </section>
  )
}

/** der leere zustand lädt ein: drei anfänge statt eines leeren formulars */
function Leer({ onStart, partner }: { onStart: (art: WissensArt) => void; partner: Person }) {
  const anfaenge: { art: WissensArt; text: string }[] = [
    { art: 'stil', text: 'wie ENI mit dir reden soll' },
    { art: 'profil', text: 'woran du gerade arbeitest' },
    { art: 'aufgabe', text: 'was du als nächstes angehst' },
  ]
  return (
    <div className="pt-6">
      <p className="display text-[26px] font-bold leading-[1.05]">ENI weiß noch nichts über dich.</p>
      <p className="mt-2 max-w-[36ch] text-[13px] leading-5 text-kreide-60">
        was du hier festhältst, liest ENI bei persönlichen fragen mit. privat, bis du es mit{' '}
        {partner.name} teilst.
      </p>
      <ul className="mt-5 divide-y divide-linie border-y border-linie">
        {anfaenge.map(({ art, text }) => (
          <li key={art}>
            <button
              type="button"
              onClick={() => onStart(art)}
              className="flex min-h-14 w-full items-center justify-between gap-3 py-2 text-left"
            >
              <span className="min-w-0">
                <span className="block text-[15px] font-semibold text-kreide">{text}</span>
                <span className="block text-[12px] text-kreide-52">etwa: „{ART_BEISPIEL[art]}“</span>
              </span>
              <IconPlus size={16} className="shrink-0 text-kreide-60" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

function EintragZeile({
  eintrag,
  kontoId,
  heute,
  partner,
  ruhend,
  reduziert,
  arbeitet,
  bearbeitung,
  onBearbeiten,
  onErledigt,
}: {
  eintrag: Erinnerung
  kontoId: string
  heute: string
  partner: Person
  ruhend: boolean
  reduziert: boolean
  arbeitet: boolean
  bearbeitung: ReactNode
  onBearbeiten: () => void
  onErledigt: () => void
}) {
  const meins = eintrag.user_id === kontoId
  const frist = fristText(eintrag, heute)
  const aufgabe = eintrag.art === 'aufgabe'
  const leise = ruhend || eintrag.erledigt

  const meta = (
    <span className="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] leading-tight text-kreide-52">
      {ruhend && <span>{WISSENS_ARTEN[eintrag.art].toLowerCase()} ·</span>}
      {frist && (
        <span className={frist.dringend ? 'font-bold text-kreide' : undefined}>{frist.text} ·</span>
      )}
      {meins ? (
        eintrag.gemeinsam ? (
          <span className="flex items-center gap-1">
            <span
              aria-hidden="true"
              className="inline-block size-[7px] rounded-[1px]"
              style={{ background: partner.farbe }}
            />
            mit {partner.name} geteilt ·
          </span>
        ) : (
          <span>nur für dich ·</span>
        )
      ) : (
        <span>von {partner.name} ·</span>
      )}
      <span>{standText(eintrag.geaendert, heute)}</span>
    </span>
  )

  const text = (
    <span
      className={`block whitespace-pre-wrap break-words text-[15px] leading-snug transition-colors ${
        leise ? 'text-kreide-60' : 'text-kreide'
      } ${eintrag.erledigt ? 'line-through decoration-kreide-52' : ''}`}
    >
      {eintrag.text}
    </span>
  )

  return (
    <motion.li
      layout={reduziert ? false : 'position'}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.16, ease: EASE }}
      className="relative"
    >
      {bearbeitung ? (
        <div className="my-2 rounded-[2px] border border-linie-hell bg-flaeche px-3 py-3">{bearbeitung}</div>
      ) : !meins ? (
        // geteiltes vom anderen: lesen ja, ändern nein. die kante trägt seine farbe.
        <div className="border-l-2 py-3.5 pl-3" style={{ borderColor: partner.farbe }}>
          {text}
          {meta}
        </div>
      ) : (
        <div className="flex items-start">
          {aufgabe && (
            <button
              type="button"
              role="checkbox"
              aria-checked={eintrag.erledigt}
              aria-label={`erledigt: ${eintrag.text}`}
              disabled={arbeitet}
              onClick={onErledigt}
              className="flex h-12 w-10 shrink-0 items-center justify-start self-start disabled:cursor-wait"
            >
              <Marke an={eintrag.erledigt} reduziert={reduziert} />
            </button>
          )}
          <button
            type="button"
            disabled={arbeitet}
            onClick={onBearbeiten}
            aria-label={`bearbeiten: ${eintrag.text}`}
            className="min-w-0 flex-1 py-3.5 text-left transition-opacity disabled:cursor-wait active:opacity-70"
          >
            {text}
            {meta}
          </button>
        </div>
      )}
    </motion.li>
  )
}
