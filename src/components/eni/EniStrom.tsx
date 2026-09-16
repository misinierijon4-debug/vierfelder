import React, { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { EASE } from '../../lib/motion'
import {
  IconCheck,
  IconCopy,
  IconFileText,
  IconPencil,
  IconPlus,
  IconSpeakerHigh,
  IconStop,
} from './EniSymbole'
import { user as userDef } from '../../lib/types'
import type { UserId } from '../../lib/types'
import { toKey } from '../../lib/dates'
import { eniBegruessung } from '../../lib/eni'
import { lesbareGroesse } from '../../lib/eniAnhang'
import type { EniAnhang } from '../../lib/eniAnhang'
import type { DuellKontext, EniZeile } from '../../lib/eniSpeicher'
import { EniMarke } from './EniMarke'

const TAGESDATUM = new Intl.DateTimeFormat('de-DE', { day: 'numeric', month: 'long' })
const UHRZEIT = new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit' })

// eine Beschreibung des Duells, keine zweite: sie steht beim Speicher, der sie
// fuellt, und wird hier nur weitergereicht.
export type { DuellKontext }

/** abwaertskompatible standard-auftakte */
export const AUFTAKTE = [
  'wie stehe ich gegen koray',
  'ich habe diese woche nichts gemacht',
  'was soll ich heute essen',
]

/** versatz von wort zu wort, wenn eine antwort aufklappt */
const WORT_VERSATZ_MS = 14
const AUSKLAPP_MAX_MS = 500

type Props = {
  teilAntwort?: string
  onMerken?: (zeile: EniZeile, art: 'profil' | 'aufgabe') => void
  zeilen: EniZeile[]
  me: UserId
  prueft: boolean
  frisch?: string | null
  bildAdressen?: Map<string, string>
  spricht?: string | null
  onVorlesen?: (zeile: EniZeile) => void
  onBearbeiten?: (zeile: EniZeile, text: string) => void
  onAuftakt: (text: string) => void
  duellStand?: DuellKontext | null
  /** steht etwas im eingabefeld? dann treten die auftakte ab */
  feldBelegt?: boolean
  aktionenGesperrt?: boolean
}

export function EniStrom({
  teilAntwort,
  onMerken,
  zeilen,
  me,
  prueft,
  frisch,
  bildAdressen,
  spricht,
  onVorlesen,
  onBearbeiten,
  onAuftakt,
  duellStand,
  feldBelegt = false,
  aktionenGesperrt = false,
}: Props) {
  /**
   * Welche zeile gerade ihre notizknoepfe zeigt, und zwar genau eine.
   *
   * Vorher standen „Fuer spaeter merken" und „Als naechsten Schritt uebernehmen"
   * unter jeder einzelnen zeile, also auch unter jeder eigenen frage. Bei
   * zwanzig zeilen sind das vierzig angebote, die niemand angenommen hat: der
   * verlauf las sich wie ein formular. Der weg dorthin bleibt einen tipp weit
   * entfernt — der kleine knopf in der kopfzeile —, nur steht die frage nicht
   * mehr ungefragt da.
   */
  const [notizFuer, setNotizFuer] = useState<string | null>(null)
  const [kopiert, setKopiert] = useState<string | null>(null)
  const kopierTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => {
    if (kopierTimer.current) clearTimeout(kopierTimer.current)
  }, [])

  const kopiere = async (zeile: EniZeile) => {
    if (!(await kopiereText(zeile.text))) return
    setKopiert(zeile.id)
    if (kopierTimer.current) clearTimeout(kopierTimer.current)
    kopierTimer.current = setTimeout(() => setKopiert(null), 1_600)
  }

  if (zeilen.length === 0 && !prueft) {
    return (
      <EniLeer me={me} duellStand={duellStand} onAuftakt={onAuftakt} feldBelegt={feldBelegt} />
    )
  }

  let letzterTag = ''

  return (
    <ol aria-label="dialog mit ENI" aria-live="polite" className="pb-6 pt-2">
      {zeilen.map((zeile) => {
        const tag = toKey(new Date(zeile.erstellt))
        const neuerTag = tag !== letzterTag
        letzterTag = tag
        return (
          <li key={zeile.id}>
            {neuerTag && <Tagestrenner iso={zeile.erstellt} />}
            {zeile.rolle === 'eni' ? (
              <EniWort
                text={zeile.text}
                frisch={zeile.id === frisch}
                spricht={spricht === zeile.id}
                onVorlesen={onVorlesen && (() => onVorlesen(zeile))}
                notizOffen={notizFuer === zeile.id}
                onNotiz={onMerken && (() => setNotizFuer((offen) => (offen === zeile.id ? null : zeile.id)))}
                kopiert={kopiert === zeile.id}
                onKopieren={() => { void kopiere(zeile) }}
              />
            ) : (
              <MenschWort
                text={zeile.text}
                me={me}
                zeit={zeile.erstellt}
                anhaenge={zeile.anhaenge}
                bildAdressen={bildAdressen}
                notizOffen={notizFuer === zeile.id}
                onNotiz={onMerken && (() => setNotizFuer((offen) => (offen === zeile.id ? null : zeile.id)))}
                kopiert={kopiert === zeile.id}
                onKopieren={zeile.text !== '' ? () => { void kopiere(zeile) } : undefined}
                onBearbeiten={onBearbeiten ? (text) => onBearbeiten(zeile, text) : undefined}
                aktionenGesperrt={aktionenGesperrt}
              />
            )}
            {onMerken && notizFuer === zeile.id && (
              <Notizknoepfe
                nurProfil={zeile.rolle !== 'eni'}
                onWahl={(art) => {
                  setNotizFuer(null)
                  onMerken(zeile, art)
                }}
              />
            )}
          </li>
        )
      })}
      {prueft && teilAntwort && (
        <li aria-busy="true">
          <EniWort text={teilAntwort} frisch={false} spricht={false} linksAktiv={false} />
          <div className="mt-2 flex items-center gap-2">
            <span className="relative flex size-1.5">
              {/* der Puls bleibt aus, wo Bewegung abbestellt ist */}
              <span className="absolute inline-flex h-full w-full rounded-full bg-kreide opacity-75 motion-safe:animate-ping" />
              <span className="relative inline-flex size-1.5 rounded-full bg-kreide" />
            </span>
            <p className="text-[11px] font-medium text-kreide-60">Antwort entsteht …</p>
          </div>
        </li>
      )}
      {prueft && !teilAntwort && (
        <li>
          <EniTakt />
        </li>
      )}
    </ol>
  )
}

