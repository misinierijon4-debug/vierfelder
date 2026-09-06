import { useRef } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { Minus, Plus, Trash, X } from '@phosphor-icons/react'
import { area as areaDef, gewichtKey, user as userDef } from '../lib/types'
import type { FeldId, UserId, Zustand } from '../lib/types'
import { addDays, fromKey, langesDatum, toKey } from '../lib/dates'
import {
  hatMoeglicheDoppelerfassung,
  quelle,
  tageseinheiten,
  tagesWert,
} from '../lib/tracker'
import { EASE } from '../lib/motion'
import { useScrollSperre } from '../lib/scrollsperre'
import { useDialogFokus } from '../lib/dialogFokus'
import { Schritt } from './Schritt'

const UHRZEIT = new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit' })
const KURZDATUM = new Intl.DateTimeFormat('de-DE', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
})

export type Tagesauswahl = { user: UserId; area: FeldId; tag: string }

/** hh:mm in lokaler zeit, wie ein `input type="time"` sie haben will */
function zeitWert(zeitpunkt: string | null): string {
  if (!zeitpunkt) return ''
  const d = new Date(zeitpunkt)
  if (!Number.isFinite(d.getTime())) return ''
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

type Props = {
  zustand: Zustand
  auswahl: Tagesauswahl
  heute: string
  onSchliessen: () => void
  /** heute und eigene person: die getippten einheiten sind hier änderbar */
  editierbar?: boolean
  /** die `von`-spalte ist im aktiven backend schon vorhanden */
  zeitEditierbar?: boolean
  /** eigene person — nur ihre einheiten lassen sich ändern */
  eigene?: boolean
  onWertSetzen?: (id: string, wert: number) => void
  onZeitSetzen?: (id: string, von: string | null) => void
  onLoeschen?: (id: string) => void
}

function uhrzeit(zeitpunkt: string | null): string | null {
  if (!zeitpunkt) return null
  const d = new Date(zeitpunkt)
  return Number.isFinite(d.getTime()) ? UHRZEIT.format(d) : null
}

/**
 * was an einem tag wirklich passiert ist: jede durchführung einzeln, mit ihrer
 * dauer und ihrer uhrzeit. vergangene tage zeigt das fenster nur an; für heute
 * und die eigene person lassen sich die getippten einheiten hier direkt
 * ändern — wert, uhrzeit und löschen. gemessene sitzungen bleiben lesbar.
 */
export function Tagesdetail({
  zustand,
  auswahl,
  heute,
  onSchliessen,
  editierbar = false,
  zeitEditierbar = false,
  eigene = false,
  onWertSetzen,
  onZeitSetzen,
  onLoeschen,
}: Props) {
  const reduced = useReducedMotion()
  const schliessen = useRef<HTMLButtonElement>(null)
  const dialog = useRef<HTMLElement>(null)
  const person = userDef(auswahl.user)
  const feld = auswahl.area
  const bereich = feld === 'gewicht' ? null : areaDef(feld)
  const istGewicht = bereich === null
  const label = bereich?.label ?? 'gewicht'
  const einheit = bereich?.unit ?? 'kg'

  const liste = tageseinheiten(zustand, auswahl.user, auswahl.area, auswahl.tag)
  const gesamt = liste.reduce((s, e) => (e.einheit === einheit ? s + (e.wert ?? 0) : s), 0)
  /**
   * beim lesen misst der fokus minuten, gezählt werden aber seiten. die dauer
   * steht deshalb neben der summe und nicht darin — addiert ergäbe sie eine
   * zahl, die nichts bedeutet.
   */
  const dauer = liste.reduce((s, e) => (e.einheit === einheit ? s : s + (e.wert ?? 0)), 0)
  const ohneWert = liste.some((e) => e.wert === null)
  const kg = istGewicht ? zustand.gewichte[gewichtKey(auswahl.user, auswahl.tag)] : undefined
  const tagesQuelle = quelle(zustand, auswahl.user, auswahl.area, auswahl.tag)
  const gemesseneWerte = liste.filter(
    (e) => e.herkunft === 'gemessen' && e.einheit === einheit && e.wert !== null
  )
  const getippteWerte = liste.filter(
    (e) => e.herkunft === 'getippt' && e.einheit === einheit && e.wert !== null
  )
  const gemessenerAnteil = gemesseneWerte.length > 0
    ? gemesseneWerte.reduce((summe, e) => summe + e.wert!, 0)
    : null
  const getippterAnteil = getippteWerte.length > 0
    ? getippteWerte.reduce((summe, e) => summe + e.wert!, 0)
    : null
  const moeglicheDoppelerfassung =
    !istGewicht && hatMoeglicheDoppelerfassung(
      zustand,
      auswahl.user,
      auswahl.area,
      auswahl.tag
    )

  const datum = fromKey(auswahl.tag)
  const vergangen = auswahl.tag < heute

  /** heute und eigene person: nur die getippten einheiten sind änderbar */
  const bearbeitbar = editierbar && eigene && !vergangen
  const schritt = bereich?.step ?? 10

  const gemessene = liste.filter((e) => e.herkunft === 'gemessen').length
  const getippte = liste.length - gemessene
  // Ø der tageswerte der letzten 14 kalendertage, den ausgewählten mitgezählt
  const start = fromKey(auswahl.tag)
  let summe14 = 0
  for (let i = 0; i < 14; i++) {
    summe14 += tagesWert(zustand, auswahl.user, auswahl.area, toKey(addDays(start, -i)))
  }
  const schnitt14 = Math.round(summe14 / 14)

  useScrollSperre(true)
  useDialogFokus(dialog, schliessen, onSchliessen)

  return (
    <motion.div
      key="tagesdetail"
      initial={reduced ? { opacity: 0 } : { opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: reduced ? 0 : 0.16, ease: EASE }}
      className="fixed inset-0 z-50 flex items-end justify-center"
    >
      {/* der hintergrund schließt: auf dem telefon ist er die größte fläche */}
      <button
        type="button"
        tabIndex={-1}
        aria-hidden="true"
        aria-label="tagesansicht schließen"
        onClick={onSchliessen}
        className="absolute inset-0 block bg-black/55"
      />

      <motion.section
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tagesdetail-titel"
        tabIndex={-1}
        initial={reduced ? false : { y: 18 }}
        animate={{ y: 0 }}
        exit={reduced ? undefined : { y: 18 }}
        transition={{ duration: reduced ? 0 : 0.18, ease: EASE }}
        className="relative max-h-[92dvh] w-full max-w-[420px] overflow-y-auto overscroll-contain rounded-t-[6px] border-t border-linie-hell bg-grund px-5 pt-4 pb-[calc(env(safe-area-inset-bottom)+20px)]"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-[11px] text-kreide-52">
              <span className="block h-2 w-3 rounded-[1px]" style={{ background: person.farbe }} />
              {person.name}
            </p>
            <h2
              id="tagesdetail-titel"
              className="display mt-1 truncate text-[22px] font-semibold lowercase leading-none"
            >
              {label}
            </h2>
            <p className="mt-1.5 text-[11px] text-kreide-52">
              {langesDatum(datum)} · <span className="tnum">{KURZDATUM.format(datum)}</span>
            </p>
          </div>

          <button
            ref={schliessen}
            type="button"
            onClick={onSchliessen}
            aria-label="tagesansicht schließen"
            className="flex size-11 shrink-0 items-center justify-center rounded-[2px] border border-linie text-kreide-60"
          >
            <X size={14} weight="bold" />
          </button>
        </div>

        <div className="mt-4 border-t border-linie pt-3">
          {istGewicht ? (
            <p className="text-[13px] text-kreide-60">
              {kg === undefined ? (
                'nicht gewogen'
              ) : (
                <>
                  <span className="tnum text-[22px] font-bold text-kreide">
                    {kg.toFixed(1).replace('.', ',')}
                  </span>{' '}
                  kg
                </>
              )}
            </p>
          ) : liste.length === 0 ? (
            <p className="text-[13px] text-kreide-52">nichts eingetragen</p>
          ) : (
            <>
              <p className="flex flex-wrap items-baseline gap-1.5 text-[12px] text-kreide-52">
                <span className="tnum text-[15px] font-semibold text-kreide">{liste.length}</span>
                {tagesQuelle === 'gemischt'
                  ? liste.length === 1 ? 'eintrag' : 'einträge'
                  : liste.length === 1 ? 'einheit' : 'einheiten'}
                {gesamt > 0 && (
                  <>
                    <span aria-hidden>·</span>
                    <span className="tnum text-[15px] font-semibold text-kreide">{gesamt}</span>
                    {einheit} erfasste summe
                  </>
                )}
                {dauer > 0 && (
                  <>
                    <span aria-hidden>·</span>
                    <span className="tnum text-[15px] font-semibold text-kreide">{dauer}</span>
                    min gemessen
                  </>
                )}
              </p>

              <p className="mt-2 text-[10px] text-kreide-52">
                <span className="tnum">{gemessene}</span>{' '}
                {tagesQuelle === 'gemischt' ? 'messquellen' : 'gemessen'} ·{' '}
                <span className="tnum">{getippte}</span>{' '}
                {tagesQuelle === 'gemischt' ? 'manuelle einträge' : 'getippt'} · quelle:{' '}
                {tagesQuelle} ·{' '}
                Ø 14 tage (erfasst):{' '}
                <span className="tnum">{schnitt14}</span> {einheit}
              </p>

              {tagesQuelle === 'gemischt' && (
                <div className="mt-2.5 border-l-2 border-linie-hell pl-2.5 text-[10px] text-kreide-60">
                  <p>
                    {bereich.unit === 'min'
                      ? `${gemessenerAnteil === null ? 'messung ohne wert' : `${gemessenerAnteil} min gemessen`} + ${getippterAnteil === null ? 'manuell ohne wert' : `${getippterAnteil} min getippt`}`
                      : `${getippterAnteil === null ? 'manuell ohne wert' : `${getippterAnteil} ${einheit} getippt`} + ${dauer > 0 ? `${dauer} min gemessen` : 'messung ohne dauer'}`}
                  </p>
                  {moeglicheDoppelerfassung ? (
                    <p role="status" className="mt-1">
                      mögliche doppelerfassung: mindestens eine getippte minuten-einheit
                      überschneidet sich zeitlich mit einer messung. nichts wurde automatisch
                      zusammengeführt.
                    </p>
                  ) : (
                    <p className="mt-1">
                      gemessene und getippte anteile bleiben getrennt; ohne sichere
                      zeitüberschneidung wird nichts zusammengeführt.
                    </p>
                  )}
                </div>
              )}

              <ul className="mt-3 divide-y divide-linie border-t border-linie">
                {liste.map((e, i) => {
                  const zeit = uhrzeit(e.von ?? e.erfasst)
                  const aktuellerWert = e.wert ?? 0
                  const wertName = e.wert === null ? 'ohne wert' : `${e.wert} ${e.einheit}`
                  const einheitName = `${person.name}, ${label}, ${langesDatum(datum)}, eintrag ${i + 1}, ${wertName}${zeit ? ` um ${zeit} uhr` : ', ohne uhrzeit'}`
                  const zeile = (
                    <>
                      <span className="flex min-w-0 items-baseline gap-2">
                        <span className="tnum text-[11px] text-kreide-52">{i + 1}.</span>
                        <span className="truncate text-[12px] text-kreide-60">
                          {zeit ? `${zeit} uhr` : 'ohne uhrzeit'}
                          {e.herkunft === 'gemessen' && e.ort ? ` · ${e.ort}` : ''}
                        </span>
                      </span>
                      <span className="flex shrink-0 items-baseline gap-1.5">
                        {e.wert === null ? (
                          <span className="text-[12px] text-kreide-52">ohne wert</span>
                        ) : (
                          <>
                            <span className="tnum text-[14px] font-semibold text-kreide">
                              {e.wert}
                            </span>
                            <span className="text-[12px] text-kreide-52">{e.einheit}</span>
                          </>
                        )}
                        <span className="w-[52px] text-right text-[10px] text-kreide-52">
                          {e.herkunft}
                        </span>
                      </span>
                    </>
                  )
                  return (
                    bearbeitbar && e.herkunft === 'getippt' ? (
                      <li key={e.id} className="py-2">
                        <span className="flex items-baseline justify-between gap-3">{zeile}</span>
                        <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
                          <Schritt
                            label={`${einheitName} um ${schritt} ${einheit} verringern`}
                            disabled={aktuellerWert <= 0}
                            onClick={() => onWertSetzen?.(e.id, aktuellerWert - schritt)}
                          >
                            <Minus size={11} weight="bold" />
                          </Schritt>
                          <Schritt
                            label={`${einheitName} um ${schritt} ${einheit} erhöhen`}
                            onClick={() => onWertSetzen?.(e.id, aktuellerWert + schritt)}
                          >
                            <Plus size={11} weight="bold" />
                          </Schritt>
                          {zeitEditierbar ? (
                            <input
                              type="time"
                              aria-label={`${einheitName}, uhrzeit ändern`}
                              value={zeitWert(e.von ?? null)}
                              onChange={(ev) => {
                                const eingabe = ev.target.value
                                if (!eingabe) {
                                  onZeitSetzen?.(e.id, null)
                                  return
                                }
                                const [hh, mm] = eingabe.split(':')
                                onZeitSetzen?.(
                                  e.id,
                                  new Date(`${auswahl.tag}T${hh}:${mm}`).toISOString()
                                )
                              }}
                              className="min-h-11 w-28 rounded-[2px] bg-transparent text-center tnum text-[12px] text-kreide"
                            />
                          ) : (
                            <span className="flex min-h-11 w-28 items-center justify-center text-[10px] text-kreide-52">
                              zeit noch nicht verfügbar
                            </span>
                          )}
                          <button
                            type="button"
                            aria-label={`${einheitName} löschen`}
                            onClick={() => onLoeschen?.(e.id)}
                            className="flex size-11 shrink-0 items-center justify-center rounded-[2px] border border-linie text-kreide-60"
                          >
                            <Trash size={13} weight="bold" />
                          </button>
                        </span>
                      </li>
                    ) : (
                      <li key={e.id} className="flex items-baseline justify-between gap-3 py-2.5">
                        {zeile}
                      </li>
                    )
                  )
                })}
              </ul>

              {ohneWert && (
                <p className="mt-2.5 text-[10px] text-kreide-52">
                  für einheiten ohne wert wurde nie eine dauer erfasst. nachgetragen wird nichts.
                </p>
              )}
            </>
          )}
        </div>

        <p className="mt-4 border-t border-linie pt-3 text-[10px] text-kreide-52">
          {vergangen
            ? 'vergangene tage lassen sich nicht mehr ändern.'
            : editierbar
              ? 'heute änderst du hier direkt.'
              : 'heute änderst du oben in der zeile.'}
        </p>
      </motion.section>
    </motion.div>
  )
}
