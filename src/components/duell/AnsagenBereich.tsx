import { memo, useCallback, useEffect, useMemo, useState } from 'react'
import { AnimatePresence } from 'motion/react'
import { user as userDef, other } from '../../lib/types'
import type { UserId, Zustand } from '../../lib/types'
import {
  ANSAGE_FEHLERTEXT,
  ANSAGEN_JE_WOCHE,
  STUFEN_EINSATZ,
  STUFEN_TEXT,
  allinFrei,
  ansageFenster,
  ansageKandidaten,
  ansageStand,
  ansageVorschlaege,
  ansageZielText,
  reaktionsLage,
  verbleibendeAnsagen,
  zaehltAusZustand,
} from '../../lib/ansagen'
import type { Ansage, AnsageFehler, AnsageFeld, AnsageReaktion, AnsageStufe } from '../../lib/ansagen'
import { ansagePaare } from '../../lib/ansageAnzeige'
import { gezeigteVorschlaege, ladeAnsageSprueche } from '../../lib/ansageSprueche'
import type { SpruchAuswahl } from '../../../supabase/functions/_shared/ansageSprueche'
import { toKey } from '../../lib/dates'
import { AnsageKarte } from './AnsageKarte'
import { AnsageSheet } from './AnsageSheet'
import type { SheetAntwort } from './AnsageSheet'

export type AnsageAntwort = { ansage: Ansage } | { fehler: AnsageFehler | 'gesperrt' | 'netz' }
export type ReaktionsAntwort = { ansage: Ansage; gegen?: Ansage } | { fehler: AnsageFehler | 'gesperrt' | 'netz' }

type Props = {
  zustand: Zustand
  me: UserId
  /** tag und uhrzeit, nach denen woche, fenster und stand gerechnet werden */
  heute: Date
  ansagen: Ansage[]
  /** fehlt er, zeigt der bereich nur die laufenden ansagen */
  onSageAn?: (feld: AnsageFeld, stufe: AnsageStufe) => Promise<AnsageAntwort>
  /** fehlt er, gibt es keine knöpfe zum reagieren */
  onReagiere?: (ansageId: string, art: AnsageReaktion) => Promise<ReaktionsAntwort>
}

const FEHLER_SONST: Record<'gesperrt' | 'netz', string> = {
  gesperrt: 'gerade kann nichts gespeichert werden.',
  netz: 'nicht bestätigt. stand wird abgeglichen.',
}

function fehlertext(fehler: AnsageFehler | 'gesperrt' | 'netz'): string {
  return fehler === 'gesperrt' || fehler === 'netz' ? FEHLER_SONST[fehler] : ANSAGE_FEHLERTEXT[fehler]
}

/**
 * die uhr des bereichs. `heute` aus der app wechselt nur mit dem tag; der
 * countdown und das 24-stunden-fenster zum reagieren brauchen die minute.
 * gilt nur, solange die uhr am selben tag steht wie `heute` — sonst (in
 * tests, nach dem aufwachen) zählt `heute`.
 */
function useUhr(heute: Date): Date {
  const [uhr, setUhr] = useState(() => new Date())
  useEffect(() => {
    setUhr(new Date())
    const timer = window.setInterval(() => setUhr(new Date()), 30_000)
    return () => window.clearInterval(timer)
  }, [])
  return toKey(uhr) === toKey(heute) && uhr > heute ? uhr : heute
}

/**
 * die ansagen im duell, als herzstück des tabs: was läuft, groß; wer
 * reagieren darf, bekommt die knöpfe; wer noch ansagen darf, das blatt und
 * ENIs vorschläge. die zahlen kommen aus `ansagen.ts`, ENI schreibt nur den
 * spruch. regeln: `docs/ansagen.md`.
 */