function Tagestrenner({ iso }: { iso: string }) {
  const wann = new Date(iso)
  const heute = toKey(new Date())
  const tag = toKey(wann)
  const gestern = toKey(new Date(Date.now() - 86_400_000))
  const label = tag === heute ? 'heute' : tag === gestern ? 'gestern' : TAGESDATUM.format(wann)

  return (
    <div className="flex items-center gap-3 pt-6 pb-2">
      <span aria-hidden="true" className="h-px flex-1 bg-linie" />
      <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-kreide-52">
        {label}
      </span>
      <span aria-hidden="true" className="h-px flex-1 bg-linie" />
    </div>
  )
}

/** ENIs worte: ruhige leseschrift fuer laengere texte, display fuer kurze urteile */
function EniWort({
  text,
  frisch,
  spricht,
  linksAktiv = true,
  onVorlesen,
  notizOffen,
  onNotiz,
  kopiert,
  onKopieren,
}: {
  text: string
  frisch: boolean
  spricht: boolean
  /** nur gespeicherte Antworten: dort hat der Server die Links gegen die Quellen geprueft */
  linksAktiv?: boolean
  onVorlesen?: () => void
  notizOffen?: boolean
  onNotiz?: () => void
  kopiert?: boolean
  onKopieren?: () => void
}) {
  return (
    <div className="pt-5">
      <div className="flex items-center gap-2">
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-kreide-52">ENI</p>
        {onVorlesen && (
          <button
            type="button"
            onClick={onVorlesen}
            aria-label={spricht ? 'vorlesen anhalten' : 'vorlesen'}
            className="-my-2 -ml-1 flex size-11 items-center justify-center transition-colors"
            style={{ color: spricht ? 'var(--kreide)' : 'var(--kreide-52)' }}
          >
            {spricht ? (
              <IconStop size={13} />
            ) : (
              <IconSpeakerHigh size={14} />
            )}
          </button>
        )}
        {onNotiz && <NotizKnopf offen={notizOffen === true} onKlick={onNotiz} />}
      </div>

      <div className="mt-2 text-kreide">
        <StrukturierterText text={text} frisch={frisch} linksAktiv={linksAktiv} />
      </div>
      {onKopieren && (
        <NachrichtenAktionen kopiert={kopiert === true} onKopieren={onKopieren} />
      )}
    </div>
  )
}

