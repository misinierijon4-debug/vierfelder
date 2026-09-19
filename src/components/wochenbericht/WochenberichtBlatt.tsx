import { useEffect, useMemo, useRef } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { CaretLeft, CaretRight, X } from '@phosphor-icons/react'
import { FELDER, USERS } from '../../lib/types'
import type { Schlafnacht, UserDef, UserId, Zustand } from '../../lib/types'
import { TAGKUERZEL, addDays, fromKey, toKey } from '../../lib/dates'
import { wochenZeitraum } from '../../lib/kalender'
import { fokusRingLoesen } from '../../lib/dialogFokus'
import { useScrollSperre } from '../../lib/scrollsperre'
import { useDialogNachlauf } from '../../lib/dialogNachlauf'
import { BERICHT, EASE } from '../../lib/motion'
import { alsDauer, baueWochenbericht } from '../../lib/wochenbericht'
import type { Wochenbericht } from '../../lib/wochenbericht'
import { useWochenberichtArchiv } from '../../lib/wochenberichtArchiv'
import type { WochenberichtTexte } from '../../lib/wochenberichtTexte'
import { BerichtAbschnitt } from './BerichtAbschnitt'
import { BerichtKennzahlen } from './BerichtKennzahlen'
import { BerichtRaster } from './BerichtRaster'
import { BerichtVerlauf } from './BerichtVerlauf'
import { BerichtBereiche } from './BerichtBereiche'
import { BerichtSchlaf } from './BerichtSchlaf'
import { BerichtGewicht } from './BerichtGewicht'
import { BerichtEni } from './BerichtEni'
import type { EniTextStatus } from './BerichtEni'

type Props = {
  /** montag der woche; null heisst geschlossen */
  woche: string | null
  zustand: Zustand
  naechte: Schlafnacht[]
  heuteKey: string
  /** frueheste woche, zu der es ueberhaupt daten gibt */
  ersteWoche: string | null
  eniStatus: EniTextStatus
  eniTexte: WochenberichtTexte | null
  archivBericht?: Wochenbericht | null
  archivHinweis?: string | null
  onEniErneut?: () => void
  onWocheWechseln: (woche: string) => void
  onSchliessen: () => void
  onMitEniReden: (woche: string) => void
}

/** Archiv und Berechnung bleiben zusammen im erst beim Oeffnen geladenen Modul. */
export function WochenberichtVerbunden({ lokal, bereit, ...props }: Omit<Props, 'eniStatus' | 'eniTexte'> & { lokal: boolean; bereit: boolean }) {
  const archiv = useWochenberichtArchiv(props.woche, props.zustand, props.naechte, props.heuteKey, lokal, bereit)
  return <WochenberichtBlatt {...props} eniStatus={archiv.status} eniTexte={archiv.texte}
    archivBericht={archiv.bericht} archivHinweis={archiv.hinweis} onEniErneut={archiv.erneut} />
}

/**
 * Der Wochenbericht als eigenes Blatt.
 *
 * Er wird nicht erfragt, er ist da: alle Zahlen stehen im geladenen Zustand,
 * der Bericht rechnet sie beim Oeffnen aus. Kein Ladebalken, kein Chat, keine
 * Nachricht, die man erst anfordert — aufschlagen und lesen.
 *
 * Aufgebaut wie ein Blatt Papier von oben nach unten: erst das Ergebnis, dann
 * die Zahlen, dann die Bilder, ganz am Ende die Meinung. Wer nur wissen will,
 * wie die Woche ausging, hoert nach zwei Zentimetern auf zu lesen.
 */
