import { motion, useReducedMotion } from 'motion/react'
import { FileText, SpeakerHigh, Stop } from '@phosphor-icons/react'
import { user as userDef } from '../../lib/types'
import type { UserId } from '../../lib/types'
import { toKey } from '../../lib/dates'
import { ERSTER_SATZ } from '../../lib/eni'
import { lesbareGroesse } from '../../lib/eniAnhang'
import type { EniAnhang } from '../../lib/eniAnhang'
import type { EniZeile } from '../../lib/eniSpeicher'
import { EniMarke } from './EniMarke'

const TAGESDATUM = new Intl.DateTimeFormat('de-DE', { day: 'numeric', month: 'long' })
const UHRZEIT = new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit' })

/** die drei, mit denen man anfangen kann, wenn einem nichts einfällt */
export const AUFTAKTE = [
  'wie stehe ich gegen koray',
  'ich habe diese woche nichts gemacht',
  'was soll ich heute essen',
]

/** versatz von wort zu wort, wenn eine antwort aufklappt */
const WORT_VERSATZ_MS = 26

/**
 * so lange darf das aufklappen höchstens dauern. ohne diese schranke bräuchte
 * eine lange erklärung zwanzig sekunden, bis der letzte satz steht, und man
 * säße vor einem text, den man nicht überfliegen darf. bei langen antworten
 * rücken die wörter also enger zusammen.
 */
const AUSKLAPP_MAX_MS = 1100

type Props = {
  zeilen: EniZeile[]
  me: UserId
  /** ENI prüft gerade, der takt läuft */
  prueft: boolean
  /** die zeile, die gerade hereingekommen ist. nur sie klappt auf. */
  frisch?: string | null
  /**
   * signierte adressen der bilder, nach bucket-pfad. der bucket ist nicht
   * öffentlich, also kann kein `src` direkt auf ihn zeigen.
   */
  bildAdressen?: Map<string, string>
  /** die zeile, die gerade vorgelesen wird. null, wenn es still ist. */
  spricht?: string | null
  /** fehlt, wenn das gerät nicht vorlesen kann. dann gibt es keinen knopf. */
  onVorlesen?: (zeile: EniZeile) => void
  onAuftakt: (text: string) => void
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
}: Props) {
  if (zeilen.length === 0 && !prueft) {
    return <EniLeer onAuftakt={onAuftakt} />
  }

  let letzterTag = ''

  return (
    <ol aria-label="dialog mit ENI" aria-live="polite" className="mt-auto pb-2">
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
    <div className="flex items-center gap-3 pt-6 pb-1">
      <span aria-hidden="true" className="h-px flex-1 bg-linie" />
      <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-kreide-52">
        {label}
      </span>
      <span aria-hidden="true" className="h-px flex-1 bg-linie" />
    </div>
  )
}

/** ENIs worte liegen ohne rahmen auf dem grund, wie eine inschrift */
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
      {/* der knopf steht neben ENIs namen und nicht unter dem text: der text
          ist mal drei zeilen und mal dreissig lang, und ein knopf, den man
          erst suchen muss, wird nicht gedrückt. */}
      <div className="flex items-center gap-2">
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-kreide-52">ENI</p>
        {onVorlesen && (
          <button
            type="button"
            onClick={onVorlesen}
            aria-label={spricht ? 'vorlesen anhalten' : 'vorlesen'}
            className="-my-2 -ml-1 flex size-11 items-center justify-center"
            style={{ color: spricht ? 'var(--kreide)' : 'var(--kreide-52)' }}
          >
            {spricht ? (
              <Stop size={13} weight="fill" aria-hidden="true" />
            ) : (
              <SpeakerHigh size={14} aria-hidden="true" />
            )}
          </button>
        )}
      </div>
      {/* absätze bleiben absätze: ENI erklärt manchmal weit aus, und dann ist
          ein einziger block aus siebzig zeilen unlesbar. */}
      <p className="display mt-2 whitespace-pre-wrap text-pretty text-[17px] font-semibold leading-[1.35] text-kreide">
        {frisch ? <Ausklappen text={text} /> : text}
      </p>
    </div>
  )
}

/**
 * ein wort nach dem anderen, wie eine inschrift, die geschlagen wird. nur die
 * gerade eingetroffene antwort läuft so auf; ein alter chat steht sofort da,
 * weil man ihn liest und nicht empfängt.
 *
 * der text steht dabei vollständig im dokument. vorleseprogramme bekommen ihn
 * am stück, das auge bekommt ihn nach und nach. die trenner bleiben erhalten,
 * sonst gingen absätze und leerzeilen verloren.
 */