/**
 * strukturiert antworten sinnvoll in absaetze, aufzaehlungen und fettdruck.
 * frische antworten durchlaufen dieselbe struktur und typografie wie
 * gespeicherte chats, wobei woerter fuer das aufklappen staffelbar sind.
 */
function StrukturierterText({ text, frisch = false, linksAktiv = true }: { text: string; frisch?: boolean; linksAktiv?: boolean }) {
  const absaetze = text.split(/\n\s*\n/).map((a) => a.trim()).filter(Boolean)
  const istKurz = absaetze.length <= 1 && text.length < 180

  const woerterZahl = (text.match(/[^\s]+/g) || []).length
  const schritt = Math.min(WORT_VERSATZ_MS, AUSKLAPP_MAX_MS / Math.max(woerterZahl, 1))
  const counter = { current: 0 }

  if (istKurz) {
    return (
      <p className="display whitespace-pre-wrap text-pretty text-[16px] sm:text-[17px] font-semibold leading-[1.35] text-kreide">
        {formatiereTextTeile(text, counter, schritt, frisch, linksAktiv)}
      </p>
    )
  }

  return (
    <div className="space-y-3">
      {absaetze.map((absatz, idx) => {
        const zeilen = absatz.split('\n').map((z) => z.trim()).filter(Boolean)
        const istListe = zeilen.every((z) => /^[\-•*]\s+|^\d+\.\s+/.test(z))

        if (istListe) {
          return (
            <ul key={idx} className="my-2 space-y-1.5 pl-1">
              {zeilen.map((zeile, lIdx) => {
                const bereinigt = zeile.replace(/^[\-•*]\s+|^\d+\.\s+/, '')
                return (
                  <li key={lIdx} className="flex items-start gap-2 text-[14px] sm:text-[15px] leading-relaxed text-kreide">
                    <span className="mt-2 block size-1 shrink-0 rounded-full bg-kreide-52" aria-hidden="true" />
                    <span>{formatiereTextTeile(bereinigt, counter, schritt, frisch, linksAktiv)}</span>
                  </li>
                )
              })}
            </ul>
          )
        }

        // erste zeile eines laengeren textes kann akzentuierter stehen
        if (idx === 0) {
          return (
            <p key={idx} className="display whitespace-pre-wrap text-pretty text-[15px] sm:text-[16px] font-semibold leading-[1.4] text-kreide">
              {formatiereTextTeile(absatz, counter, schritt, frisch, linksAktiv)}
            </p>
          )
        }

        return (
          <p key={idx} className="font-body whitespace-pre-wrap text-pretty text-[14px] sm:text-[15px] leading-relaxed text-kreide">
            {formatiereTextTeile(absatz, counter, schritt, frisch, linksAktiv)}
          </p>
        )
      })}
    </div>
  )
}

function formatiereTextTeile(
  text: string,
  counter: { current: number },
  schritt: number,
  frisch: boolean,
  linksAktiv: boolean
): React.ReactNode {
  const teile = text.split(/(\[[^\]]+\]\(https?:\/\/[^\s)]+\)|\*\*[^*]+\*\*)/g)
  return teile.map((teil, i) => {
    const link = teil.match(/^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/)
    if (link) {
      // Waehrend des Streams steht die Antwort noch nicht in der Datenbank, also
      // hat auch niemand die Adresse gegen die gefundenen Quellen gehalten. Bis
      // dahin bleibt nur die Beschriftung stehen, nie ein anklickbares Ziel.
      if (!linksAktiv) return <React.Fragment key={i}>{link[1]}</React.Fragment>
      try {
        const url = new URL(link[2]!)
        if (['http:', 'https:'].includes(url.protocol) && !url.username && !url.password) {
          return <a key={i} href={url.href} target="_blank" rel="noopener noreferrer"
            className="break-words underline underline-offset-2">{link[1]}</a>
        }
      } catch { /* fehlerhafte Links als Text zeigen */ }
    }
    if (teil.startsWith('**') && teil.endsWith('**')) {
      const kern = teil.slice(2, -2)
      return (
        <strong key={i} className="font-bold text-kreide">
          {rendereWoerter(kern, counter, schritt, frisch)}
        </strong>
      )
    }
    return (
      <React.Fragment key={i}>
        {rendereWoerter(teil, counter, schritt, frisch)}
      </React.Fragment>
    )
  })
}