export function WochenberichtBlatt({
  woche,
  zustand,
  naechte,
  heuteKey,
  ersteWoche,
  eniStatus,
  eniTexte,
  archivBericht,
  archivHinweis,
  onEniErneut,
  onWocheWechseln,
  onSchliessen,
  onMitEniReden,
}: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const offen = woche !== null
  const sichtbar = useDialogNachlauf(offen)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (offen && !dialog.open) dialog.showModal()
    if (!offen && dialog.open) {
      dialog.close()
      fokusRingLoesen()
    }
  }, [offen])

  useScrollSperre(offen)

  // jede woche faengt oben an. sonst landet man mitten in den diagrammen
  useEffect(() => {
    if (woche) scrollRef.current?.scrollTo({ top: 0 })
  }, [woche])

  const laufendeWoche = useMemo(() => {
    const heute = fromKey(heuteKey)
    return toKey(addDays(heute, -((heute.getDay() + 6) % 7)))
  }, [heuteKey])

  const kannZurueck = woche !== null && (ersteWoche === null || woche > ersteWoche)
  const kannVor = woche !== null && woche < laufendeWoche

  const wechsle = (schritt: -1 | 1) => {
    if (!woche) return
    if (schritt < 0 && !kannZurueck) return
    if (schritt > 0 && !kannVor) return
    onWocheWechseln(toKey(addDays(fromKey(woche), schritt * 7)))
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="wochenbericht-titel"
      onClose={onSchliessen}
      className="m-0 size-full max-h-none max-w-none overflow-hidden bg-grund p-0 text-kreide backdrop:bg-grund"
    >
      {sichtbar && woche && (
        <div className="flex h-dvh flex-col bg-grund">
          <header
            className="vollbild-safe-x grid shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-3 border-b border-linie pb-3"
            style={{ paddingTop: 'calc(env(safe-area-inset-top) + 0.75rem)' }}
          >
            <button
              type="button"
              aria-label="Wochenbericht schließen"
              onClick={onSchliessen}
              className="flex size-11 items-center justify-center rounded-full border border-linie bg-flaeche text-kreide transition-colors duration-150 hover:border-linie-hell focus-visible:outline-none"
            >
              <X size={20} weight="bold" aria-hidden="true" />
            </button>

            <h2 id="wochenbericht-titel" className="text-balance text-[16px] font-bold text-kreide">
              wochenbericht
            </h2>

            <span aria-hidden="true" />
          </header>

          <div className="vollbild-safe-x shrink-0 border-b border-linie">
            <div className="mx-auto flex w-full max-w-[420px] items-center justify-between gap-2 py-2">
              <NavKnopf
                richtung="zurueck"
                aktiv={kannZurueck}
                onClick={() => wechsle(-1)}
              />
              <div className="min-w-0 text-center">
                <p className="truncate text-[13px] font-semibold text-kreide">
                  {wochenZeitraum(weekKeys(woche))}
                </p>
                <p className="truncate text-[10px] text-kreide-52">
                  {woche === laufendeWoche ? 'läuft noch · stand von heute' : archivHinweis ?? 'abgeschlossen'}
                </p>
              </div>
              <NavKnopf richtung="vor" aktiv={kannVor} onClick={() => wechsle(1)} />
            </div>
          </div>

          <div
            ref={scrollRef}
            className="vollbild-safe-x min-h-0 flex-1 overflow-y-auto overscroll-contain"
            style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 2rem)' }}
          >
            <div className="mx-auto w-full max-w-[420px]">
              <Inhalt
                key={woche}
                woche={woche}
                zustand={zustand}
                naechte={naechte}
                heuteKey={heuteKey}
                eniStatus={eniStatus}
                eniTexte={eniTexte}
                archivBericht={archivBericht}
                onEniErneut={onEniErneut}
                onMitEniReden={onMitEniReden}
              />
            </div>
          </div>
        </div>
      )}
    </dialog>
  )
}

function weekKeys(montag: string): string[] {
  return Array.from({ length: 7 }, (_, i) => toKey(addDays(fromKey(montag), i)))
}

function NavKnopf({
  richtung,
  aktiv,
  onClick,
}: {
  richtung: 'zurueck' | 'vor'
  aktiv: boolean
  onClick: () => void
}) {
  const Symbol = richtung === 'zurueck' ? CaretLeft : CaretRight
  return (
    <button
      type="button"
      disabled={!aktiv}
      onClick={onClick}
      aria-label={richtung === 'zurueck' ? 'Woche davor' : 'Woche danach'}
      className={`flex size-9 shrink-0 items-center justify-center rounded-full border border-linie transition-colors duration-150 focus-visible:outline-none ${
        aktiv ? 'text-kreide hover:border-linie-hell' : 'cursor-default text-kreide-52 opacity-35'
      }`}
    >
      <Symbol size={16} weight="bold" aria-hidden="true" />
    </button>
  )
}

