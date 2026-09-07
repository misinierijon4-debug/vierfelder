import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { CalendarBlank } from '@phosphor-icons/react'
import { AREAS, other, user as userDef } from './lib/types'
import type { AppTab, AreaId, UserId } from './lib/types'
import type { Backend } from './lib/backend'
import { bauKurz, fromKey, istBilanzzeit, toKey, weekDays } from './lib/dates'
import { istSelbeWoche, wochenZeitraum } from './lib/kalender'
import { useTracker } from './lib/store'
import { lokalWechseln, lokalesBackend, lokalesMe } from './lib/lokal'
import { abmelden, hatSupabase, supabaseBackend, useSession } from './lib/supabase'
import {
  abstand,
  anzahlEinheiten,
  hatTageswert,
  istGesetzt,
  letzteEinheit,
  messungsMinuten,
  quelle,
  streak,
  tagesWert,
  wocheBereich,
  wocheGesamt,
} from './lib/tracker'
import { Kopf } from './components/Kopf'
import { Bereichszeile } from './components/Bereichszeile'
import { Raster } from './components/Raster'
import { Tagesdetail } from './components/Tagesdetail'
import type { Tagesauswahl } from './components/Tagesdetail'
import { TrackerKalender } from './components/TrackerKalender'
import { Anmeldung } from './components/Anmeldung'
import {
  HAUPTBEREICH_PANEL_ID,
  hauptbereichTabId,
  TabLeiste,
} from './components/TabLeiste'
import { SchlafTab } from './components/schlaf/SchlafTab'
import { DuellTab } from './components/duell/DuellTab'
import { NotenTab } from './components/noten/NotenTab'
import { RivalitaetsTicker } from './components/duell/RivalitaetsTicker'
import { Benachrichtigungen } from './components/Benachrichtigungen'
import { Gewichtszeile } from './components/Gewichtszeile'
import { Gewichtsdiagramm } from './components/Gewichtsdiagramm'
import { gewichtAn, letztesGewicht } from './lib/gewicht'
import { abrechnungFuerWoche, berechneDuell, fehlendeAbschlussWochen } from './lib/duell'

const UNDO_MS = 5000

export function App() {
  const { status, session, fehler, erneut } = useSession()
  const [wechselNr, setWechselNr] = useState(0)

  /**
   * am konto festmachen, nicht am session-objekt: getSession() und
   * onAuthStateChange liefern beide dieselbe anmeldung, aber als zwei
   * verschiedene objekte. daran hing bisher ein zweites, überflüssiges laden.
   */
  const kontoId = session?.user.id ?? null

  const backend = useMemo<Backend | null>(() => {
    if (!hatSupabase) return lokalesBackend()
    return kontoId ? supabaseBackend(kontoId) : null
    // wechselNr erzwingt beim nutzerwechsel im prototyp ein neues laden
  }, [kontoId, wechselNr])

  if (hatSupabase && status === 'laden') return <AppStartzustand status="laden" />
  if (hatSupabase && status === 'fehler') {
    return <AppStartzustand status="fehler" fehler={fehler} onErneut={erneut} />
  }
  if (hatSupabase && !session) return <Anmeldung />
  if (!backend) return <AppStartzustand status="fehler" fehler="anmeldung konnte nicht gelesen werden." />

  const trackerKey = backend.art === 'supabase' ? `supabase:${kontoId}` : `lokal:${wechselNr}`
  return (
    <Tracker
      key={trackerKey}
      backend={backend}
      onWechsel={() => setWechselNr((n) => n + 1)}
    />
  )
}

