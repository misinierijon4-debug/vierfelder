import { Suspense, lazy, memo, useMemo } from 'react'
import { ShieldCheck, Trophy } from '@phosphor-icons/react'
import { user as userDef, other } from '../../lib/types'
import type { Abrechnung, UserId, Zustand } from '../../lib/types'
import { historieWochen, saisonHistorie } from '../../lib/duell'
import type { DuellMatch } from '../../lib/duell'
import { fromKey, isoWeek, istBilanzzeit } from '../../lib/dates'
import type { AnsageAntwort } from './AnsagenBereich'
import { wochenAnsagePunkte, zaehltAusZustand } from '../../lib/ansagen'
import type { Ansage, AnsageFeld } from '../../lib/ansagen'

type Props = {
  zustand: Zustand
  me: UserId
  heute: Date
  /** der stand der laufenden woche, in App.tsx einmal gerechnet */
  match: DuellMatch
  /** die archivierte sonntagsabrechnung dieser woche, wenn vorhanden */
  abrechnung?: Abrechnung | null
  /** alle Archive; abgeschlossene Wochen dürfen nie aus Rohdaten neu entstehen */
  abrechnungen: Abrechnung[]
  abschlussStatus: 'idle' | 'speichern' | 'fehler' | 'gespeichert'
  /** schließt die woche ab. fehlt der callback, tut der knopf nichts */
  onAbschluss?: () => void
  /** die ansagen beider personen. fehlen sie, kennt das backend noch keine — dann kein bereich */
  ansagen?: Ansage[]
  /** sagt an. fehlt er, bleiben die ansagen nur zum ansehen */
  onSageAn?: (feld: AnsageFeld) => Promise<AnsageAntwort>
}

const KEINE_ANSAGEN: Ansage[] = []

/**
 * der ansagen-bereich haengt nicht am startpfad: vorschlaege, eni-sprueche und
 * ihre pruefung braucht erst, wer den duell-tab oeffnet. das budget in
 * scripts/check-web-build.mjs misst genau diesen unterschied.
 */
const AnsagenBereich = lazy(() =>
  import('./AnsagenBereich').then((modul) => ({ default: modul.AnsagenBereich }))
)