function Inhalt({
  woche,
  zustand,
  naechte,
  heuteKey,
  eniStatus,
  eniTexte,
  archivBericht,
  onEniErneut,
  onMitEniReden,
}: {
  woche: string
  zustand: Zustand
  naechte: Schlafnacht[]
  heuteKey: string
  eniStatus: EniTextStatus
  eniTexte: WochenberichtTexte | null
  archivBericht?: Wochenbericht | null
  onEniErneut?: () => void
  onMitEniReden: (woche: string) => void
}) {
  const reduced = useReducedMotion()
  const bericht = useMemo(
    () => archivBericht?.woche === woche ? archivBericht : baueWochenbericht(woche, zustand, naechte, heuteKey),
    [woche, zustand, naechte, heuteKey, archivBericht]
  )

  const siegerName =
    bericht.sieger === 'unentschieden'
      ? null
      : USERS.find((p) => p.id === bericht.sieger)!.name
  const abstand = Math.abs(bericht.punkte.erijon - bericht.punkte.koray)

  return (
    <div className="space-y-5 pt-4">
      <motion.section
        initial={reduced ? false : { opacity: 0, y: BERICHT.abschnittWeg }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: BERICHT.abschnittDauer, ease: EASE }}
        aria-label="Punktestand der Woche"
      >
        {/* zahlen und namen in zwei zeilen: nur so steht der doppelpunkt auf
            derselben grundlinie wie die ziffern und nicht darunter. die drei
            felder stehen in leserichtung im markup — mit `gridColumn` allein
            rutscht der doppelpunkt in die naechste rasterzeile */}
        <div className="grid grid-cols-[1fr_auto_1fr] items-baseline gap-3">
          <Punktzahl person={USERS[0]!} bericht={bericht} reduced={!!reduced} nr={0} />
          <span aria-hidden="true" className="text-[26px] font-bold leading-none text-kreide-52">
            :
          </span>
          <Punktzahl person={USERS[1]!} bericht={bericht} reduced={!!reduced} nr={1} />
        </div>
        <div className="mt-1.5 grid grid-cols-[1fr_auto_1fr] gap-3 text-[11px] text-kreide-52">
          <span className="truncate text-right">{USERS[0]!.name}</span>
          <span aria-hidden="true" className="w-[0.55rem]" />
          <span className="truncate text-left">{USERS[1]!.name}</span>
        </div>

        <p className="mt-2 text-center text-[11px] text-kreide-52">
          {siegerName === null
            ? `unentschieden · ${bericht.punkte.erijon} zu ${bericht.punkte.koray} von 35`
            : `${siegerName} ${bericht.endgueltig ? 'gewinnt' : 'führt'} mit ${abstand} · von 35 möglichen`}
        </p>
      </motion.section>

      <BerichtKennzahlen bericht={bericht} grundVersatz={BERICHT.vorlauf + 0.05} />

      <BerichtAbschnitt
        nr={1}
        titel="woche auf einen blick"
        unter="ein feld je tag und bereich. gefüllt heißt: an dem tag hat es gezählt."
        kinder={<BerichtRaster bericht={bericht} grundVersatz={BERICHT.vorlauf + 0.14} />}
      />

      <BerichtAbschnitt
        nr={2}
        titel="wo die woche gekippt ist"
        unter="punkte tag für tag aufaddiert."
        legende
        kinder={<BerichtVerlauf bericht={bericht} grundVersatz={BERICHT.vorlauf + 0.2} />}
      />

      <BerichtAbschnitt
        nr={3}
        titel="bereiche"
        unter="punkte je feld, das stärkste zuerst. rechts die menge dahinter."
        kinder={<BerichtBereiche bericht={bericht} grundVersatz={BERICHT.vorlauf + 0.26} />}
      />

      <BerichtAbschnitt
        nr={4}
        titel="schlaf"
        unter={schlafUnterzeile(bericht.schlaf.naechte)}
        legende
        kinder={<BerichtSchlaf bericht={bericht} grundVersatz={BERICHT.vorlauf + 0.32} />}
      />

      <BerichtAbschnitt
        nr={5}
        titel="gewicht"
        unter="eigene skala je person — die kurve zählt, nicht der abstand."
        kinder={<BerichtGewicht bericht={bericht} grundVersatz={BERICHT.vorlauf + 0.38} />}
      />

      <motion.div
        initial={reduced ? false : { opacity: 0, y: BERICHT.abschnittWeg }}
        animate={{ opacity: 1, y: 0 }}
        transition={{
          duration: BERICHT.abschnittDauer,
          ease: EASE,
          delay: BERICHT.vorlauf + 6 * BERICHT.abschnittVersatz,
        }}
        className="space-y-3"
      >
        <BerichtEni status={eniStatus} texte={eniTexte} onErneut={onEniErneut} />

        <button
          type="button"
          onClick={() => onMitEniReden(woche)}
          className="w-full rounded-[2px] border border-kontroll-rand bg-flaeche px-3 py-2.5 text-[12px] font-semibold text-kreide transition-colors duration-150 hover:border-linie-hell focus-visible:outline-none"
        >
          mit ENI über diese woche reden
        </button>

        <Tabellen bericht={bericht} />
      </motion.div>
    </div>
  )
}