function Tracker({ backend, onWechsel }: { backend: Backend; onWechsel: () => void }) {
  const {
    me,
    zustand,
    schlaf,
    phasenLadezustaende,
    wetten,
    abrechnungen,
    abrechnungStatus,
    notenstand,
    ladezustand,
    synchronisationszustand,
    fehler,
    ereignis,
    altbestand,
    einheitVonVerfuegbar,
    toggle,
    einheitHinzu,
    einheitWeg,
    rueckgaengig,
    wertAendern,
    wertSetzen,
    zeitSetzen,
    setzeGewicht,
    setzeWette,
    abrechnungHinzu,
    setzePruefungsfach,
    noteHinzu,
    noteLoeschen,
    noteWiederherstellen,
    phasenNachladen,
    phasenNeuLaden,
    ladenNeu,
  } = useTracker(backend)
  const bereit = ladezustand === 'bereit'
  const [heute, setHeute] = useState(() => new Date())
  const [aktiverTab, setAktiverTab] = useState<AppTab>('tracker')
  const [undoFuer, setUndoFuer] = useState<AreaId | null>(null)
  const [detail, setDetail] = useState<Tagesauswahl | null>(null)
  const [kalenderOffen, setKalenderOffen] = useState(false)
  /**
   * der tag, den das raster zeigt. `null` heißt heute — so wandert die ansicht
   * um mitternacht von allein mit, statt auf einem datum stehen zu bleiben.
   */
  const [blick, setBlick] = useState<string | null>(null)
  const rasterRef = useRef<HTMLDivElement>(null)

  const wechsleTabMitFokus = useCallback((tab: AppTab) => {
    setAktiverTab(tab)
    window.requestAnimationFrame(() => {
      document.getElementById(hauptbereichTabId(tab))?.focus()
    })
  }, [])

  const heuteKey = useMemo(() => toKey(heute), [heute])
  const woche = useMemo(() => weekDays(heute), [heute])
  const gewaehlterTag = blick ?? heuteKey
  const sichtbareWoche = useMemo(() => weekDays(fromKey(gewaehlterTag)), [gewaehlterTag])
  const dieseWoche = istSelbeWoche(sichtbareWoche, woche)
  const match = useMemo(
    () => berechneDuell(zustand, woche, heuteKey, me),
    [zustand, woche, heuteKey, me]
  )
  const ich = userDef(me)
  const er = other(me)
  const abrechnungDerWoche = abrechnungen.find((a) => a.woche === (woche[0] ?? heuteKey)) ?? null
  const abrechnungDerWocheStatus = abrechnungDerWoche
    ? 'gespeichert' as const
    : abrechnungStatus[woche[0] ?? heuteKey] ?? 'idle'
  const nachzuholendeWochen = useMemo(
    () => fehlendeAbschlussWochen(zustand, wetten, abrechnungen, heute),
    [zustand, wetten, abrechnungen, heute]
  )
  const nachholWoche = nachzuholendeWochen[0] ?? null
  const nachholStatus = nachholWoche ? abrechnungStatus[nachholWoche] ?? 'idle' : 'idle'

  const holeWocheNach = useCallback((wocheKey: string) => {
    const tage = weekDays(fromKey(wocheKey))
    abrechnungHinzu(abrechnungFuerWoche(zustand, tage, wetten[wocheKey] ?? null))
  }, [abrechnungHinzu, zustand, wetten])

  // Immer nur die aelteste belegte Luecke: Nach kanonischer Bestaetigung wird
  // sie Teil des Archivs und der naechste Render nimmt erst dann die naechste.
  useEffect(() => {
    if (!bereit || backend.art !== 'supabase' || !nachholWoche || nachholStatus !== 'idle') return
    holeWocheNach(nachholWoche)
  }, [backend.art, bereit, holeWocheNach, nachholStatus, nachholWoche])

  // datumswechsel und das sonntagsfinale um 18 uhr, ohne die app neu zu öffnen.
  // ein neues date-objekt kommt nur, wenn sich tag oder bilanzzeit ändern —
  // sonst hinge an jedem takt ein render der ganzen app.
  useEffect(() => {
    const pruefe = () =>
      setHeute((vorher) => {
        const jetzt = new Date()
        const gleich =
          toKey(jetzt) === toKey(vorher) && istBilanzzeit(jetzt) === istBilanzzeit(vorher)
        return gleich ? vorher : jetzt
      })
    const timer = window.setInterval(pruefe, 30_000)
    document.addEventListener('visibilitychange', pruefe)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', pruefe)
    }
  }, [])

  // rückgängig steht fünf sekunden in der zeile, die du zuletzt angefasst hast
  useEffect(() => {
    if (!ereignis || ereignis.quelle !== 'selbst') return
    setUndoFuer(ereignis.area)
    const timer = window.setTimeout(() => setUndoFuer(null), UNDO_MS)
    return () => window.clearTimeout(timer)
  }, [ereignis])

  const zurueck = (area: AreaId) => {
    rueckgaengig(area, heuteKey)
    setUndoFuer(null)
  }

  /** die sonntagsabrechnung dieser woche aus den tracker-daten bauen und archivieren */
  const schliesseWocheAb = () => {
    if (!bereit || !istBilanzzeit(heute) || abrechnungDerWoche) return
    const wocheKey = woche[0] ?? heuteKey
    const abr = abrechnungFuerWoche(zustand, woche, wetten[wocheKey] ?? null)
    abrechnungHinzu(abr)
  }

  const loescheEinheitById = (id: string) => {
    const e = Object.values(zustand.einheiten)
      .flat()
      .find((x) => x.id === id)
    if (e) einheitWeg(e)
  }

  const sichtbarLeer = wocheGesamt(zustand, me, sichtbareWoche) === 0
  const rasterTitel = dieseWoche
    ? sichtbarLeer
      ? 'noch nichts diese woche'
      : 'woche'
    : `woche ${wochenZeitraum(sichtbareWoche)}`

  /** ein tag aus dem kalender führt zu seiner woche und scrollt sie ins bild */
  const waehleTag = (tag: string) => {
    setBlick(tag === heuteKey ? null : tag)
    setKalenderOffen(false)
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => rasterRef.current?.scrollIntoView({ block: 'start' }))
    })
  }

  if (!bereit) {
    return (
      <AppStartzustand
        status={ladezustand === 'fehler' ? 'fehler' : 'laden'}
        fehler={fehler}
        onErneut={ladenNeu}
        onAbmelden={backend.art === 'supabase' ? abmelden : undefined}
      />
    )
  }

  const synchronisationstext = backend.art === 'supabase'
    ? synchronisationszustand === 'verbindet'
      ? 'live-verbindung wird hergestellt'
      : synchronisationszustand === 'abgleichen'
        ? 'daten werden abgeglichen'
        : synchronisationszustand === 'veraltet'
          ? 'stand möglicherweise veraltet · erneuter abgleich folgt automatisch'
          : null
    : null

  return (
    <div className="min-h-[100dvh] bg-grund">
      <main className="app-frame mx-auto w-full max-w-[420px]">
        <Kopf
          heute={heute}
          woche={woche}
          zustand={zustand}
          me={me}
          match={match}
          bilanzzeit={istBilanzzeit(heute)}
        />

        {/* Tab-Navigation */}
        <TabLeiste aktiverTab={aktiverTab} onTabWechsel={setAktiverTab} />

        {/* mindestens eine zeile freihalten; lange statusmeldungen duerfen bei
            grosser schrift umbrechen, statt abgeschnitten zu werden. */}
        <div className="flex min-h-5 items-start">
          <AnimatePresence mode="wait" initial={false}>
            {fehler ? (
              <motion.p
                key={fehler}
                role="alert"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.14 }}
                className="text-[12px]"
                style={{ color: 'var(--erijon)' }}
              >
                {fehler}
              </motion.p>
            ) : synchronisationstext ? (
              <motion.p
                key={synchronisationszustand}
                role="status"
                aria-live="polite"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.14 }}
                className="text-[11px] text-kreide-52"
              >
                {synchronisationstext}
              </motion.p>
            ) : null}
          </AnimatePresence>
        </div>

        {backend.art === 'supabase' && nachholWoche && nachholStatus !== 'idle' && (
          <p
            className="mb-2 flex min-h-8 items-center justify-between gap-3 border border-linie px-2 text-[11px]"
            aria-live="polite"
          >
            <span>
              {nachholStatus === 'speichern'
                ? `woche ${nachholWoche} wird sicher abgeschlossen`
                : `woche ${nachholWoche} konnte nicht abgeschlossen werden`}
            </span>
            {nachholStatus === 'fehler' && (
              <button
                type="button"
                className="min-h-11 shrink-0 px-1 underline underline-offset-2"
                onClick={() => holeWocheNach(nachholWoche)}
              >
                erneut
              </button>
            )}
          </p>
        )}

        {/* Tab-Inhalte bleiben bis zum vollstaendigen Erstladen inert. So kann
            kein leerer Zwischenstand als echte Mutation gespeichert werden. */}
        <div
          id={HAUPTBEREICH_PANEL_ID}
          role="tabpanel"
          aria-labelledby={hauptbereichTabId(aktiverTab)}
          tabIndex={0}
          inert={!bereit}
          aria-busy={!bereit}
        >
          <AnimatePresence mode="wait">
          {aktiverTab === 'tracker' ? (
            <motion.div
              key="tab-tracker"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.18 }}
            >
              <RivalitaetsTicker zustand={zustand} woche={woche} me={me} kompakt={true} />

              <section
                aria-label="heute eintragen"
                className="mt-2 border-t border-linie"
              >
                {AREAS.map((area, i) => {
                  // die schritte gelten der neuesten einheit, die zahl zwischen
                  // ihnen dem ganzen tag
                  const letzte = letzteEinheit(zustand, me, area.id, heuteKey)
                  return (
                    <Bereichszeile
                      key={area.id}
                      area={area}
                      index={i}
                      gesetzt={istGesetzt(zustand, me, area.id, heuteKey)}
                      wocheIch={wocheBereich(zustand, me, area.id, woche)}
                      abstand={abstand(zustand, area.id, woche, me, er.id)}
                      streak={streak(zustand, me, area.id, heute)}
                      wert={tagesWert(zustand, me, area.id, heuteKey)}
                      hatWert={hatTageswert(zustand, me, area.id, heuteKey)}
                      einheitWert={letzte?.wert ?? 0}
                      anzahl={anzahlEinheiten(zustand, me, area.id, heuteKey)}
                      mehrfachMoeglich={!altbestand}
                      quelle={quelle(zustand, me, area.id, heuteKey)}
                      einheitVon={letzte?.von ?? null}
                      // bei zwei sitzungen an einem tag steht dort die summe,
                      // nicht die längere von beiden
                      messungMinuten={messungsMinuten(zustand, me, area.id, heuteKey)}
                      farbe={ich.farbe}
                      farbeEr={er.farbe}
                      zeigeUndo={undoFuer === area.id}
                      disabled={!bereit}
                      onTap={() => toggle(area.id, heuteKey)}
                      onUndo={() => zurueck(area.id)}
                      onNeueEinheit={() => einheitHinzu(area.id, heuteKey)}
                      onWert={(delta) => wertAendern(area.id, heuteKey, delta)}
                    />
                  )
                })}
              </section>

              <div ref={rasterRef}>
                {/* der weg in die vergangenheit sitzt über dem raster, weil das
                    raster die woche ist, die er verschiebt */}
                <div className="mt-6 flex items-center justify-end gap-2">
                  <AnimatePresence initial={false}>
                    {!dieseWoche && (
                      <motion.button
                        key="heute"
                        type="button"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.14 }}
                        onClick={() => setBlick(null)}
                        className="text-[12px] text-kreide-60 underline decoration-linie-hell underline-offset-4"
                      >
                        zurück zu heute
                      </motion.button>
                    )}
                  </AnimatePresence>

                  <button
                    type="button"
                    aria-label="kalender öffnen"
                    aria-haspopup="dialog"
                    onClick={() => setKalenderOffen(true)}
                    className="flex size-11 items-center justify-center rounded-full border border-linie bg-flaeche text-kreide transition-colors duration-150 hover:border-linie-hell focus-visible:outline-none"
                  >
                    <CalendarBlank size={21} weight="bold" aria-hidden="true" />
                  </button>
                </div>

                <Raster
                  zustand={zustand}
                  woche={sichtbareWoche}
                  heute={heuteKey}
                  ereignis={ereignis}
                  titel={rasterTitel}
                  gewaehlterTag={gewaehlterTag}
                  onZelle={(user, area, tag) => setDetail({ user, area, tag })}
                />
              </div>

              {/* gewicht ist eine messung statt eines ticks und steht deshalb
                  zusammen mit seinem verlauf unter dem wochenraster */}
              <Gewichtszeile
                kg={gewichtAn(zustand.gewichte, me, heuteKey)}
                letzte={letztesGewicht(zustand.gewichte, me)}
                kgEr={gewichtAn(zustand.gewichte, er.id, heuteKey)}
                nameEr={er.name}
                farbe={ich.farbe}
                farbeEr={er.farbe}
                streak={streak(zustand, me, 'gewicht', heute)}
                quelle={quelle(zustand, me, 'gewicht', heuteKey)}
                onSetze={(kg) => setzeGewicht(heuteKey, kg)}
              />

              <Gewichtsdiagramm gewichte={zustand.gewichte} heute={heuteKey} />
            </motion.div>
          ) : aktiverTab === 'duell' ? (
            <motion.div
              key="tab-duell"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.18 }}
            >
              <DuellTab
                zustand={zustand}
                woche={woche}
                me={me}
                heute={heute}
                match={match}
                wette={wetten[woche[0] ?? heuteKey] ?? ''}
                onWette={(text) => setzeWette(woche[0] ?? heuteKey, text)}
                onZumTracker={() => wechsleTabMitFokus('tracker')}
                abrechnung={abrechnungDerWoche}
                abrechnungen={abrechnungen}
                abschlussStatus={abrechnungDerWocheStatus}
                onAbschluss={bereit ? schliesseWocheAb : undefined}
              />
            </motion.div>
          ) : aktiverTab === 'schlaf' ? (
            <motion.div
              key="tab-schlaf"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.18 }}
            >
              <SchlafTab
                naechte={schlaf}
                woche={woche}
                heuteKey={heuteKey}
                me={me}
                istPrototyp={backend.art === 'lokal'}
                phasenLadezustaende={phasenLadezustaende}
                onVerlaufBrauchen={phasenNachladen}
                onVerlaufErneut={phasenNeuLaden}
              />
            </motion.div>
          ) : (
            <motion.div
              key="tab-noten"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.18 }}
            >
              <NotenTab
                stand={notenstand}
                me={me}
                heute={heuteKey}
                onPruefungsfach={setzePruefungsfach}
                onNote={noteHinzu}
                onNoteLoeschen={noteLoeschen}
                onNoteWiederherstellen={noteWiederherstellen}
              />
            </motion.div>
          )}
          </AnimatePresence>

          {bereit && <Benachrichtigungen />}
        </div>

        <Fusszeile art={backend.art} me={me} onWechsel={onWechsel} />
      </main>

      <TrackerKalender
        offen={kalenderOffen}
        zustand={zustand}
        me={me}
        gewaehlterTag={gewaehlterTag}
        heuteKey={heuteKey}
        onTagWaehlen={waehleTag}
        onSchliessen={() => setKalenderOffen(false)}
      />

      <AnimatePresence>
        {detail && (
          <Tagesdetail
            zustand={zustand}
            auswahl={detail}
            heute={heuteKey}
            editierbar={bereit && detail.tag === heuteKey && !altbestand}
            zeitEditierbar={bereit && einheitVonVerfuegbar}
            eigene={detail.user === me}
            onWertSetzen={wertSetzen}
            onZeitSetzen={zeitSetzen}
            onLoeschen={loescheEinheitById}
            onSchliessen={() => setDetail(null)}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

export function AppStartzustand({
  status,
  fehler = null,
  onErneut,
  onAbmelden,
}: {
  status: 'laden' | 'fehler'
  fehler?: string | null
  onErneut?: () => void
  onAbmelden?: () => void | Promise<void>
}) {
  const istFehler = status === 'fehler'
  const [aktionsfehler, setAktionsfehler] = useState<string | null>(null)

  const sicherAbmelden = async () => {
    setAktionsfehler(null)
    try {
      await onAbmelden?.()
    } catch {
      setAktionsfehler('abmeldung konnte nicht bestätigt werden. versuch es erneut.')
    }
  }

  return (
    <div className="min-h-[100dvh] bg-grund">
      <main className="app-frame mx-auto w-full max-w-[420px]">
        <header className="border-b border-linie py-5">
          <p className="text-[10px] uppercase tracking-[0.18em] text-kreide-52">
            private anzeigetafel
          </p>
          <h1 className="display mt-1 text-[28px] font-semibold lowercase leading-none">
            zweikampf
          </h1>
        </header>

        <section
          role={istFehler ? 'alert' : 'status'}
          aria-live={istFehler ? 'assertive' : 'polite'}
          aria-busy={!istFehler}
          className="pt-6"
        >
          {istFehler ? (
            <div className="border-y border-linie py-5">
              <h2 className="display text-[21px] font-semibold lowercase">
                daten nicht geladen
              </h2>
              <p className="mt-2 max-w-[34ch] text-[13px] leading-relaxed text-kreide-60">
                {aktionsfehler ?? fehler ?? 'die app konnte den gemeinsamen stand nicht laden.'}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                {onErneut && (
                  <button
                    type="button"
                    onClick={onErneut}
                    className="min-h-11 rounded-[2px] border border-kreide px-4 text-[13px] font-semibold"
                  >
                    erneut versuchen
                  </button>
                )}
                {onAbmelden && (
                  <button
                    type="button"
                    onClick={() => void sicherAbmelden()}
                    className="min-h-11 px-3 text-[13px] text-kreide-60 underline decoration-linie-hell underline-offset-4"
                  >
                    sicher abmelden
                  </button>
                )}
              </div>
            </div>
          ) : (
            <>
              <h2 className="sr-only">gemeinsamer stand wird geladen</h2>
              <p className="text-[11px] text-kreide-52">gemeinsamer stand wird geladen …</p>
              <div aria-hidden="true" className="mt-4 border-t border-linie">
                {[74, 58, 68, 50].map((breite, index) => (
                  <div
                    key={breite}
                    className="flex min-h-[68px] items-center justify-between border-b border-linie"
                  >
                    <span
                      className="block h-4 rounded-[1px] bg-flaeche-hell"
                      style={{ width: `${breite}%`, opacity: 0.5 - index * 0.06 }}
                    />
                    <span className="ml-5 block size-5 shrink-0 rounded-[2px] bg-flaeche-hell opacity-50" />
                  </div>
                ))}
              </div>
            </>
          )}
        </section>
      </main>
    </div>
  )
}

function Fusszeile({
  art,
  me,
  onWechsel,
}: {
  art: Backend['art']
  me: UserId
  onWechsel: () => void
}) {
  const er = other(me)
  const [abmeldefehler, setAbmeldefehler] = useState<string | null>(null)

  const meldeAb = async () => {
    setAbmeldefehler(null)
    try {
      await abmelden()
    } catch {
      setAbmeldefehler('abmeldung nicht bestätigt')
    }
  }

  if (art === 'supabase') {
    return (
      <footer className="mt-6 flex min-h-11 flex-wrap items-center gap-2 text-[11px] text-kreide-52">
        <span>{abmeldefehler ?? `angemeldet als ${userDef(me).name}`}</span>
        <button
          type="button"
          onClick={() => void meldeAb()}
          className="flex min-h-11 items-center px-1 underline decoration-linie-hell underline-offset-4"
        >
          abmelden
        </button>
        <Bauzeit />
      </footer>
    )
  }

  return (
    <footer className="mt-6 flex min-h-11 items-center gap-2 text-[11px] text-kreide-52">
      <span>prototyp · angemeldet als {userDef(lokalesMe()).name}</span>
      <button
        type="button"
        onClick={() => {
          lokalWechseln(er.id)
          onWechsel()
        }}
        className="flex min-h-11 items-center px-1 underline decoration-linie-hell underline-offset-4"
      >
        zu {er.name} wechseln
      </button>
      <Bauzeit />
    </footer>
  )
}

/**
 * wann diese fassung gebaut wurde. beantwortet die eine frage, die man einer
 * app auf einem fremden telefon sonst nicht stellen kann: laeuft dort das,
 * worueber wir gerade reden? ein homescreen-pwa haelt seinen service worker
 * hartnaeckig, und ohne diese zeile sieht eine alte fassung genauso aus wie
 * ein fehler in der neuen.
 */
function Bauzeit() {
  const stand = bauKurz(__BAUZEIT__)
  if (!stand) return null
  return (
    <span className="ml-auto text-kreide-38" title="stand dieser fassung">
      {stand}
    </span>
  )
}
