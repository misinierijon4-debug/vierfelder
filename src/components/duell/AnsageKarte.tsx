import { memo, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { user as userDef } from '../../lib/types'
import type { UserId } from '../../lib/types'
import {
  STUFEN_TEXT,
  ansageFrist,
  ansageZielText,
  istV2,
  wirksamerEinsatz,
} from '../../lib/ansagen'
import type { Ansage, AnsageReaktion, AnsageStand, ReaktionsLage } from '../../lib/ansagen'
import { ergebnisFuer, fristText, restzeitText, wer, wertungText } from '../../lib/ansageAnzeige'
import { ANSAGE, EASE } from '../../lib/motion'

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
}

/**
 * eine ansage als großer block: ziel, fortschritt als zellen wie im raster,
 * frist, einsatz und was der andere daraus gemacht hat. die zellen gehören
 * der person, die liefern muss, und tragen deren farbe.
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
}: Props) {
  const von = userDef(ansage.von)
  const an = userDef(ansage.an)
  const v2 = istV2(ansage)
  const einsatz = wirksamerEinsatz(ansage)
  const gekontert = ansage.reaktion?.art === 'kontern'
  const frist = ansageFrist(ansage)
  const fertig = stand.status !== 'laeuft'

  const titelId = `ansage-${ansage.id}`
  return (
    <motion.article
      layout="position"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: ANSAGE.schritt, ease: EASE }}
      aria-labelledby={titelId}
      className="relative overflow-hidden border-y border-linie bg-flaeche/40"
    >
      {/* die ansagende person steht oben als farbkante, wie die marke im raster */}
      <div className="h-[3px]" style={{ background: von.farbe }} aria-hidden="true" />
      <div className="px-4 pb-4 pt-3">
        <div className="flex min-h-6 flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[11px]">
          <span className="font-semibold text-kreide">
            {ansage.von === me ? `du forderst ${an.name} heraus` : `${von.name} fordert dich heraus`}
          </span>
          {v2 && (
            <span className="tnum text-kreide-60">
              {gekontert ? 'gekontert' : STUFEN_TEXT[ansage.stufe ?? 'sicher']} · {einsatz} {einsatz === 1 ? 'Punkt' : 'Punkte'}
            </span>
          )}
        </div>

        <p className="mt-3 text-[12px] font-semibold text-kreide-60">{ansage.an === me ? 'Dein Ziel' : `${an.name}s Ziel`}</p>
        <div className="mt-1">
          <h3 id={titelId} className="display min-w-0 text-[40px] font-bold leading-[0.95] text-kreide [overflow-wrap:anywhere]">
            {ansageZielText(ansage.feld, ansage.ziel)}
          </h3>
        </div>

        <p className="mt-2 text-[13px] text-kreide-60">
          {v2 ? 'bis Sonntag, 18 Uhr' : fristText(ansage)}
          {!fertig && (
            <>
              <span className="px-1.5 text-kreide-52" aria-hidden="true">·</span>
              <span className="tnum">noch {restzeitText(jetzt, frist)}</span>
            </>
          )}
        </p>

        <div className="mt-4 space-y-3">
          <Bahn person={ansage.an} me={me} stand={stand} />
          {gegen && <Bahn person={gegen.ansage.an} me={me} stand={gegen.stand} />}
        </div>

        {!fertig && v2 && (
          <div className="mt-4 border-t border-linie pt-3 text-[13px] leading-5 text-kreide-60">
            <p>{wertungText(ansage, me)}</p>
            {gegen && <p className="mt-1.5">Zusätzlich {gegen.ansage.an === me ? 'musst du' : `muss ${wer(gegen.ansage.an, me)}`} auch {ansageZielText(gegen.ansage.feld, gegen.ansage.ziel)} schaffen. Das zählt als zweite Aufgabe.</p>}
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

/** die zellen einer person: eine je nötigem tag, gefüllt in ihrer farbe */
function Bahn({ person, me, stand }: { person: UserId; me: UserId; stand: AnsageStand }) {
  const p = userDef(person)
  const reduced = useReducedMotion()
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-3 text-[13px]">
        <span className="font-semibold text-kreide">{person === me ? 'Du' : p.name}</span>
        <span className="tnum text-kreide-60">{stand.erreicht} von {stand.ziel} geschafft</span>
      </div>
      <div
        className="flex min-w-0 gap-1"
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
              className="relative h-3 min-w-0 flex-1 overflow-hidden rounded-[2px] border"
              style={{ borderColor: voll ? p.farbe : p.leer }}
            >
              <motion.span
                className="absolute inset-0 origin-left"
                style={{ background: p.farbe }}
                initial={false}
                animate={{ scaleX: voll ? 1 : 0, opacity: voll ? 1 : 0 }}
                transition={reduced ? { duration: 0 } : { ...ANSAGE.zelle, delay: i * ANSAGE.zellenVersatz }}
              />
            </span>
          )
        })}
      </div>
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
    <p className="tnum mt-2 text-[11px] text-kreide-52">
      {an.name} kann noch {restzeitText(jetzt, bis)} kontern oder „du auch“ sagen.
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
  return (
    <div className="mt-3">
      <div className="border-l-[3px] border-kreide-52 bg-grund px-3 py-2.5">
        <p className="text-[14px] font-semibold text-kreide">Einfach annehmen</p>
        <p className="mt-0.5 text-[12px] leading-5 text-kreide-60">
          Du musst nichts drücken. Die Ansage läuft automatisch weiter.
        </p>
      </div>
      <details className="mt-2 group">
        <summary className="flex min-h-11 cursor-pointer items-center text-[12px] font-semibold text-kreide-60 hover:text-kreide">
          Stattdessen reagieren (optional) · noch {restzeitText(jetzt, lage.bis)}
        </summary>
        <div className="grid grid-cols-2 gap-2 pb-1">
          <button
            type="button"
            onClick={() => onReagiere(ansage.id, 'kontern')}
            disabled={!lage.kontern || sendet !== null}
            aria-describedby={`kontern-${ansage.id}`}
            className="flex min-h-14 flex-col items-start justify-center rounded-[2px] border border-linie-hell bg-grund px-3 text-left transition-colors hover:border-kreide-52 disabled:opacity-40"
          >
            <span className="text-[14px] font-bold text-kreide">{sendet === 'kontern' ? 'wird gesendet …' : 'kontern'}</span>
            <span id={`kontern-${ansage.id}`} className="tnum text-[11px] text-kreide-60">
              {lage.kontern ? `${e * 2} Punkte statt ${e}` : 'nur vor deinem ersten Tag'}
            </span>
          </button>
          <button
            type="button"
            onClick={() => onReagiere(ansage.id, 'duAuch')}
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
      </details>
    </div>
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