export const DuellTab = memo(function DuellTab({
  zustand,
  me,
  heute,
  match,
  abrechnung,
  abrechnungen,
  abschlussStatus,
  onAbschluss,
  ansagen,
  onSageAn,
}: Props) {
  const ich = userDef(me)
  const er = other(me)
  const abrechnungKw = abrechnung ? isoWeek(fromKey(abrechnung.woche)) : null
  const abrechnungName =
    abrechnung?.sieger === me ? ich.name : abrechnung?.sieger === er.id ? er.name : 'unentschieden'
  const abrechnungFarbe =
    abrechnung?.sieger === me ? ich.farbe : abrechnung?.sieger === er.id ? er.farbe : 'var(--kreide-52)'
  const archivHinweis = abrechnung?.archivQuelle === 'legacy_client'
    ? 'legacy-archiv'
    : abrechnung?.archivQuelle === 'server_nachgeholt'
      ? 'nachgeholt'
      : null
  const historie = useMemo(
    () => {
      const zaehlt = zaehltAusZustand(zustand)
      return saisonHistorie(
        zustand,
        heute,
        historieWochen(zustand, heute, abrechnungen),
        me,
        abrechnungen,
        (montag) => wochenAnsagePunkte(zaehlt, ansagen ?? KEINE_ANSAGEN, montag, heute)
      )
    },
    [zustand, heute, me, abrechnungen, ansagen]
  )
  const abschlussMoeglich = istBilanzzeit(heute)

  const quote = (wert: number | null) => (wert === null ? '—' : `${wert}%`)

  return (
    <div className="pb-7">
      {ansagen && (
        <Suspense fallback={null}>
          <AnsagenBereich zustand={zustand} me={me} heute={heute} ansagen={ansagen} onSageAn={onSageAn} />
        </Suspense>
      )}

      <section aria-labelledby="beleg-titel" className="mt-5 first:mt-0 border-t border-linie pt-3">
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <h2 id="beleg-titel" className="flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-[0.12em] text-kreide">
            <ShieldCheck size={15} weight="fill" aria-hidden="true" /> belegquote
          </h2>
          <span className="min-w-0 text-right text-[11px] leading-4 text-kreide-52">entscheidet bei punktgleichstand</span>
        </div>
        <div className="mt-3 grid grid-cols-2 divide-x divide-linie border-y border-linie bg-flaeche/35">
          {[
            { person: ich, info: match.belegIch, du: true },
            { person: er, info: match.belegEr, du: false },
          ].map(({ person, info, du }) => (
            <div key={person.id} className="px-3 py-3">
              <div className="text-[11px] text-kreide-52">{person.name}{du ? ' · du' : ''}</div>
              <div className="tnum mt-0.5 text-[24px] font-bold" style={{ color: person.farbe }}>
                {quote(info.quote)}
              </div>
              <div className="text-[11px] text-kreide-60">
                {info.gesamt === 0
                  ? 'noch keine wertung'
                  : `${info.belegt} von ${info.gesamt} belegt${info.gemischt > 0 ? ` · ${info.gemischt} gemischt` : ''}`}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section aria-labelledby="bilanz-titel" className="mt-5 border-t border-linie pt-3">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <h2 id="bilanz-titel" className="flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-[0.12em] text-kreide">
            <Trophy size={15} weight="fill" aria-hidden="true" /> ewige bilanz
          </h2>
          {historie.aktuelleSerie.halter !== 'keiner' && (
            <span className="text-[11px] font-bold" style={{ color: historie.aktuelleSerie.halter === 'ich' ? ich.farbe : er.farbe }}>
              {historie.aktuelleSerie.anzahl}er-serie
            </span>
          )}
        </div>
        {abrechnung ? (
          <div className="mt-3 flex min-h-11 flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-[2px] border border-linie bg-flaeche px-3 py-2 text-[12px]">
            <span className="text-kreide-60">
              kw <span className="tnum">{abrechnungKw}</span> abgerechnet
              {archivHinweis && (
                <span className="ml-1.5 text-[10px] uppercase tracking-[0.08em] text-kreide-52">
                  {archivHinweis}
                </span>
              )}
            </span>
            <span className="text-kreide-52" aria-hidden="true">·</span>
            <span className="font-bold" style={{ color: abrechnungFarbe }}>
              sieger: {abrechnungName}
            </span>
          </div>
        ) : (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <span
              role="status"
              aria-live="polite"
              className="text-[10px] uppercase tracking-[0.12em] text-kreide-52"
            >
              {abschlussStatus === 'speichern'
                ? 'abschluss wird gespeichert'
                : abschlussStatus === 'fehler'
                  ? 'abschluss nicht gespeichert'
                  : 'sonntag 18 uhr finale'}
            </span>
            <button
              type="button"
              disabled={!abschlussMoeglich || !onAbschluss || abschlussStatus === 'speichern'}
              onClick={onAbschluss}
              className="min-h-11 rounded-[2px] border border-linie-hell bg-flaeche px-4 text-[13px] font-bold text-kreide transition-colors hover:bg-linie disabled:cursor-default disabled:opacity-35"
            >
              {abschlussStatus === 'speichern'
                ? 'wird gespeichert …'
                : abschlussStatus === 'fehler'
                  ? 'erneut versuchen'
                  : 'woche abschließen'}
            </button>
          </div>
        )}
        <div className="mt-3 grid grid-cols-3 divide-x divide-linie border-y border-linie bg-flaeche/35 py-2 text-center">
          <BilanzZahl label={ich.name} wert={historie.siegeIch} farbe={ich.farbe} />
          <BilanzZahl label="remis" wert={historie.unentschieden} farbe="var(--kreide)" />
          <BilanzZahl label={er.name} wert={historie.siegeEr} farbe={er.farbe} />
        </div>
        {historie.letzteWochen.length === 0 ? (
          <p className="py-3 text-[12px] text-kreide-52">noch keine abgeschlossene woche mit punkten.</p>
        ) : (
          <div className="divide-y divide-linie">
            {historie.letzteWochen.slice(0, 4).map((w) => (
              <div key={w.wocheKey} className="flex min-h-11 flex-wrap items-center justify-between gap-x-3 gap-y-1 py-1 text-[12px]">
                <span className="text-kreide-52">
                  <span className="tnum block">kw {w.kw}</span>
                  <span className="block text-[10px]">
                    {w.archivQuelle === 'legacy_client'
                      ? 'legacy-archiv'
                      : w.archivQuelle === 'server_nachgeholt'
                        ? 'nachgeholt'
                        : w.herkunft}
                  </span>
                </span>
                <span
                  className="tnum font-bold"
                  aria-label={w.herkunft === 'archiviert'
                    ? w.grund === 'beleg'
                      ? `archivierter beleg: ${w.belegIch} zu ${w.belegEr}`
                      : `archivierter abstand aus deiner sicht: ${w.differenz}`
                    : `${w.punkteIch} zu ${w.punkteEr}`}
                >
                  {w.punkteIch === null || w.punkteEr === null ? (
                    w.grund === 'beleg' ? (
                      <span className="text-[11px] text-kreide-60">
                        beleg <b style={{ color: ich.farbe }}>{w.belegIch}</b>
                        <span className="px-1 text-kreide-52">:</span>
                        <b style={{ color: er.farbe }}>{w.belegEr}</b>
                      </span>
                    ) : (
                      <span style={{ color: w.differenz > 0 ? ich.farbe : w.differenz < 0 ? er.farbe : 'var(--kreide-52)' }}>
                        {w.differenz > 0 ? '+' : w.differenz === 0 ? '±' : ''}{w.differenz}
                      </span>
                    )
                  ) : (
                    <>
                      <span style={{ color: ich.farbe }}>{w.punkteIch}</span>
                      <span className="px-1.5 text-kreide-52">:</span>
                      <span style={{ color: er.farbe }}>{w.punkteEr}</span>
                    </>
                  )}
                </span>
                <span className="min-w-[82px] text-right text-[11px] font-bold" style={{ color: w.sieger === 'ich' ? ich.farbe : w.sieger === 'er' ? er.farbe : 'var(--kreide-52)' }}>
                  {w.sieger === 'ich' ? `sieg ${ich.name}` : w.sieger === 'er' ? `sieg ${er.name}` : 'remis'}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

    </div>
  )
})

function BilanzZahl({ label, wert, farbe }: { label: string; wert: number; farbe: string }) {
  return (
    <div>
      <div className="text-[11px] text-kreide-52">{label}</div>
      <div className="tnum text-[20px] font-bold" style={{ color: farbe }}>{wert}</div>
    </div>
  )
}