/** eine der beiden grossen zahlen des punktestands */
function Punktzahl({
  person,
  bericht,
  reduced,
  nr,
}: {
  person: UserDef
  bericht: ReturnType<typeof baueWochenbericht>
  reduced: boolean
  nr: 0 | 1
}) {
  return (
    <motion.span
      initial={reduced ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.34, ease: EASE, delay: 0.06 + nr * 0.05 }}
      className={`tnum text-[44px] font-extrabold leading-none ${
        nr === 0 ? 'text-right' : 'text-left'
      }`}
      style={{
        color: person.farbe,
        // der verlierer tritt zurueck, ohne zu verschwinden
        opacity: bericht.sieger === 'unentschieden' || bericht.sieger === person.id ? 1 : 0.55,
      }}
    >
      {bericht.punkte[person.id]}
    </motion.span>
  )
}

function schlafUnterzeile(naechte: Array<{ minuten: Record<UserId, number | null> }>): string {
  const erfasst = naechte.filter(
    (n) => n.minuten.erijon !== null || n.minuten.koray !== null
  ).length
  if (erfasst === 0) return 'keine nacht erfasst.'
  return `${erfasst} ${erfasst === 1 ? 'nacht' : 'nächte'} erfasst. dauer und qualität haben eigene skalen, also eigene bilder.`
}