function rendereWoerter(
  text: string,
  counter: { current: number },
  schritt: number,
  frisch: boolean
): React.ReactNode {
  if (!frisch) return text

  const teile = text.split(/(\s+)/).filter((t) => t !== '')
  return teile.map((teil, i) => {
    if (/^\s+$/.test(teil)) {
      return teil
    }
    const nr = counter.current++
    return (
      <span
        key={i}
        className="eni-wort"
            style={{ animationDelay: `${Math.round(nr * schritt)}ms` }}
      >
        {teil}
      </span>
    )
  })
}

/**
 * Der kleine knopf, hinter dem die notizknoepfe stecken.
 *
 * Ein zeichen statt zweier saetze: er sitzt in der kopfzeile, die es ohnehin
 * gibt, und kostet deshalb keine zeile im verlauf. Was er oeffnet, steht dann
 * ausgeschrieben da — aber erst, wenn jemand danach gefragt hat.
 */
function NotizKnopf({ offen, onKlick }: { offen: boolean; onKlick: () => void }) {
  return (
    <button
      type="button"
      onClick={onKlick}
      aria-expanded={offen}
      aria-label={offen ? 'notieren schliessen' : 'diese zeile notieren'}
      className="-my-3 flex size-11 shrink-0 items-center justify-center self-center transition-colors"
      style={{ color: offen ? 'var(--kreide)' : 'var(--kreide-52)' }}
    >
      <IconPlus size={13} />
    </button>
  )
}

/** die beiden wege, eine zeile zu behalten. nur sichtbar, wenn danach gefragt wird. */
function Notizknoepfe({
  nurProfil,
  onWahl,
}: {
  nurProfil: boolean
  onWahl: (art: 'profil' | 'aufgabe') => void
}) {
  return (
    <div className="flex flex-wrap gap-3 pt-1">
      <button
        type="button"
        className="min-h-11 text-xs text-kreide-60 underline underline-offset-4"
        onClick={() => onWahl('profil')}
      >
        Für später merken
      </button>
      {!nurProfil && (
        <button
          type="button"
          className="min-h-11 text-xs text-kreide-60 underline underline-offset-4"
          onClick={() => onWahl('aufgabe')}
        >
          Als nächsten Schritt übernehmen
        </button>
      )}
    </div>
  )
}

/**
 * Kopiert auch in installierten iOS-PWAs, in denen die moderne Clipboard-API
 * gelegentlich nicht angeboten wird. Der unsichtbare Fallback bleibt nur für
 * den Augenblick des Kopierens im Dokument.
 */
async function kopiereText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
    const feld = document.createElement('textarea')
    feld.value = text
    feld.setAttribute('readonly', '')
    feld.style.position = 'fixed'
    feld.style.opacity = '0'
    document.body.appendChild(feld)
    feld.select()
    const gelungen = document.execCommand('copy')
    feld.remove()
    return gelungen
  } catch {
    return false
  }
}

function NachrichtenAktionen({
  kopiert,
  onKopieren,
  onBearbeiten,
  gesperrt = false,
}: {
  kopiert: boolean
  onKopieren?: () => void
  onBearbeiten?: () => void
  gesperrt?: boolean
}) {
  return (
    <div className="mt-0.5 flex min-h-11 items-center gap-0.5 text-kreide-52">
      {onKopieren && (
        <button
          type="button"
          onClick={onKopieren}
          aria-label={kopiert ? 'kopiert' : 'nachricht kopieren'}
          title={kopiert ? 'Kopiert' : 'Kopieren'}
          className="flex size-11 items-center justify-center transition-colors hover:text-kreide"
        >
          {kopiert ? <IconCheck size={15} /> : <IconCopy size={15} />}
        </button>
      )}
      {onBearbeiten && (
        <button
          type="button"
          onClick={onBearbeiten}
          disabled={gesperrt}
          aria-label="eigene nachricht bearbeiten"
          title="Bearbeiten"
          className="flex size-11 items-center justify-center transition-colors hover:text-kreide disabled:opacity-35"
        >
          <IconPencil size={15} />
        </button>
      )}
    </div>
  )
}

