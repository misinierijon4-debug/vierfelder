import { Activity, lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { AREAS, other, user as userDef } from './lib/types'
import type { AppTab, AreaId, FeldId, UserId } from './lib/types'
import type { Backend } from './lib/backend'
import { bauKurz, fromKey, istBilanzzeit, standZeit, toKey, weekDays } from './lib/dates'
import { istSelbeWoche, wochenZeitraum } from './lib/kalender'
import { useTracker } from './lib/store'
import { lokalWechseln, lokalesBackend } from './lib/lokal'
import { abmelden, hatSupabase, supabaseBackend, useSession } from './lib/supabase'
import {
  abstand,
  anzahlEinheiten,
  hatTageswert,
  istGesetzt,
  letzteEinheit,
  messungsLaufstatus,
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
import { KalenderKnopf } from './components/KalenderKnopf'
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
import { oeffneEni, oeffneEniWoche, schliesseEni, useBerichtWoche, useRoute, verlasseBericht } from './lib/eniRoute'
import type { DuellKontext } from './lib/eniSpeicher'
/**
 * ENI haengt am startpfad nicht mit drin. die anzeigetafel startet ohne sie,
 * und das JavaScript-Budget in scripts/check-web-build.mjs misst genau diesen
 * unterschied.
 */
const EniTor = lazy(() =>
  import('./components/eni/EniTor').then((modul) => ({ default: modul.EniTor }))
)
const WochenRueckblickEinladung = lazy(() =>
  import('./components/WochenRueckblickEinladung').then((modul) => ({
    default: modul.WochenRueckblickEinladung,
  }))
)
/**
 * Auch das Berichtsblatt haengt nicht am Startpfad: es sind fuenf Diagramme,
 * die niemand sieht, bevor er den Kalender oeffnet.
 */
const WochenberichtBlatt = lazy(() =>
  import('./components/wochenbericht/WochenberichtBlatt').then((modul) => ({
    default: modul.WochenberichtVerbunden,
  }))
)
import { RivalitaetsTicker } from './components/duell/RivalitaetsTicker'
import { AnsageHinweis } from './components/duell/AnsageHinweis'
import { Benachrichtigungen } from './components/Benachrichtigungen'
import { Gewichtszeile } from './components/Gewichtszeile'
import { Gewichtsdiagramm } from './components/Gewichtsdiagramm'
import { gewichtAn, letztesGewicht } from './lib/gewicht'
import { abrechnungFuerWoche, berechneDuell, fehlendeAbschlussWochen } from './lib/duell'
import type { AnsageWertung } from './lib/duell'
import { offeneAnsageWende, wochenAnsagePunkte, zaehltAusZustand } from './lib/ansagen'
import { wochenMarken } from './lib/wochenbericht'

const UNDO_MS = 5000

export function App() {
  const { status, session, fehler, erneut } = useSession()
  const route = useRoute()
  const [wechselNr, setWechselNr] = useState(0)
  const [duellStand, setDuellStand] = useState<DuellKontext | null>(null)

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

  // ENI liegt neben der anzeigetafel, nicht darin: eine eigene adresse, ein
  // eigener bildschirm, ein eigener weg zurueck. die anmeldung gilt fuer beide.
  if (route === 'eni') {
    return (
      <Suspense fallback={<EniStartzustand />}>
        <EniTor art={backend.art} kontoId={kontoId} onZurueck={schliesseEni} initialDuellStand={duellStand} />
      </Suspense>
    )
  }

  const trackerKey = backend.art === 'supabase' ? `supabase:${kontoId}` : `lokal:${wechselNr}`
  return (
    <Tracker
      key={trackerKey}
      backend={backend}
      kontoId={kontoId}
      onWechsel={() => setWechselNr((n) => n + 1)}
      onDuellStand={setDuellStand}
    />
  )
}

function Tracker({
  backend,
  kontoId,
  onWechsel,
  onDuellStand,
}: {
  backend: Backend
  kontoId: string | null
  onWechsel: () => void
  onDuellStand?: (stand: DuellKontext) => void
}) {
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
    offlineStand,
    gemerkterStand,
    offlineStandZeigen,
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
    ansagen,
    ansagenVerfuegbar,
    sageAn,
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
  /** montag der woche, deren bericht offen ist. null heisst: kein bericht */
  const [berichtWoche, setBerichtWoche] = useState<string | null>(null)
  /**
   * einmal geoeffnet, bleibt das blatt im baum. sonst nimmt React es im selben
   * schritt heraus, in dem es zugeht — und die ausblendbewegung faellt aus.
   */
  const [berichtGeladen, setBerichtGeladen] = useState(false)
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
  // was ansagen zählen, fragt jede wertung dieselbe regel wie der rest des duells
  const zaehlt = useMemo(() => zaehltAusZustand(zustand), [zustand])
  const ansageWertung = useMemo<AnsageWertung>(() => {
    const montag = woche[0] ?? heuteKey
    return {
      punkte: wochenAnsagePunkte(zaehlt, ansagen, montag, heute),
      wende: offeneAnsageWende(zaehlt, ansagen, montag, heute),
    }
  }, [zaehlt, ansagen, woche, heuteKey, heute])
  const match = useMemo(
    () => berechneDuell(zustand, woche, heuteKey, me, ansageWertung),
    [zustand, woche, heuteKey, me, ansageWertung]
  )

  // je woche mit daten eine marke fuer den kalenderrand. einmal gerechnet,
  // nicht je sichtbarer zeile — der kalender zeigt monate am stueck
  const marken = useMemo(
    () => wochenMarken(zustand, schlaf, heuteKey),
    [zustand, schlaf, heuteKey]
  )
  const ersteWoche = useMemo(() => [...marken.keys()].sort()[0] ?? null, [marken])

  const oeffneBericht = useCallback((wocheKey: string) => {
    setBerichtWoche(wocheKey)
    setBerichtGeladen(true)
  }, [])

  // die push-meldung am montag zeigt auf `#/bericht?woche=…`. der hash wird
  // beim oeffnen wieder abgeraeumt, damit er nicht auf einer woche stehen
  // bleibt, die man inzwischen weitergeblaettert hat.
  const berichtAusAdresse = useBerichtWoche()
  useEffect(() => {
    if (!berichtAusAdresse) return
    oeffneBericht(berichtAusAdresse)
    verlasseBericht()
  }, [berichtAusAdresse, oeffneBericht])

  useEffect(() => {
    onDuellStand?.({
      ich: me,
      gegner: other(me).id,
      ichName: userDef(me).name,
      gegnerName: other(me).name,
      wocheIch: match.wocheIch,
      wocheEr: match.wocheEr,
      diff: match.wocheDiff,
      statusText: match.statusText,
    })
  }, [me, match, onDuellStand])
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
    const ansagePunkte = wochenAnsagePunkte(zaehlt, ansagen, wocheKey, new Date())
    abrechnungHinzu(abrechnungFuerWoche(zustand, tage, wetten[wocheKey] ?? null, ansagePunkte))
  }, [abrechnungHinzu, ansagen, zaehlt, zustand, wetten])

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

  /**
   * je bereich feste handler. die zeilen und tabs darunter rendern nur neu,
   * wenn sich ihre eigenen werte aendern (`memo`) — ein frischer handler bei
   * jedem render risse sie trotzdem alle mit, auch bei einem tap nebenan.
   */
  const zeilenHandler = useMemo(() => {
    const handler = {} as Record<AreaId, {
      onTap: () => void
      onUndo: () => void
      onNeueEinheit: () => void
      onWert: (delta: number) => void
    }>
    for (const area of AREAS) {
      handler[area.id] = {
        onTap: () => toggle(area.id, heuteKey),
        onUndo: () => {
          rueckgaengig(area.id, heuteKey)
          setUndoFuer(null)
        },
        onNeueEinheit: () => einheitHinzu(area.id, heuteKey),
        onWert: (delta) => wertAendern(area.id, heuteKey, delta),
      }
    }
    return handler
  }, [einheitHinzu, heuteKey, rueckgaengig, toggle, wertAendern])

  const oeffneTagesdetail = useCallback((user: UserId, area: FeldId, tag: string) => {
    setDetail({ user, area, tag })
  }, [])
  const setzeGewichtHeute = useCallback((kg: number) => setzeGewicht(heuteKey, kg), [heuteKey, setzeGewicht])
  const letztesGewichtIch = useMemo(() => letztesGewicht(zustand.gewichte, me), [zustand.gewichte, me])
  const setzeWetteDieserWoche = useCallback(
    (text: string) => setzeWette(woche[0] ?? heuteKey, text),
    [heuteKey, setzeWette, woche]
  )
  const zumTracker = useCallback(() => wechsleTabMitFokus('tracker'), [wechsleTabMitFokus])
  const zumDuell = useCallback(() => wechsleTabMitFokus('duell'), [wechsleTabMitFokus])
  const schliesseKalender = useCallback(() => setKalenderOffen(false), [])

  /** die sonntagsabrechnung dieser woche aus den tracker-daten bauen und archivieren */
  const schliesseWocheAb = useCallback(() => {
    if (!bereit || !istBilanzzeit(heute) || abrechnungDerWoche) return
    const wocheKey = woche[0] ?? heuteKey
    const abr = abrechnungFuerWoche(zustand, woche, wetten[wocheKey] ?? null, ansageWertung.punkte)
    abrechnungHinzu(abr)
  }, [abrechnungDerWoche, abrechnungHinzu, ansageWertung, bereit, heute, heuteKey, wetten, woche, zustand])

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
  const waehleTag = useCallback((tag: string) => {
    setBlick(tag === heuteKey ? null : tag)
    setKalenderOffen(false)
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => rasterRef.current?.scrollIntoView({ block: 'start' }))
    })
  }, [heuteKey])

  if (!bereit) {
    return (
      <AppStartzustand
        status={ladezustand === 'fehler' ? 'fehler' : 'laden'}
        fehler={fehler}
        gemerkterStand={gemerkterStand}
        onErneut={ladenNeu}
        onOffline={offlineStandZeigen}
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
          onEni={oeffneEni}
        />

        {backend.art === 'supabase' && kontoId && (
          <Suspense fallback={null}>
            <WochenRueckblickEinladung
              kontoId={kontoId}
              onWocheOeffnen={oeffneEniWoche}
            />
          </Suspense>
        )}

        {/* der offlinemodus sagt oben, was man sieht, und bietet den weg
            zurueck an. sichtbar ist er nur, solange er gilt. */}
        {offlineStand && (
          <div
            role="status"
            className="mt-2 flex items-start justify-between gap-3 border-y border-linie py-2 text-[11px] leading-4 text-kreide-52"
          >
            <p className="min-w-0 text-pretty">
              offlinemodus · stand von {standZeit(offlineStand)}
              <span className="block">nur zum ansehen, bis die verbindung zurück ist</span>
            </p>
            <button
              type="button"
              onClick={ladenNeu}
              className="relative shrink-0 font-semibold text-kreide underline decoration-linie-hell underline-offset-4"
            >
              aktualisieren
              <span aria-hidden="true" className="absolute -inset-x-2 -inset-y-3.5" />
            </button>
          </div>
        )}

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
          {/* alle vier tabs bleiben im baum. ein verborgener tab ist schon
              fertig gerendert, wenn man zu ihm wechselt, und behaelt seinen
              zustand; react rechnet ihn mit niedrigster prioritaet nach, er
              haelt also keinen tap im sichtbaren tab auf. vorher wartete jeder
              wechsel erst das ausblenden des alten tabs ab und baute den neuen
              danach von null auf. */}
          <Activity mode={aktiverTab === 'tracker' ? 'visible' : 'hidden'}>
            <div className="tab-eingang">
              <AnsageHinweis zustand={zustand} me={me} heute={heute} ansagen={ansagen} onZumDuell={zumDuell} />
              <RivalitaetsTicker zustand={zustand} woche={woche} me={me} kompakt={true} druck={match.druck} />

              <section
                aria-label="heute eintragen"
                className="mt-2 border-t border-linie"
              >
                {AREAS.map((area, i) => {
                  // die schritte gelten der neuesten einheit, die zahl zwischen
                  // ihnen dem ganzen tag
                  const letzte = letzteEinheit(zustand, me, area.id, heuteKey)
                  const handler = zeilenHandler[area.id]
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
                      laufstatus={messungsLaufstatus(zustand, me, area.id)}
                      farbe={ich.farbe}
                      farbeEr={er.farbe}
                      zeigeUndo={undoFuer === area.id}
                      disabled={!bereit}
                      onTap={handler.onTap}
                      onUndo={handler.onUndo}
                      onNeueEinheit={handler.onNeueEinheit}
                      onWert={handler.onWert}
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

                  <KalenderKnopf label="kalender öffnen" onOeffnen={() => setKalenderOffen(true)} />
                </div>

                <Raster
                  zustand={zustand}
                  woche={sichtbareWoche}
                  heute={heuteKey}
                  ereignis={ereignis}
                  titel={rasterTitel}
                  gewaehlterTag={gewaehlterTag}
                  onZelle={oeffneTagesdetail}
                />
              </div>

              {/* gewicht ist eine messung statt eines ticks und steht deshalb
                  zusammen mit seinem verlauf unter dem wochenraster */}
              <Gewichtszeile
                kg={gewichtAn(zustand.gewichte, me, heuteKey)}
                letzte={letztesGewichtIch}
                kgEr={gewichtAn(zustand.gewichte, er.id, heuteKey)}
                nameEr={er.name}
                farbe={ich.farbe}
                farbeEr={er.farbe}
                streak={streak(zustand, me, 'gewicht', heute)}
                quelle={quelle(zustand, me, 'gewicht', heuteKey)}
                onSetze={setzeGewichtHeute}
              />

              <Gewichtsdiagramm gewichte={zustand.gewichte} heute={heuteKey} />
            </div>
          </Activity>

          <Activity mode={aktiverTab === 'duell' ? 'visible' : 'hidden'}>
            <div className="tab-eingang">
              <DuellTab
                zustand={zustand}
                woche={woche}
                me={me}
                heute={heute}
                match={match}
                wette={wetten[woche[0] ?? heuteKey] ?? ''}
                onWette={setzeWetteDieserWoche}
                onZumTracker={zumTracker}
                abrechnung={abrechnungDerWoche}
                abrechnungen={abrechnungen}
                abschlussStatus={abrechnungDerWocheStatus}
                onAbschluss={bereit ? schliesseWocheAb : undefined}
                ansagen={ansagenVerfuegbar ? ansagen : undefined}
                onSageAn={bereit && ansagenVerfuegbar ? sageAn : undefined}
              />
            </div>
          </Activity>

          <Activity mode={aktiverTab === 'schlaf' ? 'visible' : 'hidden'}>
            <div className="tab-eingang">
              <SchlafTab
                naechte={schlaf}
                woche={woche}
                heuteKey={heuteKey}
                me={me}
                istPrototyp={backend.art === 'lokal'}
                phasenLadezustaende={phasenLadezustaende}
                wochenMarken={marken}
                onVerlaufBrauchen={phasenNachladen}
                onVerlaufErneut={phasenNeuLaden}
                onBerichtOeffnen={oeffneBericht}
              />
            </div>
          </Activity>

          <Activity mode={aktiverTab === 'noten' ? 'visible' : 'hidden'}>
            <div className="tab-eingang">
              <NotenTab
                stand={notenstand}
                me={me}
                heute={heuteKey}
                onPruefungsfach={setzePruefungsfach}
                onNote={noteHinzu}
                onNoteLoeschen={noteLoeschen}
                onNoteWiederherstellen={noteWiederherstellen}
              />
            </div>
          </Activity>

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
        wochenMarken={marken}
        onTagWaehlen={waehleTag}
        onBerichtOeffnen={oeffneBericht}
        onSchliessen={schliesseKalender}
      />

      {/* der bericht legt sich ueber den kalender, statt ihn zu ersetzen:
          wer ihn schliesst, steht wieder in derselben monatszeile */}
      {berichtGeladen && (
        <Suspense fallback={null}>
          <WochenberichtBlatt
            woche={berichtWoche}
            zustand={zustand}
            naechte={schlaf}
            heuteKey={heuteKey}
            ersteWoche={ersteWoche}
            lokal={backend.art === 'lokal'}
            bereit={bereit}
            onWocheWechseln={setBerichtWoche}
            onSchliessen={() => setBerichtWoche(null)}
            onMitEniReden={oeffneEniWoche}
          />
        </Suspense>
      )}

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

/**
 * was steht, waehrend ENIs chunk laedt. kein spinner: der kopf, den ENI danach
 * ohnehin hat, damit beim eintreffen nichts springt.
 */
function EniStartzustand() {
  return (
    <div className="flex h-[100dvh] flex-col bg-grund" aria-busy="true">
      <div className="vollbild-safe-x border-b border-linie pt-[calc(var(--app-safe-top)+0.75rem)]">
        <div className="mx-auto flex h-11 w-full max-w-[560px] items-center justify-center">
          <span className="display text-[17px] font-bold leading-none tracking-[0.06em] text-kreide-52">
            ENI
          </span>
        </div>
        <div className="h-6" />
      </div>
    </div>
  )
}

export function AppStartzustand({
  status,
  fehler = null,
  gemerkterStand = null,
  onErneut,
  onOffline,
  onAbmelden,
}: {
  status: 'laden' | 'fehler'
  fehler?: string | null
  /** ISO-Zeitpunkt eines gemerkten standes, sonst null */
  gemerkterStand?: string | null
  onErneut?: () => void
  onOffline?: () => void
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
                {gemerkterStand && onOffline && (
                  <button
                    type="button"
                    onClick={onOffline}
                    className="min-h-11 rounded-[2px] border border-linie px-4 text-[13px] text-kreide-60"
                  >
                    offline weiter
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
              {gemerkterStand && onOffline && (
                <p className="mt-3 max-w-[34ch] text-[11px] leading-relaxed text-kreide-52">
                  offline weiter zeigt den stand von {standZeit(gemerkterStand)}, nur zum
                  ansehen. sobald die verbindung zurück ist, aktualisiert er sich von allein.
                </p>
              )}
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

export function Fusszeile({
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
      <span>prototyp · angemeldet als {userDef(me).name}</span>
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
