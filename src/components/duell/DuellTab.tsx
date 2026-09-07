import { useEffect, useMemo, useState } from 'react'
import { CaretRight, PencilSimple, ShieldCheck, Trophy } from '@phosphor-icons/react'
import { user as userDef, other } from '../../lib/types'
import type { Abrechnung, UserId, Zustand } from '../../lib/types'
import { historieWochen, saisonHistorie } from '../../lib/duell'
import type { DuellMatch } from '../../lib/duell'
import { fromKey, isoWeek, istBilanzzeit } from '../../lib/dates'
import { useNeustartBlocker } from '../../lib/pwaBlocker'
import { RivalitaetsTicker } from './RivalitaetsTicker'

type Props = {
  zustand: Zustand
  woche: string[]
  me: UserId
  heute: Date
  /** der stand der laufenden woche, in App.tsx einmal gerechnet */
  match: DuellMatch
  wette: string
  onWette: (text: string) => void
  onZumTracker: () => void
  /** die archivierte sonntagsabrechnung dieser woche, wenn vorhanden */
  abrechnung?: Abrechnung | null
  /** alle Archive; abgeschlossene Wochen dürfen nie aus Rohdaten neu entstehen */
  abrechnungen: Abrechnung[]
  abschlussStatus: 'idle' | 'speichern' | 'fehler' | 'gespeichert'
  /** schließt die woche ab. fehlt der callback, tut der knopf nichts */
  onAbschluss?: () => void
}

