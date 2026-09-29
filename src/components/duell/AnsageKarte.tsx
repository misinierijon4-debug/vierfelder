import { memo, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { user as userDef } from '../../lib/types'
import type { UserId } from '../../lib/types'
import {
  ANSAGE_WORT,
  STUFEN_TEXT,
  ansageZielText,
  istV2,
  wirksamerEinsatz,
} from '../../lib/ansagen'
import type { Ansage, AnsageReaktion, AnsageStand, ReaktionsLage } from '../../lib/ansagen'
import { ANSAGE_SYMBOL, ergebnisFuer, fristText, restzeitText, wer, wertungText } from '../../lib/ansageAnzeige'
import { ANSAGE, EASE } from '../../lib/motion'
import { Feldsymbol } from '../Feldsymbole'

type Props = {
  ansage: Ansage
  stand: AnsageStand
  /** die „du auch“-gegenrichtung mit ihrem stand */
  gegen: { ansage: Ansage; stand: AnsageStand } | null
  me: UserId
  jetzt: Date
  /** gesetzt, wenn `me` gerade reagieren darf */
  lage: ReaktionsLage | null
  /** welche reaktion gerade gesendet wird */
  sendet: AnsageReaktion | null
  /** stabil über alle karten: bekommt die id der ansage mit */
  onReagiere?: (ansageId: string, art: AnsageReaktion) => void
  /** zusehen statt liefern: kleiner, ohne fläche — die eigenen aufgaben tragen */
  leise?: boolean
}

/**
 * eine ansage als block auf der anzeigetafel. die ganze karte trägt eine
 * farbe: die der person, die liefern muss — kante, stand und zellen. wer
 * angesagt hat, steht nur als text darüber; zwei farben in einer karte
 * lasen sich so, als gehörte jede ansage beiden. das feld steht groß mit
 * seinem zeichen, die zahl davor klein, damit lesen und lernen nicht wie
 * dasselbe wort aussehen. die frist steht einmal über allen ansagen.
 */
export const AnsageKarte = memo(function AnsageKarte({
  ansage,
  stand,
  gegen,
  me,
  jetzt,
  lage,
  sendet,
  onReagiere,
  leise = false,
}: Props) {
  const von = userDef(ansage.von)
  const an = userDef(ansage.an)
  const v2 = istV2(ansage)
  const einsatz = wirksamerEinsatz(ansage)
  const gekontert = ansage.reaktion?.art === 'kontern'
  const fertig = stand.status !== 'laeuft'

  const titelId = `ansage-${ansage.id}`
  return (
    <motion.article
      layout="position"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: ANSAGE.schritt, ease: EASE }}
      aria-labelledby={titelId}
      className={`relative overflow-hidden border-b border-linie ${leise ? '' : 'bg-flaeche/40'}`}
    >
      {/* die kante gehört der person, die liefern muss — wie der stand darunter */}
      <div className={leise ? 'h-[2px]' : 'h-[3px]'} style={{ background: an.farbe }} aria-hidden="true" />
      <div className="px-4 pb-3 pt-2.5">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-[12px] text-kreide-60">
          <span>{ansage.von === me ? `du forderst ${an.name} heraus` : `${von.name} fordert dich heraus`}</span>
          {v2 ? (
            <span className="tnum">
              {gekontert ? 'gekontert' : STUFEN_TEXT[ansage.stufe ?? 'sicher']} · {einsatz} {einsatz === 1 ? 'punkt' : 'punkte'}
            </span>
          ) : (
            <span>{fristText(ansage)}</span>
          )}
        </div>

        <div className="mt-1 flex items-end justify-between gap-3">
          <h4
            id={titelId}
            className={`display flex min-w-0 items-baseline gap-1.5 font-bold leading-none text-kreide [overflow-wrap:anywhere] ${leise ? 'text-[22px]' : 'text-[30px]'}`}
          >
            <span className="tnum text-[0.6em] text-kreide-60">{ansage.ziel}×</span>{' '}
            <span>{ANSAGE_WORT[ansage.feld]}</span>
            <Feldsymbol feld={ANSAGE_SYMBOL[ansage.feld]} size={leise ? 18 : 22} className="shrink-0 self-center text-kreide-60" />
          </h4>
          {!gegen && (
            <span
              className={`display tnum shrink-0 font-bold leading-none ${leise ? 'text-[22px]' : 'text-[30px]'}`}
              style={{ color: an.farbe }}
            >
              {stand.erreicht}/{stand.ziel}
            </span>
          )}
        </div>

        <div className="mt-3 space-y-1.5">
          <Bahn person={ansage.an} me={me} stand={stand} mitName={Boolean(gegen)} />
          {gegen && <Bahn person={gegen.ansage.an} me={me} stand={gegen.stand} mitName />}
        </div>

        {!fertig && v2 && (
          <div className="mt-2.5 space-y-0.5 text-[12px] leading-5 text-kreide-60">
            <p>{wertungText(ansage, me)}</p>
            {gegen && <p>{wertungText(gegen.ansage, me)}</p>}
          </div>
        )}

        <ReaktionsZeile ansage={ansage} me={me} jetzt={jetzt} lage={lage} />

        {lage && onReagiere && (
          <ReaktionsKnoepfe ansage={ansage} lage={lage} jetzt={jetzt} sendet={sendet} onReagiere={onReagiere} />
        )}

        <Ergebnis ansage={ansage} stand={stand} gegen={gegen} me={me} />
      </div>
    </motion.article>
  )
})

