import React from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { IconFileText, IconSpeakerHigh, IconStop } from './EniSymbole'
import { IconChart, IconFood, IconMoon, IconTarget } from './EniSymbole'
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
  zeilen: EniZeile[]
  me: UserId
  prueft: boolean
  frisch?: string | null
  bildAdressen?: Map<string, string>
  spricht?: string | null
  onVorlesen?: (zeile: EniZeile) => void
  onAuftakt: (text: string) => void
  duellStand?: DuellKontext | null
}

export function EniStrom({
  zeilen,
  me,
  prueft,
  frisch,
  bildAdressen,
  spricht,
  onVorlesen,
  onAuftakt,
  duellStand,
}: Props) {
  if (zeilen.length === 0 && !prueft) {
    return <EniLeer me={me} duellStand={duellStand} onAuftakt={onAuftakt} />
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
              />
            ) : (
              <MenschWort
                text={zeile.text}
                me={me}
                zeit={zeile.erstellt}
                anhaenge={zeile.anhaenge}
                bildAdressen={bildAdressen}
              />
            )}
          </li>
        )
      })}
      {prueft && (
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
  onVorlesen,
}: {
  text: string
  frisch: boolean
  spricht: boolean
  onVorlesen?: () => void
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
      </div>

      <div className="mt-2 text-kreide">
        <StrukturierterText text={text} frisch={frisch} />
      </div>
    </div>
  )
}

/**
 * strukturiert antworten sinnvoll in absaetze, aufzaehlungen und fettdruck.
 * frische antworten durchlaufen dieselbe struktur und typografie wie
 * gespeicherte chats, wobei woerter fuer das aufklappen staffelbar sind.
 */