/** was du vorlegst, steht praesent und klar lesbar */
function MenschWort({
  text,
  me,
  zeit,
  anhaenge,
  bildAdressen,
  notizOffen,
  onNotiz,
  kopiert,
  onKopieren,
  onBearbeiten,
  aktionenGesperrt = false,
}: {
  text: string
  me: UserId
  zeit: string
  anhaenge?: EniAnhang[]
  bildAdressen?: Map<string, string>
  notizOffen?: boolean
  onNotiz?: () => void
  kopiert?: boolean
  onKopieren?: () => void
  onBearbeiten?: (text: string) => void
  aktionenGesperrt?: boolean
}) {
  const farbe = userDef(me).farbe
  const [bearbeitung, setBearbeitung] = useState<string | null>(null)

  const sendeBearbeitung = () => {
    const sauber = bearbeitung?.trim() ?? ''
    if (!onBearbeiten || sauber === '' || sauber === text || aktionenGesperrt) return
    setBearbeitung(null)
    onBearbeiten(sauber)
  }

  return (
    <div className="pt-5">
      <div
        className="rounded-[2px] border-l-2 bg-flaeche/30 pl-3.5 pr-3 py-2 transition-colors"
        style={{ borderColor: farbe }}
      >
        <p className="flex items-baseline gap-2">
          <span
            className="text-[11px] font-bold uppercase tracking-wider"
            style={{ color: farbe }}
          >
            du
          </span>
          <span className="tnum text-[11px] text-kreide-52">
            {UHRZEIT.format(new Date(zeit))}
          </span>
          {onNotiz && <NotizKnopf offen={notizOffen === true} onKlick={onNotiz} />}
        </p>
        {bearbeitung !== null ? (
          <form
            className="mt-2"
            onSubmit={(event) => {
              event.preventDefault()
              sendeBearbeitung()
            }}
          >
            <label htmlFor={`eni-bearbeiten-${zeit}`} className="sr-only">
              eigene nachricht bearbeiten
            </label>
            <textarea
              id={`eni-bearbeiten-${zeit}`}
              autoFocus
              rows={Math.min(6, Math.max(2, bearbeitung.split('\n').length))}
              value={bearbeitung}
              onChange={(event) => setBearbeitung(event.target.value)}
              className="block min-h-20 w-full resize-y rounded-[2px] border border-linie bg-grund/60 px-3 py-2.5 text-[16px] leading-relaxed text-kreide focus:border-kreide focus:outline-none"
            />
            <div className="mt-1.5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setBearbeitung(null)}
                className="min-h-11 px-3 text-xs font-semibold text-kreide-60 hover:text-kreide"
              >
                Abbrechen
              </button>
              <button
                type="submit"
                disabled={bearbeitung.trim() === '' || bearbeitung.trim() === text || aktionenGesperrt}
                className="min-h-11 rounded-[2px] bg-kreide px-3 text-xs font-bold text-grund disabled:opacity-40"
              >
                Neu absenden
              </button>
            </div>
          </form>
        ) : text !== '' && (
          <p className="mt-1.5 whitespace-pre-wrap text-pretty text-[15px] leading-relaxed text-kreide">
            {text}
          </p>
        )}
        {anhaenge && anhaenge.length > 0 && (
          <Anhaenge anhaenge={anhaenge} adressen={bildAdressen} />
        )}
      </div>
      {bearbeitung === null && (onKopieren || onBearbeiten) && (
        <NachrichtenAktionen
          kopiert={kopiert === true}
          onKopieren={onKopieren}
          onBearbeiten={onBearbeiten ? () => setBearbeitung(text) : undefined}
          gesperrt={aktionenGesperrt}
        />
      )}
    </div>
  )
}

function Anhaenge({
  anhaenge,
  adressen,
}: {
  anhaenge: EniAnhang[]
  adressen?: Map<string, string>
}) {
  return (
    <ul className="mt-2 flex flex-wrap gap-2">
      {anhaenge.map((anhang) => {
        const adresse = anhang.pfad ? adressen?.get(anhang.pfad) : undefined
        return (
          <li key={anhang.id}>
            {anhang.art === 'bild' ? (
              adresse ? (
                <a href={adresse} target="_blank" rel="noreferrer">
                  <img
                    src={adresse}
                    alt={anhang.name}
                    loading="lazy"
                    className="max-h-40 max-w-[220px] rounded-[2px] border border-linie object-cover"
                  />
                </a>
              ) : (
                <span className="flex h-16 items-center rounded-[2px] border border-linie px-2.5 text-[11px] text-kreide-52">
                  bild nicht geladen
                </span>
              )
            ) : (
              <span className="flex h-16 max-w-[220px] items-center gap-2 rounded-[2px] border border-linie px-2.5">
                <IconFileText size={16} className="shrink-0 text-kreide-52" />
                <span className="min-w-0">
                  <span className="block truncate text-[12px] text-kreide">{anhang.name}</span>
                  <span className="tnum block text-[10px] text-kreide-52">
                    {lesbareGroesse(anhang.groesse)}
                  </span>
                </span>
              </span>
            )}
          </li>
        )
      })}
    </ul>
  )
}