/**
 * die zellen einer person: eine je nötigem tag, gefüllt in ihrer farbe, so
 * groß wie eine zelle im raster. bei „du auch“ stehen zwei bahnen
 * untereinander, dann mit name und stand je zeile.
 */
function Bahn({ person, me, stand, mitName }: { person: UserId; me: UserId; stand: AnsageStand; mitName: boolean }) {
  const p = userDef(person)
  const reduced = useReducedMotion()
  return (
    <div className="flex items-center gap-3">
      {mitName && <span className="w-12 shrink-0 text-[12px] font-semibold text-kreide">{wer(person, me)}</span>}
      <div
        className="flex min-w-0 flex-1 flex-wrap gap-1"
        role="meter"
        aria-label={`${wer(person, me)}: ${stand.erreicht} von ${stand.ziel}`}
        aria-valuemin={0}
        aria-valuemax={stand.ziel}
        aria-valuenow={Math.min(stand.erreicht, stand.ziel)}
      >
        {Array.from({ length: stand.ziel }, (_, i) => {
          const voll = i < stand.erreicht
          return (
            <span
              key={i}
              className="relative size-[22px] shrink-0 overflow-hidden rounded-[2px] border"
              style={{ borderColor: voll ? p.farbe : p.leer }}
            >
              <motion.span
                className="absolute inset-0 origin-bottom"
                style={{ background: p.farbe }}
                initial={false}
                animate={{ scaleY: voll ? 1 : 0, opacity: voll ? 1 : 0 }}
                transition={reduced ? { duration: 0 } : { ...ANSAGE.zelle, delay: i * ANSAGE.zellenVersatz }}
              />
            </span>
          )
        })}
      </div>
      {mitName && (
        <span className="tnum shrink-0 text-[13px] font-semibold" style={{ color: p.farbe }}>
          {stand.erreicht}/{stand.ziel}
        </span>
      )}
    </div>
  )
}

function ReaktionsZeile({
  ansage,
  me,
  jetzt,
  lage,
}: {
  ansage: Ansage
  me: UserId
  jetzt: Date
  lage: ReaktionsLage | null
}) {
  if (!istV2(ansage) || ansage.entschieden) return null
  const an = userDef(ansage.an)
  const r = ansage.reaktion
  if (r?.art === 'kontern') {
    return (
      <p className="mt-2 text-[12px] font-semibold" style={{ color: an.farbe }}>
        {ansage.an === me ? 'du hast gekontert.' : `${an.name} hat gekontert.`} es geht um {wirksamerEinsatz(ansage)}.
      </p>
    )
  }
  if (r?.art === 'duAuch') {
    return (
      <p className="mt-2 text-[12px] font-semibold" style={{ color: an.farbe }}>
        {ansage.an === me ? 'du hast gesagt: du auch.' : `${an.name} sagt: du auch.`}
      </p>
    )
  }
  if (lage || ansage.an === me) return null
  const bis = new Date(new Date(ansage.erstelltAm).getTime() + 24 * 3_600_000)
  if (jetzt >= bis) return null
  return (
    <p className="tnum mt-1 text-[12px] text-kreide-52">
      {an.name} kann noch {restzeitText(jetzt, bis)} reagieren.
    </p>
  )
}