/** Alle Zahlen noch einmal zum Nachschlagen — zugeklappt, damit sie nicht stoeren. */
function Tabellen({ bericht }: { bericht: ReturnType<typeof baueWochenbericht> }) {
  const summeMinuten = (u: UserId) =>
    bericht.felder.reduce((s, f) => s + (f.feld === 'lesen' ? 0 : f.minuten[u]), 0)

  return (
    <details className="rounded-[2px] border border-linie">
      <summary className="cursor-pointer list-none px-3 py-2.5 text-[12px] text-kreide-52 marker:hidden">
        alle zahlen als tabelle
      </summary>

      <div className="space-y-4 border-t border-linie p-3">
        <table className="w-full border-collapse text-[11px]">
          <caption className="pb-1.5 text-left text-[10px] uppercase tracking-wide text-kreide-52">
            bereiche
          </caption>
          <thead>
            <tr className="text-kreide-52">
              <th scope="col" className="py-1 text-left font-medium">feld</th>
              <th scope="col" className="py-1 text-right font-medium">pkt e</th>
              <th scope="col" className="py-1 text-right font-medium">pkt k</th>
              <th scope="col" className="py-1 text-right font-medium">min e</th>
              <th scope="col" className="py-1 text-right font-medium">min k</th>
            </tr>
          </thead>
          <tbody className="tnum">
            {bericht.felder.map((zeile) => (
              <tr key={zeile.feld} className="border-t border-linie">
                <th scope="row" className="py-1 text-left font-normal text-kreide">
                  {FELDER.find((f) => f.id === zeile.feld)?.label}
                </th>
                <td className="py-1 text-right" style={{ color: 'var(--erijon)' }}>
                  {zeile.punkte.erijon}
                </td>
                <td className="py-1 text-right" style={{ color: 'var(--koray)' }}>
                  {zeile.punkte.koray}
                </td>
                <td className="py-1 text-right text-kreide-52">
                  {zeile.feld === 'gewicht' ? '—' : zeile.minuten.erijon}
                </td>
                <td className="py-1 text-right text-kreide-52">
                  {zeile.feld === 'gewicht' ? '—' : zeile.minuten.koray}
                </td>
              </tr>
            ))}
            <tr className="border-t border-linie-hell font-semibold">
              <th scope="row" className="py-1 text-left text-kreide">summe</th>
              <td className="py-1 text-right" style={{ color: 'var(--erijon)' }}>
                {bericht.punkte.erijon}
              </td>
              <td className="py-1 text-right" style={{ color: 'var(--koray)' }}>
                {bericht.punkte.koray}
              </td>
              <td className="py-1 text-right text-kreide-52">{summeMinuten('erijon')}</td>
              <td className="py-1 text-right text-kreide-52">{summeMinuten('koray')}</td>
            </tr>
          </tbody>
        </table>

        <table className="w-full border-collapse text-[11px]">
          <caption className="pb-1.5 text-left text-[10px] uppercase tracking-wide text-kreide-52">
            schlaf je nacht
          </caption>
          <thead>
            <tr className="text-kreide-52">
              <th scope="col" className="py-1 text-left font-medium">nacht auf</th>
              <th scope="col" className="py-1 text-right font-medium">dauer e</th>
              <th scope="col" className="py-1 text-right font-medium">wert e</th>
              <th scope="col" className="py-1 text-right font-medium">dauer k</th>
              <th scope="col" className="py-1 text-right font-medium">wert k</th>
            </tr>
          </thead>
          <tbody className="tnum">
            {bericht.schlaf.naechte.map((nacht, index) => (
              <tr key={nacht.tag} className="border-t border-linie">
                <th scope="row" className="py-1 text-left font-normal text-kreide">
                  {TAGKUERZEL[index]} {fromKey(nacht.tag).getDate()}.
                </th>
                <td className="py-1 text-right" style={{ color: 'var(--erijon)' }}>
                  {alsDauer(nacht.minuten.erijon)}
                </td>
                <td className="py-1 text-right text-kreide-52">{nacht.wert.erijon ?? '—'}</td>
                <td className="py-1 text-right" style={{ color: 'var(--koray)' }}>
                  {alsDauer(nacht.minuten.koray)}
                </td>
                <td className="py-1 text-right text-kreide-52">{nacht.wert.koray ?? '—'}</td>
              </tr>
            ))}
            <tr className="border-t border-linie-hell font-semibold">
              <th scope="row" className="py-1 text-left text-kreide">schnitt</th>
              <td className="py-1 text-right" style={{ color: 'var(--erijon)' }}>
                {alsDauer(bericht.schlaf.person.erijon.minuten.wert)}
              </td>
              <td className="py-1 text-right text-kreide-52">
                {bericht.schlaf.person.erijon.wert.wert === null
                  ? '—'
                  : Math.round(bericht.schlaf.person.erijon.wert.wert)}
              </td>
              <td className="py-1 text-right" style={{ color: 'var(--koray)' }}>
                {alsDauer(bericht.schlaf.person.koray.minuten.wert)}
              </td>
              <td className="py-1 text-right text-kreide-52">
                {bericht.schlaf.person.koray.wert.wert === null
                  ? '—'
                  : Math.round(bericht.schlaf.person.koray.wert.wert)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </details>
  )
}
