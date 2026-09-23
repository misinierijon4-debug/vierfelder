import { memo, useEffect, useMemo, useState } from 'react'
import { Megaphone } from '@phosphor-icons/react'
import { user as userDef, other } from '../../lib/types'
import type { UserId, Zustand } from '../../lib/types'
import {
  ANSAGE_FEHLERTEXT,
  ANSAGEN_JE_WOCHE,
  EINSATZ,
  ansagePunkte,
  ansageStand,
  ansageVorschlaege,
  ansageZeitraum,
  ansageZielText,
  verbleibendeAnsagen,
  zaehltAusZustand,
} from '../../lib/ansagen'
import type { Ansage, AnsageFehler, AnsageFeld, AnsageStand } from '../../lib/ansagen'
import { gezeigteVorschlaege, ladeAnsageSprueche } from '../../lib/ansageSprueche'
import type { SpruchAuswahl } from '../../../supabase/functions/_shared/ansageSprueche'
import { addDays, startOfWeek, toKey } from '../../lib/dates'

export type AnsageAntwort = { ansage: Ansage } | { fehler: AnsageFehler | 'gesperrt' | 'netz' }

type Props = {
  zustand: Zustand
  me: UserId
  /** tag und uhrzeit, nach denen zeitraum und stand gerechnet werden */
  heute: Date
  ansagen: Ansage[]
  /** fehlt er, zeigt der bereich nur die laufenden ansagen */
  onSageAn?: (feld: AnsageFeld) => Promise<AnsageAntwort>
}

const FEHLER_SONST: Record<'gesperrt' | 'netz', string> = {
  gesperrt: 'gerade kann nichts gespeichert werden.',
  netz: 'ansage nicht bestätigt. stand wird abgeglichen.',
}

function wochentag(tag: string): string {
  const [j, m, t] = tag.split('-').map(Number)
  return ['so', 'mo', 'di', 'mi', 'do', 'fr', 'sa'][new Date(j!, m! - 1, t!).getDay()]!
}

/**
 * die ansagen im duell: was läuft, was entschieden ist und — solange man noch
 * darf — ENIs vorschläge. die zahlen kommen aus `ansagen.ts`, ENI schreibt nur
 * den spruch. regeln: `docs/ansagen.md`.
 */