export const AnsagenBereich = memo(function AnsagenBereich({
  zustand,
  me,
  heute,
  ansagen,
  onSageAn,
  onReagiere,
}: Props) {
  const ich = userDef(me)
  const er = other(me)
  const jetzt = useUhr(heute)
  const zaehlt = useMemo(() => zaehltAusZustand(zustand), [zustand])

  const paare = useMemo(
    () =>
      ansagePaare(ansagen, heute).map(({ ansage, gegen }) => ({
        ansage,
        stand: ansageStand(zaehlt, ansage, jetzt),
        gegen: gegen ? { ansage: gegen, stand: ansageStand(zaehlt, gegen, jetzt) } : null,
        lage: reaktionsLage(zaehlt, ansage, me, jetzt),
      })),
    [ansagen, heute, zaehlt, jetzt, me]
  )

  const verbleibend = verbleibendeAnsagen(ansagen, me, jetzt)
  const allin = allinFrei(ansagen, me, jetzt)
  const fenster = ansageFenster(jetzt)
  const kandidaten = useMemo(
    () => ansageKandidaten(zaehlt, ansagen, me, er.id, jetzt),
    [zaehlt, ansagen, me, er.id, jetzt]
  )
  const vorschlaege = useMemo(
    () => ansageVorschlaege(zaehlt, ansagen, me, er.id, jetzt),
    [zaehlt, ansagen, me, er.id, jetzt]
  )

  // ENI fragen, sobald es etwas zu wählen gibt. bis die antwort da ist, stehen
  // die vorlagen — die knöpfe funktionieren von anfang an.
  const [auswahl, setAuswahl] = useState<{ key: string; liste: SpruchAuswahl[] | null } | null>(null)
  const vorschlagKey = vorschlaege.map((v) => `${v.feld}:${v.stufe}:${v.ziel}`).join('|')
  useEffect(() => {
    if (!onSageAn || vorschlaege.length === 0) return
    let aktiv = true
    void ladeAnsageSprueche(vorschlaege).then((liste) => {
      if (aktiv) setAuswahl({ key: vorschlagKey, liste })
    })
    return () => {
      aktiv = false
    }
    // `vorschlaege` entsteht bei jedem rechnen neu; der schlüssel trägt denselben inhalt
  }, [vorschlagKey, onSageAn])
  const eniLaeuft = Boolean(onSageAn) && vorschlaege.length > 0 && auswahl?.key !== vorschlagKey
  const gezeigt = gezeigteVorschlaege(
    vorschlaege,
    auswahl?.key === vorschlagKey ? auswahl.liste : null,
    er.name
  )
  const [sheet, setSheet] = useState<{ offen: boolean; start: { feld: AnsageFeld; stufe: AnsageStufe } | null }>({
    offen: false,
    start: null,
  })
  const [meldung, setMeldung] = useState<string | null>(null)
  const [reagiert, setReagiert] = useState<{ id: string; art: AnsageReaktion } | null>(null)

  const oeffne = (start: { feld: AnsageFeld; stufe: AnsageStufe } | null) => {
    setMeldung(null)
    setSheet({ offen: true, start })
  }
  const schliesse = useCallback(() => setSheet((s) => ({ ...s, offen: false })), [])

  const sageAn = useCallback(
    async (feld: AnsageFeld, stufe: AnsageStufe): Promise<SheetAntwort> => {
      if (!onSageAn) return { fehler: 'gesperrt' }
      const antwort = await onSageAn(feld, stufe)
      if ('ansage' in antwort) {
        setMeldung(`angesagt: ${ansageZielText(antwort.ansage.feld, antwort.ansage.ziel)} bis sonntag.`)
        return { ok: true }
      }
      return antwort
    },
    [onSageAn]
  )

  const reagiere = useCallback(
    async (ansageId: string, art: AnsageReaktion): Promise<void> => {
      if (!onReagiere || reagiert) return
      setReagiert({ id: ansageId, art })
      setMeldung(null)
      const antwort = await onReagiere(ansageId, art)
      setReagiert(null)
      if ('fehler' in antwort) setMeldung(fehlertext(antwort.fehler))
      else setMeldung(art === 'kontern' ? 'gekontert. jetzt geht es um das doppelte.' : `du auch — jetzt muss ${er.name} auch.`)
    },
    [onReagiere, reagiert, er.name]
  )

  const kannAnsagen = Boolean(onSageAn) && verbleibend > 0 && fenster !== null
  const offeneFelder = kandidaten.filter((k) => !k.gesperrt)

  return (
    <section aria-labelledby="ansagen-titel" className="first:mt-0">
      <div className="flex min-h-10 flex-wrap items-end justify-between gap-x-3 gap-y-1">
        <h2 id="ansagen-titel" className="display text-[24px] font-bold leading-none text-kreide">
          ansagen
        </h2>
        <span className="flex items-center gap-2 pb-0.5 text-[11px] text-kreide-52">
          <span className="flex gap-1" aria-hidden="true">
            {Array.from({ length: ANSAGEN_JE_WOCHE }, (_, i) => (
              <span
                key={i}
                className="size-2.5 rounded-[1px] border"
                style={{
                  borderColor: i < verbleibend ? ich.farbe : ich.leer,
                  background: i < verbleibend ? ich.farbe : 'transparent',
                }}
              />
            ))}
          </span>
          <span className="tnum">{verbleibend} von {ANSAGEN_JE_WOCHE} übrig</span>
          <span aria-hidden="true">·</span>
          <span>{allin ? 'all-in möglich' : 'all-in verbraucht'}</span>
        </span>
      </div>

      {paare.length > 0 ? (
        <div className="mt-3 space-y-3" aria-label="ansagen dieser woche">
          <AnimatePresence initial={false}>
            {paare.map(({ ansage, stand, gegen, lage }) => (
              <AnsageKarte
                key={ansage.id}
                ansage={ansage}
                stand={stand}
                gegen={gegen}
                me={me}
                jetzt={jetzt}
                lage={onReagiere ? lage : null}
                sendet={reagiert?.id === ansage.id ? reagiert.art : null}
                onReagiere={onReagiere ? reagiere : undefined}
              />
            ))}
          </AnimatePresence>
        </div>
      ) : (
        <Leer me={me} kannAnsagen={kannAnsagen} />
      )}

      {onSageAn && (
        verbleibend === 0 ? (
          <p className="mt-3 text-[12px] text-kreide-60">deine ansagen dieser woche sind raus. montag gibt es neue.</p>
        ) : !fenster ? (
          <p className="mt-3 text-[12px] text-kreide-60">ab freitag 18 uhr gibt es keine neuen ansagen. montag geht es weiter.</p>
        ) : offeneFelder.length === 0 ? (
          <p className="mt-3 text-[12px] text-kreide-60">für {er.name} gibt es gerade kein faires ziel.</p>
        ) : (
          <div className="mt-3">
            <button
              type="button"
              onClick={() => oeffne(null)}
              className="flex min-h-14 w-full items-center justify-between rounded-[2px] bg-kreide px-4 text-grund transition-opacity active:opacity-80"
            >
              <span className="text-[15px] font-bold">{er.name} herausfordern</span>
              <span className="tnum text-[12px] font-semibold opacity-70">Ansage erstellen</span>
            </button>

            {gezeigt.length > 0 && (
              <div className="mt-4">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-[14px] font-semibold text-kreide">Vorschläge für dich</h3>
                  <span aria-live="polite" className="text-[10px] text-kreide-52">
                    {eniLaeuft ? 'eni überlegt …' : ''}
                  </span>
                </div>
                <ul className="mt-1 divide-y divide-linie border-y border-linie">
                  {gezeigt.map((v) => (
                    <li key={v.feld}>
                      <button
                        type="button"
                        onClick={() => oeffne({ feld: v.feld, stufe: v.stufe })}
                        className="flex min-h-14 w-full flex-col items-start gap-0.5 py-2.5 text-left"
                        aria-label={`vorschlag: ${ansageZielText(v.feld, v.ziel)}, ${STUFEN_TEXT[v.stufe]}, ${STUFEN_EINSATZ[v.stufe]} ${STUFEN_EINSATZ[v.stufe] === 1 ? 'Punkt' : 'Punkte'}`}
                      >
                        <span className="flex w-full items-baseline justify-between gap-3">
                          <span className="text-[15px] font-bold text-kreide">{ansageZielText(v.feld, v.ziel)}</span>
                          <span className="tnum text-[12px] text-kreide-60">
                            {STUFEN_EINSATZ[v.stufe]} {STUFEN_EINSATZ[v.stufe] === 1 ? 'Punkt' : 'Punkte'}
                          </span>
                        </span>
                        <span className="text-[12px] text-kreide-60">{STUFEN_TEXT[v.stufe]} · Ziel für {er.name}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )
      )}

      <p aria-live="polite" className="mt-2 min-h-5 text-[12px] text-kreide-60">
        {meldung}
      </p>
      <details className="text-[12px] leading-5 text-kreide-60">
        <summary className="min-h-11 cursor-pointer py-3 text-kreide-60 transition-colors hover:text-kreide">
          so funktionieren ansagen
        </summary>
        <ul className="space-y-1.5 pb-2">
          <li>
            du forderst {er.name} in einem feld heraus. das ziel rechnet die app aus {er.name}s schnitt der letzten vier
            wochen — immer darüber, nie unter dem mindestwert.
          </li>
          <li>
            schafft {er.name} es bis sonntag 18 uhr, bekommt <b style={{ color: er.farbe }}>{er.name}</b> den einsatz.
            sonst bekommst <b style={{ color: ich.farbe }}>du</b> ihn. sicher: 1 Punkt, mutig: 2 Punkte, all-in: 3 Punkte.
          </li>
          <li>
            {er.name} kann einmal reagieren, 24 stunden lang: <b className="text-kreide">kontern</b> verdoppelt den
            einsatz, <b className="text-kreide">du auch</b> heißt: du musst dasselbe schaffen.
          </li>
          <li>
            es zählt nur, was nach der ansage passiert und am selben tag eingetragen wird — getippt oder gemessen.
            felder, die {er.name} gar nicht macht, gehen nicht.
          </li>
          <li>2 ansagen pro woche, davon eine all-in. ansagen bis freitag 18 uhr.</li>
        </ul>
      </details>

      {onSageAn && (
        <AnsageSheet
          offen={sheet.offen}
          me={me}
          kandidaten={kandidaten}
          start={sheet.start}
          onSageAn={sageAn}
          onSchliessen={schliesse}
        />
      )}
    </section>
  )
})

/**
 * der leere zustand lädt ein: was eine ansage ist, in einem satz, und eine
 * leere bahn in der farbe des anderen, die darauf wartet, gefüllt zu werden.
 */
function Leer({ me, kannAnsagen }: { me: UserId; kannAnsagen: boolean }) {
  const er = other(me)
  return (
    <div className="mt-3 border-y border-linie py-5">
      <p className="display text-[26px] font-bold leading-[1.05] text-kreide">
        diese woche noch
        <br />
        keine ansage.
      </p>
      <p className="mt-2 max-w-[34ch] text-[13px] leading-5 text-kreide-60">
        {kannAnsagen
          ? `fordere ${er.name} heraus. liefert ${er.name}, gehen die punkte an ${er.name}. wenn nicht, an dich.`
          : `hier stehen die ansagen der woche, sobald eine läuft.`}
      </p>
      <div className="mt-4 flex gap-1" aria-hidden="true">
        {Array.from({ length: 4 }, (_, i) => (
          <span key={i} className="h-3 flex-1 rounded-[2px] border" style={{ borderColor: er.leer }} />
        ))}
      </div>
    </div>
  )
}