export function EniTakt() {
  const reduced = useReducedMotion()
  const striche = [12, 20, 8, 26, 14, 22, 10, 28, 16, 20, 8, 24]

  return (
    <div role="status" className="pt-5 pb-1">
      <div className="flex items-end gap-[3px]" style={{ height: 38 }}>
        <span className="sr-only">ENI prüft</span>
        {striche.map((hoehe, index) => (
          <motion.span
            key={index}
            aria-hidden="true"
            className="block w-[2px] bg-kreide"
            style={{ height: hoehe, originY: 1 }}
            initial={{ scaleY: 0.3 }}
            animate={reduced ? { scaleY: 0.65 } : { scaleY: [0.3, 1, 0.3] }}
            transition={
              reduced
                ? { duration: 0 }
                : { duration: 0.8, repeat: Infinity, delay: index * 0.05, ease: 'easeInOut' }
            }
          />
        ))}
      </div>
      <motion.p
        initial={reduced ? undefined : { opacity: 0.5 }}
        animate={reduced ? undefined : { opacity: [0.5, 0.9, 0.5] }}
        transition={reduced ? undefined : { duration: 2, repeat: Infinity, ease: 'easeInOut' }}
        className="mt-2 text-[11px] tracking-wide text-kreide-52"
      >
        denkt nach …
      </motion.p>
    </div>
  )
}

/**
 * Der Gesprächseinstieg liest sich wie die Anzeigetafel, nicht wie ein
 * Chatbot-Startbildschirm: Haarlinien statt Karten, Kleinschreibung in der
 * Bedienung, die Zahlen tabellarisch und in den Personenfarben.
 *
 * Die vier Vorschläge waren Kacheln mit Icons — genau das Muster, das jede
 * KI-App benutzt, und das einzige Element der App mit einem Icon je Eintrag.
 * Als Zeilenliste sind sie dieselbe Form wie `Bereichszeile` im Tracker: man
 * tippt eine Zeile an, und etwas passiert.
 */