export function DuellTab({
  zustand,
  woche,
  me,
  heute,
  match,
  wette,
  onWette,
  onZumTracker,
  abrechnung,
  abrechnungen,
  abschlussStatus,
  onAbschluss,
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
    () => saisonHistorie(
      zustand,
      heute,
      historieWochen(zustand, heute, abrechnungen),
      me,
      abrechnungen
    ),
    [zustand, heute, me, abrechnungen]
  )
  const [wetteEdit, setWetteEdit] = useState(false)
  const [wetteTemp, setWetteTemp] = useState(wette)
  const [wetteUndo, setWetteUndo] = useState<string | null>(null)
  useNeustartBlocker(wetteEdit && wetteTemp !== wette)
  const abschlussMoeglich = istBilanzzeit(heute)

  useEffect(() => {
    if (!wetteEdit) setWetteTemp(wette)
  }, [wette, wetteEdit])

  useEffect(() => {
    if (!wetteUndo) return
    const timer = window.setTimeout(() => setWetteUndo(null), 5000)
    return () => window.clearTimeout(timer)
  }, [wetteUndo])

  const speichereWette = () => {
    const sauber = wetteTemp.trim()
    if (!sauber) return
    onWette(sauber)
    setWetteEdit(false)
  }

  const loescheWette = () => {
    if (!wette) return
    setWetteUndo(wette)
    onWette('')
    setWetteEdit(false)
  }

  const stelleWetteWiederHer = () => {
    if (!wetteUndo) return
    onWette(wetteUndo)
    setWetteUndo(null)
  }

  const quote = (wert: number | null) => (wert === null ? '—' : `${wert}%`)

  return (
    <div className="pb-7">
      <section aria-labelledby="fronten-titel" className="border-t border-linie">
        <div className="flex min-h-11 items-center justify-between">
          <h2 id="fronten-titel" className="text-[12px] font-bold uppercase tracking-[0.12em] text-kreide">
            die {match.fronten.length} fronten
          </h2>
          <span className="tnum text-[12px] text-kreide-60">
            <b style={{ color: ich.farbe }}>{match.frontenScore.ich}</b> :{' '}
            <b style={{ color: er.farbe }}>{match.frontenScore.er}</b>
          </span>
        </div>

        <div className="divide-y divide-linie border-y border-linie">
          {match.fronten.map((front) => {
            const farbe =
              front.halter === 'ich'
                ? ich.farbe
                : front.halter === 'er'
                  ? er.farbe
                  : 'var(--kreide-52)'
            const status =
              front.halter === 'ich'
                ? 'du führst'
                : front.halter === 'er'
                  ? `${er.name} führt`
                  : front.halter === 'offen'
                    ? 'noch offen'
                    : 'gleichstand'
            return (
              <button
                key={front.id}
                type="button"
                onClick={onZumTracker}
                className="group flex min-h-12 w-full flex-wrap items-center justify-between gap-x-3 gap-y-1 bg-flaeche/35 px-3 py-2 text-left transition-colors hover:bg-flaeche focus-visible:bg-flaeche"
                aria-label={`${front.label}: ${front.ichPunkte} zu ${front.erPunkte}, ${status}. Zum Tracker`}
              >
                <span className="text-[13px] font-bold text-kreide">{front.label}</span>
                <span className="ml-auto text-[11px] font-semibold" style={{ color: farbe }}>
                  {status}
                </span>
                <span className="tnum min-w-[42px] text-right text-[13px] font-bold">
                  <span style={{ color: ich.farbe }}>{front.ichPunkte}</span>
                  <span className="px-1 text-kreide-52">:</span>
                  <span style={{ color: er.farbe }}>{front.erPunkte}</span>
                </span>
                <CaretRight size={14} className="text-kreide-52 group-hover:text-kreide" aria-hidden="true" />
              </button>
            )
          })}
        </div>
      </section>

      <section aria-labelledby="rest-titel" className="mt-5 border-t border-linie pt-3">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <h2 id="rest-titel" className="text-[12px] font-bold uppercase tracking-[0.12em] text-kreide">
            rechner
          </h2>
          <span className="tnum text-[11px] text-kreide-52">
            offen: du {match.restprogramm.restMaxIch} · {er.name} {match.restprogramm.restMaxEr}
          </span>
        </div>
        <p className="mt-2 text-[13px] leading-5 text-kreide-60">
          {match.restprogramm.uneinholbarIch ? (
            <strong style={{ color: ich.farbe }}>dein wochensieg ist rechnerisch sicher.</strong>
          ) : match.restprogramm.uneinholbarEr ? (
            <strong style={{ color: er.farbe }}>{er.name} ist rechnerisch nicht mehr einzuholen.</strong>
          ) : match.restprogramm.matchballIch ? (
            <strong style={{ color: ich.farbe }}>matchball: noch ein punkt sichert dir die woche.</strong>
          ) : match.restprogramm.matchballEr ? (
            <strong style={{ color: er.farbe }}>matchball für {er.name} · du musst jetzt antworten.</strong>
          ) : (
            <>heute und die folgetage sind voll eingerechnet. kein vorsprung ist bereits sicher.</>
          )}
        </p>
        <button
          type="button"
          onClick={onZumTracker}
          className="mt-3 flex min-h-11 w-full items-center justify-center rounded-[2px] border border-linie-hell bg-flaeche px-4 text-[13px] font-bold text-kreide transition-colors hover:bg-linie"
        >
          nächsten punkt holen
        </button>
      </section>

      <section aria-labelledby="beleg-titel" className="mt-5 border-t border-linie pt-3">
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

      <section aria-labelledby="ticker-titel" className="mt-5 border-t border-linie pt-3">
        <div className="mb-2 flex min-h-8 flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <h2 id="ticker-titel" className="text-[12px] font-bold uppercase tracking-[0.12em] text-kreide">
            aktivitätsfeed
          </h2>
          <span className="text-[11px] text-kreide-52">gemessen oder getippt</span>
        </div>
        <RivalitaetsTicker zustand={zustand} woche={woche} me={me} limit={5} />
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

      <section aria-labelledby="wette-titel" className="mt-5 border-t border-linie pt-3">
        <div className="flex items-center justify-between">
          <h2 id="wette-titel" className="text-[12px] font-bold uppercase tracking-[0.12em] text-kreide">
            wetteinsatz
          </h2>
          {!wetteEdit && (
            <button
              type="button"
              onClick={() => setWetteEdit(true)}
              className="flex min-h-11 items-center gap-1.5 px-2 text-[12px] font-semibold text-kreide-60 hover:text-kreide"
            >
              <PencilSimple size={14} aria-hidden="true" /> ändern
            </button>
          )}
        </div>
        {wetteEdit ? (
          <div className="space-y-2">
            <label htmlFor="duell-wette" className="sr-only">Gemeinsamer Wetteinsatz dieser Woche</label>
            <input
              id="duell-wette"
              type="text"
              maxLength={160}
              value={wetteTemp}
              onChange={(e) => setWetteTemp(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') speichereWette() }}
              className="min-h-11 w-full rounded-[2px] border border-linie bg-flaeche px-3 text-[13px] text-kreide focus:border-linie-hell"
              placeholder="verlierer kocht abendessen"
              autoFocus
            />
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setWetteEdit(false)} className="min-h-11 rounded-[2px] border border-linie text-[12px] font-semibold text-kreide-60 hover:text-kreide">
                abbrechen
              </button>
              <button type="button" onClick={speichereWette} disabled={!wetteTemp.trim()} className="min-h-11 rounded-[2px] bg-kreide text-[12px] font-bold text-grund disabled:opacity-40">
                gemeinsam speichern
              </button>
            </div>
            {wette && (
              <button
                type="button"
                onClick={loescheWette}
                className="min-h-11 w-full rounded-[2px] border border-linie-hell text-[12px] font-semibold text-kreide"
              >
                einsatz entfernen
              </button>
            )}
          </div>
        ) : (
          <p className="break-words border-y border-linie bg-flaeche/35 px-3 py-3 text-[13px] font-semibold leading-5 text-kreide [overflow-wrap:anywhere]">
            {wette || 'noch kein einsatz vereinbart.'}
          </p>
        )}
        {wetteUndo && !wetteEdit && !wette && (
          <p role="status" aria-live="polite" className="mt-2 flex min-h-11 flex-wrap items-center justify-between gap-2 text-[11px] text-kreide-60">
            <span>einsatz entfernt</span>
            <button
              type="button"
              onClick={stelleWetteWiederHer}
              className="min-h-11 px-2 font-semibold text-kreide underline underline-offset-4"
            >
              rückgängig
            </button>
          </p>
        )}
      </section>
    </div>
  )
}

function BilanzZahl({ label, wert, farbe }: { label: string; wert: number; farbe: string }) {
  return (
    <div>
      <div className="text-[11px] text-kreide-52">{label}</div>
      <div className="tnum text-[20px] font-bold" style={{ color: farbe }}>{wert}</div>
    </div>
  )
}