function ReaktionsKnoepfe({
  ansage,
  lage,
  jetzt,
  sendet,
  onReagiere,
}: {
  ansage: Ansage
  lage: ReaktionsLage
  jetzt: Date
  sendet: AnsageReaktion | null
  onReagiere: (ansageId: string, art: AnsageReaktion) => void
}) {
  const von = userDef(ansage.von)
  const e = wirksamerEinsatz(ansage)
  const [bestaetigung, setBestaetigung] = useState<AnsageReaktion | null>(null)
  return (
    // nichts tun heißt annehmen. reagieren ist eine zeile, die man aufklappt.
    <details className="group mt-2.5 border-t border-linie">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 text-[13px] [&::-webkit-details-marker]:hidden">
        <span className="flex items-center gap-2 font-semibold text-kreide">
          <span className="w-3 text-kreide-60" aria-hidden="true">
            <span className="group-open:hidden">+</span>
            <span className="hidden group-open:inline">−</span>
          </span>
          kontern oder „du auch“
        </span>
        <span className="tnum text-[12px] text-kreide-60">freiwillig · noch {restzeitText(jetzt, lage.bis)}</span>
      </summary>
      {bestaetigung ? (
        <div className="mb-3 border border-linie-hell bg-grund px-3 py-3" aria-live="polite">
          <p className="text-[14px] font-bold text-kreide">
            {bestaetigung === 'duAuch' ? '„du auch“ wirklich aktivieren?' : 'wirklich kontern?'}
          </p>
          <p className="mt-1 text-[12px] leading-5 text-kreide-60">
            {bestaetigung === 'duAuch'
              ? `${von.name} muss dann ebenfalls ${ansageZielText(ansage.feld, ansage.ziel)} schaffen. das zählt als zweite aufgabe.`
              : `der einsatz steigt von ${e} auf ${e * 2}.`}{' '}
            das lässt sich in der app nicht selbst rückgängig machen.
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setBestaetigung(null)}
              disabled={sendet !== null}
              className="min-h-11 border border-linie-hell text-[13px] font-semibold text-kreide disabled:opacity-40"
            >
              abbrechen
            </button>
            <button
              type="button"
              onClick={() => {
                onReagiere(ansage.id, bestaetigung)
                setBestaetigung(null)
              }}
              disabled={sendet !== null}
              className="min-h-11 bg-kreide px-2 text-[13px] font-bold text-grund disabled:opacity-40"
            >
              {bestaetigung === 'duAuch' ? 'ja, „du auch“ aktivieren' : 'ja, einsatz verdoppeln'}
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2 pb-3">
          <button
            type="button"
            onClick={() => setBestaetigung('kontern')}
            disabled={!lage.kontern || sendet !== null}
            aria-describedby={`kontern-${ansage.id}`}
            className="flex min-h-14 flex-col items-start justify-center rounded-[2px] border border-linie-hell bg-grund px-3 text-left transition-colors hover:border-kreide-52 disabled:opacity-40"
          >
            <span className="text-[14px] font-bold text-kreide">{sendet === 'kontern' ? 'wird gesendet …' : 'kontern'}</span>
            <span id={`kontern-${ansage.id}`} className="tnum text-[11px] text-kreide-60">
              {lage.kontern ? `${e * 2} punkte statt ${e}` : 'nur vor deinem ersten tag'}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setBestaetigung('duAuch')}
            disabled={sendet !== null}
            aria-describedby={`duauch-${ansage.id}`}
            className="flex min-h-14 flex-col items-start justify-center rounded-[2px] border border-linie-hell bg-grund px-3 text-left transition-colors hover:border-kreide-52 disabled:opacity-40"
          >
            <span className="text-[14px] font-bold text-kreide">{sendet === 'duAuch' ? 'wird gesendet …' : 'du auch'}</span>
            <span id={`duauch-${ansage.id}`} className="tnum text-[11px] text-kreide-60">
              {von.name} muss auch {ansageZielText(ansage.feld, ansage.ziel)}
            </span>
          </button>
        </div>
      )}
    </details>
  )
}