function StrukturierterText({ text, frisch = false }: { text: string; frisch?: boolean }) {
  const absaetze = text.split(/\n\s*\n/).map((a) => a.trim()).filter(Boolean)
  const istKurz = absaetze.length <= 1 && text.length < 180

  const woerterZahl = (text.match(/[^\s]+/g) || []).length
  const schritt = Math.min(WORT_VERSATZ_MS, AUSKLAPP_MAX_MS / Math.max(woerterZahl, 1))
  const counter = { current: 0 }

  if (istKurz) {
    return (
      <p className="display whitespace-pre-wrap text-pretty text-[16px] sm:text-[17px] font-semibold leading-[1.35] text-kreide">
        {formatiereTextTeile(text, counter, schritt, frisch)}
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
                    <span>{formatiereTextTeile(bereinigt, counter, schritt, frisch)}</span>
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
              {formatiereTextTeile(absatz, counter, schritt, frisch)}
            </p>
          )
        }

        return (
          <p key={idx} className="font-body whitespace-pre-wrap text-pretty text-[14px] sm:text-[15px] leading-relaxed text-kreide">
            {formatiereTextTeile(absatz, counter, schritt, frisch)}
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
  frisch: boolean
): React.ReactNode {
  const teile = text.split(/(\*\*[^*]+\*\*)/g)
  return teile.map((teil, i) => {
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

/** was du vorlegst, steht praesent und klar lesbar */
function MenschWort({
  text,
  me,
  zeit,
  anhaenge,
  bildAdressen,
}: {
  text: string
  me: UserId
  zeit: string
  anhaenge?: EniAnhang[]
  bildAdressen?: Map<string, string>
}) {
  const farbe = userDef(me).farbe
  return (
    <div className="pt-5">
      <div className="border-l-2 pl-3.5 py-0.5" style={{ borderColor: farbe }}>
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
        </p>
        {text !== '' && (
          <p className="mt-1.5 whitespace-pre-wrap text-pretty text-[15px] leading-relaxed text-kreide">
            {text}
          </p>
        )}
        {anhaenge && anhaenge.length > 0 && (
          <Anhaenge anhaenge={anhaenge} adressen={bildAdressen} />
        )}
      </div>
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
    <div role="status" className="flex items-end gap-[3px] pt-5 pb-1" style={{ height: 38 }}>
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
  )
}

/**
 * Der neue Gesprächseinstieg:
 * Kompakte Begrüßung, klare Rolle, Bezug zur angemeldeten Person,
 * echte Duell-Daten und 4 strukturierte, klickbare Themen-Chips.
 */
function EniLeer({
  me,
  duellStand,
  onAuftakt,
}: {
  me: UserId
  duellStand?: DuellKontext | null
  onAuftakt: (text: string) => void
}) {
  const { gruss, gegner } = eniBegruessung(me)
  const ichFarbe = userDef(me).farbe
  const gegnerDef = userDef(me === 'koray' ? 'erijon' : 'koray')

  const aufholenTitel = duellStand
    ? duellStand.diff > 0
      ? 'Vorsprung ausbauen'
      : duellStand.diff === 0
        ? 'Führung übernehmen'
        : 'Heute aufholen'
    : 'Führung übernehmen'

  const aufholenPrompt = duellStand
    ? duellStand.diff > 0
      ? `wie baue ich meinen vorsprung gegen ${gegner.toLowerCase()} weiter aus`
      : duellStand.diff === 0
        ? `wie übernehme ich heute die führung gegen ${gegner.toLowerCase()}`
        : `wie hole ich heute gegen ${gegner.toLowerCase()} am besten auf`
    : `wie übernehme ich heute die führung gegen ${gegner.toLowerCase()}`

  // Personalisierte Vorschläge
  const vorschlaege = [
    {
      id: 'duell',
      titel: 'Duell analysieren',
      icon: IconChart,
      prompt: `wie stehe ich gegen ${gegner.toLowerCase()}`,
    },
    {
      id: 'aufholen',
      titel: aufholenTitel,
      icon: IconTarget,
      prompt: aufholenPrompt,
    },
    {
      id: 'abend',
      titel: 'Abend planen',
      icon: IconMoon,
      prompt: 'hilf mir den abend planen: schlaf, essen und regeneration',
    },
    {
      id: 'ernaehrung',
      titel: 'Ernährung besprechen',
      icon: IconFood,
      prompt: 'was soll ich heute essen',
    },
  ]

  return (
    <div className="flex flex-1 flex-col justify-start pt-8 pb-6">
      {/* Kopf-Einheit mit Monolith und Begrüßung */}
      <div className="flex items-start gap-4">
        <EniMarke groesse={44} grund="var(--grund)" />
        <div className="min-w-0 flex-1">
          <h2 className="display text-[20px] font-bold tracking-tight text-kreide leading-tight">
            {gruss}
          </h2>
          <p className="mt-1 text-[13px] leading-snug text-kreide-60">
            Schiedsrichter und Begleiter im Zweikampf gegen {gegner}.
          </p>
        </div>
      </div>

      {/* Echte Duell-Lage (falls vorhanden) */}
      {duellStand && (
        <div className="mt-5 rounded-[2px] border border-linie/40 bg-flaeche/50 p-3">
          <div className="flex items-center justify-between text-[11px] text-kreide-52">
            <span className="font-bold uppercase tracking-wider">Aktueller Stand</span>
            <span className="tnum font-bold text-kreide">
              {duellStand.diff > 0
                ? `+${duellStand.diff}`
                : duellStand.diff < 0
                  ? `−${Math.abs(duellStand.diff)}`
                  : '='}
            </span>
          </div>
          <div className="mt-2 flex items-center justify-between">
            <span className="text-[13px] font-semibold" style={{ color: ichFarbe }}>
              Du: <span className="tnum text-[16px] font-bold">{duellStand.wocheIch}</span>
            </span>
            <span className="text-[12px] text-kreide-52">:</span>
            <span className="text-[13px] font-semibold" style={{ color: gegnerDef.farbe }}>
              {gegner}: <span className="tnum text-[16px] font-bold">{duellStand.wocheEr}</span>
            </span>
          </div>
          {duellStand.statusText && (
            <p className="mt-1.5 truncate text-[11px] text-kreide-60">
              {duellStand.statusText}
            </p>
          )}
        </div>
      )}

      {/* Privatsphäre-Hinweis */}
      <p className="mt-4 text-[11px] leading-relaxed text-kreide-52">
        Deine Unterhaltungen sind privat. {gegner} hat keinen Zugriff auf deinen Verlauf.
      </p>

      {/* 4 kompakte, klickbare Startvorschläge */}
      <div className="mt-6">
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-kreide-52 mb-2.5">
          Startvorschläge
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {vorschlaege.map((item) => {
            const Icon = item.icon
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onAuftakt(item.prompt)}
                aria-label={item.prompt}
                className="group flex min-h-12 items-center gap-3 rounded-[2px] border border-linie/40 bg-flaeche/60 px-3.5 py-3 text-left transition-colors hover:border-linie hover:bg-flaeche active:bg-grund focus-visible:outline-2 focus-visible:outline-fokus"
              >
                <Icon size={20} className="shrink-0 text-kreide-60 transition-colors group-hover:text-kreide" aria-hidden="true" />
                <span className="block truncate text-[14px] sm:text-[15px] font-medium text-kreide">
                  {item.titel}
                </span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