function Ausklappen({ text }: { text: string }) {
  const teile = text.split(/(\s+)/).filter((teil) => teil !== '')
  const woerter = teile.filter((teil) => !/^\s+$/.test(teil)).length
  const schritt = Math.min(WORT_VERSATZ_MS, AUSKLAPP_MAX_MS / Math.max(woerter, 1))
  let nr = -1

  return (
    <>
      {teile.map((teil, index) => {
        if (/^\s+$/.test(teil)) return <span key={index}>{teil}</span>
        nr += 1
        return (
          <span
            key={index}
            className="eni-wort"
            style={{ animationDelay: `${Math.round(nr * schritt)}ms` }}
          >
            {teil}
          </span>
        )
      })}
    </>
  )
}

/** was du vorlegst, steht eingerückt hinter deiner farbe */
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
      <div className="border-l-2 pl-3" style={{ borderColor: farbe }}>
        <p className="flex items-baseline gap-2">
          <span
            className="text-[10px] font-bold uppercase tracking-[0.2em]"
            style={{ color: farbe }}
          >
            du
          </span>
          <span className="tnum text-[10px] text-kreide-52">
            {UHRZEIT.format(new Date(zeit))}
          </span>
        </p>
        {text !== '' && (
          <p className="mt-1 whitespace-pre-wrap text-pretty text-[13px] leading-relaxed text-kreide-60">
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

/**
 * Was mit einer Vorlage ging, unter ihr. Bilder klein und angeschnitten: der
 * Verlauf ist ein Gespräch und keine Galerie, und wer das Bild groß sehen will,
 * öffnet es. Eine Datei bleibt ein Name mit Größe — ihr Text steht nicht hier,
 * sondern ist zu ENI gegangen.
 */
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
                // die adresse hat eine frist. ist sie abgelaufen oder war das
                // netz weg, steht hier, dass ein bild dabei war, statt eines
                // kaputten symbols.
                <span className="flex h-16 items-center rounded-[2px] border border-linie px-2.5 text-[11px] text-kreide-52">
                  bild nicht geladen
                </span>
              )
            ) : (
              <span className="flex h-16 max-w-[220px] items-center gap-2 rounded-[2px] border border-linie px-2.5">
                <FileText size={16} aria-hidden="true" className="shrink-0 text-kreide-52" />
                <span className="min-w-0">
                  <span className="block truncate text-[12px] text-kreide-60">{anhang.name}</span>
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

/** kein ladekreis. zwölf striche in festem takt, wie eine anzeige, die läuft. */
export function EniTakt() {
  const reduced = useReducedMotion()
  const striche = [12, 20, 8, 26, 14, 22, 10, 28, 16, 20, 8, 24]

  return (
    <div role="status" className="flex items-end gap-[3px] pt-6" style={{ height: 40 }}>
      <span className="sr-only">ENI prüft, was du vorgelegt hast</span>
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
              : { duration: 0.9, repeat: Infinity, delay: index * 0.055, ease: 'easeInOut' }
          }
        />
      ))}
    </div>
  )
}

/**
 * der leere chat. kein „womit kann ich helfen" — ENI stellt sich hin und sagt
 * seinen satz, darunter drei sätze, die man ihm hinwerfen kann.
 */
function EniLeer({ onAuftakt }: { onAuftakt: (text: string) => void }) {
  return (
    <div className="flex flex-1 flex-col justify-center py-8">
      <EniMarke groesse={56} grund="var(--grund)" />
      <p className="display mt-5 text-pretty text-[19px] font-semibold leading-[1.3] text-kreide">
        {ERSTER_SATZ}
      </p>
      <p className="mt-3 text-[11px] leading-4 text-kreide-52">
        was hier steht, bleibt bei dir. koray sieht diese chats nicht.
      </p>

      <ul className="mt-7 border-t border-linie">
        {AUFTAKTE.map((satz) => (
          <li key={satz}>
            <button
              type="button"
              onClick={() => onAuftakt(satz)}
              className="flex min-h-12 w-full items-center border-b border-linie text-left text-[13px] text-kreide-60 transition-colors hover:text-kreide focus-visible:text-kreide"
            >
              {satz}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