/**
 * das ergebnis steht unten als siegel. kommt es herein, während man zusieht,
 * läuft es einmal ein: gewonnen mit einem satten streifen in der eigenen
 * farbe, verloren nur als ruhiges einblenden.
 */
function Ergebnis({
  ansage,
  stand,
  gegen,
  me,
}: {
  ansage: Ansage
  stand: AnsageStand
  gegen: { ansage: Ansage; stand: AnsageStand } | null
  me: UserId
}) {
  const reduced = useReducedMotion()
  const vorher = useRef(stand.status)
  const [frisch, setFrisch] = useState(false)
  useEffect(() => {
    if (vorher.current === 'laeuft' && stand.status !== 'laeuft') setFrisch(true)
    vorher.current = stand.status
  }, [stand.status])

  const ergebnisse = [
    { a: ansage, s: stand },
    ...(gegen ? [{ a: gegen.ansage, s: gegen.stand }] : []),
  ]
    .map(({ a, s }) => ({ a, s, e: ergebnisFuer(a, s.status) }))
    .filter((x) => x.s.status !== 'laeuft')
  if (ergebnisse.length === 0) return null

  const meine = ergebnisse.reduce((summe, x) => summe + (x.e?.an === me ? x.e.punkte : 0), 0)
  const ich = userDef(me)
  const gewonnen = meine > 0
  const animiert = frisch && !reduced

  return (
    <div className="relative mt-3 border-t border-linie pt-3">
      <AnimatePresence>
        {animiert && gewonnen && (
          <motion.span
            key="streifen"
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 top-0 h-full origin-left"
            style={{ background: ich.farbe }}
            initial={{ scaleX: 0, opacity: 0.35 }}
            animate={{ scaleX: 1, opacity: 0 }}
            transition={{ scaleX: { duration: 0.32, ease: EASE }, opacity: { duration: 0.4, delay: 0.18, ease: EASE } }}
          />
        )}
      </AnimatePresence>
      <ul className="relative space-y-1.5" aria-live="polite">
        {ergebnisse.map(({ a, s, e }) => (
          <motion.li
            key={a.id}
            className="flex items-center justify-between gap-3"
            initial={animiert ? { opacity: 0, scale: gewonnen ? 1.25 : 1, rotate: gewonnen ? -6 : 0 } : false}
            animate={{ opacity: 1, scale: 1, rotate: 0 }}
            transition={gewonnen ? ANSAGE.aufloesung : { duration: 0.3, ease: EASE }}
          >
            <span className="flex items-center gap-2">
              <span
                className="rounded-[2px] border px-2 py-0.5 text-[11px] font-bold uppercase tracking-[0.12em]"
                style={{
                  borderColor: s.status === 'geschafft' ? userDef(a.an).farbe : userDef(a.von).farbe,
                  color: s.status === 'geschafft' ? userDef(a.an).farbe : userDef(a.von).farbe,
                }}
              >
                {s.status}
              </span>
              <span className="text-[12px] text-kreide-60">
                {wer(a.an, me)} {s.erreicht}/{s.ziel}
              </span>
            </span>
            {e && (
              <span className="tnum text-[18px] font-bold" style={{ color: userDef(e.an).farbe }}>
                +{e.punkte} <span className="text-[12px] font-semibold">{wer(e.an, me)}</span>
              </span>
            )}
          </motion.li>
        ))}
      </ul>
    </div>
  )
}