function EniLeer({
  me,
  duellStand,
  onAuftakt,
  feldBelegt,
}: {
  me: UserId
  duellStand?: DuellKontext | null
  onAuftakt: (text: string) => void
  feldBelegt: boolean
}) {
  const reduziert = useReducedMotion() ?? false
  /*
    Welchen auftakt man genommen hat. Er geht als letzter — die drei anderen
    raeumen zuerst das feld, dann folgt der gewaehlte. Das liest sich als
    „dieser hier ist es geworden" statt als „alle vier sind weg".
  */
  const [genommen, setGenommen] = useState<string | null>(null)
  useEffect(() => {
    if (!feldBelegt) setGenommen(null)
  }, [feldBelegt])
  const { gruss, gegner } = eniBegruessung(me)
  const ichFarbe = userDef(me).farbe
  const gegnerDef = userDef(me === 'koray' ? 'erijon' : 'koray')
  const gegnerKlein = gegner.toLowerCase()

  const aufholen = duellStand
    ? duellStand.diff > 0
      ? { titel: 'vorsprung ausbauen', prompt: `wie baue ich meinen vorsprung gegen ${gegnerKlein} weiter aus` }
      : duellStand.diff === 0
        ? { titel: 'führung übernehmen', prompt: `wie übernehme ich heute die führung gegen ${gegnerKlein}` }
        : { titel: 'heute aufholen', prompt: `wie hole ich heute gegen ${gegnerKlein} am besten auf` }
    : { titel: 'führung übernehmen', prompt: `wie übernehme ich heute die führung gegen ${gegnerKlein}` }

  const vorschlaege = [
    { id: 'duell', titel: `wie stehe ich gegen ${gegnerKlein}`, prompt: `wie stehe ich gegen ${gegnerKlein}` },
    { id: 'aufholen', titel: aufholen.titel, prompt: aufholen.prompt },
    { id: 'abend', titel: 'abend planen', prompt: 'hilf mir den abend planen: schlaf, essen und regeneration' },
    { id: 'ernaehrung', titel: 'was soll ich heute essen', prompt: 'was soll ich heute essen' },
  ]

  return (
    <div className="flex flex-1 flex-col justify-start pt-8 pb-6">
      <div className="flex items-start gap-4">
        <EniMarke groesse={44} grund="var(--grund)" />
        <div className="min-w-0 flex-1">
          {/* ENI spricht in ganzen Sätzen, deshalb bleibt sein Gruß groß. */}
          <h2 className="display text-[20px] font-bold leading-tight tracking-tight text-kreide">
            {gruss}
          </h2>
          <p className="mt-1 text-[13px] leading-snug text-kreide-60">
            Schiedsrichter und Begleiter im Zweikampf gegen {gegner}.
          </p>
        </div>
      </div>

      {/*
        Der Stand stand in einem Kasten mit eigener Flaeche und eigener
        Ueberschrift. Er ist aber dieselbe Zahl wie im Kopf der Anzeigetafel
        und traegt hier dieselbe Form: eine Zeile zwischen zwei Haarlinien.
      */}
      <div className="mt-6 divide-y divide-linie border-y border-linie">
        {duellStand && (
          <div className="py-2.5">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-[11px] text-kreide-52">diese woche</span>
              <span className="flex items-baseline gap-1.5">
                <span className="tnum text-[17px] font-bold leading-none" style={{ color: ichFarbe }}>
                  {duellStand.wocheIch}
                </span>
                <span className="text-[12px] leading-none text-kreide-52">:</span>
                <span className="tnum text-[17px] font-bold leading-none" style={{ color: gegnerDef.farbe }}>
                  {duellStand.wocheEr}
                </span>
                <span className="tnum pl-1.5 text-[12px] font-bold leading-none text-kreide">
                  {duellStand.diff > 0
                    ? `+${duellStand.diff}`
                    : duellStand.diff < 0
                      ? `−${Math.abs(duellStand.diff)}`
                      : '='}
                </span>
              </span>
            </div>
            {duellStand.statusText && (
              <p className="mt-1.5 truncate text-[11px] text-kreide-52">{duellStand.statusText}</p>
            )}
          </div>
        )}

        {/*
          Die auftakte treten ab, sobald etwas im feld steht. Sie sind ein
          angebot für den fall, dass einem nichts einfällt — ist die wahl
          getroffen, sind die übrigen nur noch zeilen, die im weg stehen.
          Wird das feld wieder leer, kommen sie zurück.
        */}
        <AnimatePresence initial={false}>
          {!feldBelegt &&
            vorschlaege.map((item) => (
              <motion.div
                key={item.id}
                initial={reduziert ? { opacity: 0 } : { opacity: 0, height: 0 }}
                animate={
                  reduziert
                    ? { opacity: 1, transition: { duration: 0.12 } }
                    : { opacity: 1, height: 'auto', transition: { duration: 0.22, ease: EASE } }
                }
                exit={
                  reduziert
                    ? { opacity: 0, transition: { duration: 0.1 } }
                    : {
                        opacity: 0,
                        height: 0,
                        transition: {
                          duration: 0.22,
                          ease: EASE,
                          // der genommene geht als letzter
                          delay: item.id === genommen ? 0.12 : 0,
                        },
                      }
                }
                style={{ overflow: 'hidden' }}
              >
                <button
                  type="button"
                  onClick={() => {
                    setGenommen(item.id)
                    onAuftakt(item.prompt)
                  }}
                  className="group flex min-h-12 w-full items-center justify-between gap-3 py-2.5 text-left transition-colors"
                >
                  <span className="min-w-0 flex-1 truncate text-[15px] text-kreide-60 transition-colors group-hover:text-kreide">
                    {item.titel}
                  </span>
                  <span
                    aria-hidden="true"
                    className="shrink-0 text-[13px] leading-none text-kreide-52 transition-colors group-hover:text-kreide"
                  >
                    ›
                  </span>
                </button>
              </motion.div>
            ))}
        </AnimatePresence>
      </div>
    </div>
  )
}