export const AnsagenBereich = memo(function AnsagenBereich({ zustand, me, heute, ansagen, onSageAn }: Props) {
  const ich = userDef(me)
  const er = other(me)
  const zaehlt = useMemo(() => zaehltAusZustand(zustand), [zustand])
  const montag = toKey(startOfWeek(heute))
  const sonntag = toKey(addDays(startOfWeek(heute), 6))

  const dieseWoche = useMemo(
    () =>
      ansagen
        .filter((a) => a.bis >= montag && a.bis <= sonntag)
        .map((a) => ({ ansage: a, stand: ansageStand(zaehlt, a, heute) })),
    [ansagen, montag, sonntag, zaehlt, heute]
  )
  const verbleibend = verbleibendeAnsagen(ansagen, me, heute)
  const zeitraum = ansageZeitraum(heute)
  const vorschlaege = useMemo(
    () => ansageVorschlaege(zaehlt, ansagen, me, er.id, heute),
    [zaehlt, ansagen, me, er.id, heute]
  )

  // ENI fragen, sobald es etwas zu wählen gibt. bis die antwort da ist, stehen
  // die vorlagen — die knöpfe funktionieren von anfang an.
  const [auswahl, setAuswahl] = useState<{ key: string; liste: SpruchAuswahl[] | null } | null>(null)
  const vorschlagKey = vorschlaege.map((v) => `${v.feld}:${v.ziel}`).join('|')
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

  const [bestaetigen, setBestaetigen] = useState<AnsageFeld | null>(null)
  const [laeuft, setLaeuft] = useState<AnsageFeld | null>(null)
  const [meldung, setMeldung] = useState<string | null>(null)

  const sageAn = async (feld: AnsageFeld) => {
    if (!onSageAn || laeuft) return
    setLaeuft(feld)
    setMeldung(null)
    const antwort = await onSageAn(feld)
    setLaeuft(null)
    setBestaetigen(null)
    if ('ansage' in antwort) {
      setMeldung(`angesagt: ${ansageZielText(antwort.ansage.feld, antwort.ansage.ziel)} bis samstag.`)
      return
    }
    setMeldung(
      antwort.fehler === 'gesperrt' || antwort.fehler === 'netz'
        ? FEHLER_SONST[antwort.fehler]
        : ANSAGE_FEHLERTEXT[antwort.fehler]
    )
  }

  return (
    <section aria-labelledby="ansagen-titel" className="mt-5 first:mt-0 border-t border-linie pt-3">
      <div className="flex min-h-8 flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <h2 id="ansagen-titel" className="flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-[0.12em] text-kreide">
          <Megaphone size={15} weight="fill" aria-hidden="true" /> ansagen
        </h2>
        <span className="tnum text-[11px] text-kreide-52">
          {verbleibend} von {ANSAGEN_JE_WOCHE} übrig
        </span>
      </div>

      {dieseWoche.length > 0 ? (
        <ul className="mt-2 divide-y divide-linie border-y border-linie" aria-label="ansagen dieser woche">
          {dieseWoche.map(({ ansage, stand }) => (
            <AnsageZeile key={ansage.id} ansage={ansage} stand={stand} me={me} />
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-[12px] text-kreide-52">diese woche noch keine ansage.</p>
      )}

      {onSageAn && (
        verbleibend === 0 ? (
          <p className="mt-3 text-[12px] text-kreide-60">deine ansagen dieser woche sind raus. montag gibt es neue.</p>
        ) : !zeitraum ? (
          <p className="mt-3 text-[12px] text-kreide-60">ansagen gehen montag bis donnerstag. montag geht es weiter.</p>
        ) : gezeigt.length === 0 ? (
          <p className="mt-3 text-[12px] text-kreide-60">für {er.name} gibt es gerade kein faires ziel.</p>
        ) : (
          <div className="mt-3">
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
              <h3 className="text-[11px] font-bold uppercase tracking-[0.12em] text-kreide-60">
                eni schlägt vor
              </h3>
              <span aria-live="polite" className="text-[10px] text-kreide-52">
                {eniLaeuft ? 'eni überlegt …' : ''}
              </span>
            </div>
            <ul className="mt-2 space-y-2">
              {gezeigt.map((v) => {
                const offen = bestaetigen === v.feld
                const sendet = laeuft === v.feld
                return (
                  <li key={v.feld} className="rounded-[2px] border border-linie bg-flaeche/35 px-3 py-2.5">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                      <span className="text-[14px] font-bold text-kreide">
                        {ansageZielText(v.feld, v.ziel)} <span className="font-semibold text-kreide-60">bis sa</span>
                      </span>
                      <span className="tnum text-[10px] text-kreide-52" aria-label={`letzte vier wochen: ${v.verlauf.join(', ')}`}>
                        zuletzt {v.verlauf.join(' · ')}
                      </span>
                    </div>
                    <p className="mt-1 text-[12px] leading-5 text-kreide-60 [overflow-wrap:anywhere]">{v.spruch}</p>
                    {offen ? (
                      <div className="mt-2 grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => setBestaetigen(null)}
                          disabled={sendet}
                          className="min-h-11 rounded-[2px] border border-linie text-[12px] font-semibold text-kreide-60 hover:text-kreide disabled:opacity-40"
                        >
                          abbrechen
                        </button>
                        <button
                          type="button"
                          onClick={() => void sageAn(v.feld)}
                          disabled={sendet}
                          className="min-h-11 rounded-[2px] bg-kreide text-[12px] font-bold text-grund disabled:opacity-40"
                        >
                          {sendet ? 'wird angesagt …' : `${EINSATZ} punkt setzen`}
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setBestaetigen(v.feld)
                          setMeldung(null)
                        }}
                        disabled={laeuft !== null}
                        className="mt-2 min-h-11 w-full rounded-[2px] border border-linie-hell bg-flaeche text-[12px] font-bold text-kreide transition-colors hover:bg-linie disabled:opacity-40"
                      >
                        ansagen
                      </button>
                    )}
                  </li>
                )
              })}
            </ul>
          </div>
        )
      )}

      <p aria-live="polite" className="mt-2 min-h-5 text-[11px] text-kreide-60">
        {meldung}
      </p>
      <p className="text-[11px] leading-4 text-kreide-52">
        einsatz {EINSATZ} punkt. scheitert {er.name}, bekommst du ihn zurück und{' '}
        <b style={{ color: ich.farbe }}>+1</b>. schafft {er.name} es, bleibt es bei{' '}
        <b style={{ color: er.farbe }}>−1</b>. gezählt wird nur gemessen, beim gewicht nur am selben tag eingetragen.
      </p>
    </section>
  )
})

function AnsageZeile({ ansage, stand, me }: { ansage: Ansage; stand: AnsageStand; me: UserId }) {
  const von = userDef(ansage.von)
  const an = userDef(ansage.an)
  const punkte = ansagePunkte(stand.status, ansage)[ansage.von]
  const vonText = ansage.von === me ? 'du' : von.name
  const anText = ansage.an === me ? 'dich' : an.name
  const statusText =
    stand.status === 'geschafft'
      ? `${ansage.an === me ? 'du hast' : `${an.name} hat`} geliefert`
      : stand.status === 'verfehlt'
        ? `${ansage.an === me ? 'du hast' : `${an.name} hat`} verfehlt`
        : `${stand.erreicht}/${stand.ziel} · noch ${stand.offeneTage} ${stand.offeneTage === 1 ? 'tag' : 'tage'}`
  const hinweis =
    stand.status === 'laeuft' && ansage.an === me
      ? `liefer ${stand.ziel - stand.erreicht}× mehr, dann ist ${von.name}s einsatz weg.`
      : null

  return (
    <li className="bg-flaeche/35 px-3 py-2 text-[12px]">
      <div className="flex min-h-8 flex-wrap items-center justify-between gap-x-2 gap-y-1">
        <span className="flex min-w-0 flex-wrap items-center gap-x-1.5">
          <span className="size-2 rounded-full" style={{ background: von.farbe }} aria-hidden="true" />
          <span className="font-semibold" style={{ color: von.farbe }}>{vonText}</span>
          <span className="text-kreide-52">an {anText}:</span>
          <span className="font-bold text-kreide">{ansageZielText(ansage.feld, ansage.ziel)}</span>
          <span className="text-kreide-52">
            {wochentag(ansage.ab)}–{wochentag(ansage.bis)}
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-2">
          <span className="tnum text-[11px] text-kreide-60">{statusText}</span>
          <span
            className="tnum min-w-[26px] text-right text-[12px] font-bold"
            style={{ color: von.farbe }}
            aria-label={`${vonText}: ${punkte > 0 ? '+' : ''}${punkte} ${stand.status === 'laeuft' ? 'einsatz' : 'punkt'}`}
          >
            {punkte > 0 ? `+${punkte}` : `−${Math.abs(punkte)}`}
          </span>
        </span>
      </div>
      {hinweis && <p className="text-[11px] text-kreide-52">{hinweis}</p>}
    </li>
  )
}
