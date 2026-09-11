import { useCallback, useEffect, useRef, useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { ArrowUp, Microphone, Paperclip } from '@phosphor-icons/react'
import { STEMPEL, TAKT } from '../../lib/motion'
import { useNeustartBlocker } from '../../lib/pwaBlocker'
import { fuegeAn, useDiktat } from '../../lib/eniDiktat'
import { MAX_ANHAENGE } from '../../lib/eniAnhang'
import type { VorbereiteterAnhang } from '../../lib/eniAnhang'
import { EniAnhangStreifen } from './EniAnhangStreifen'

/** über fünf zeilen wächst das feld nicht weiter, sonst frisst es den dialog */
const MAX_ZEILEN = 5

/**
 * was der dateidialog anbietet. `image/*` öffnet auf dem telefon auch die
 * kamera; der rest sind die endungen, hinter denen text steht und die android
 * gern als `application/octet-stream` meldet, wenn man nur nach typen fragt.
 */
const ANNEHMBAR =
  'image/*,text/*,.md,.markdown,.csv,.tsv,.json,.yml,.yaml,.xml,.log,.ts,.tsx,.js,.jsx,.css,.html,.sql,.py,.sh,.toml,.ini'

type Props = {
  /** solange ENI prüft, nimmt er nichts zweites an */
  gesperrt: boolean
  onVorlegen: (text: string) => void
  /**
   * von aussen gesetzter text: einer der drei auftakte, oder eine vorlage, die
   * nicht gespeichert werden konnte. `nr` zaehlt hoch, damit auch derselbe
   * satz zweimal hintereinander wieder im feld landet.
   */
  vorgabe?: { text: string; nr: number } | null
  /**
   * anhänge gibt es nur mit konto: ohne anmeldung gibt es keinen bucket, in dem
   * ein bild liegen könnte, und keine modellverbindung, die es ansehen würde.
   */
  anhaengenMoeglich: boolean
  anhaenge: VorbereiteterAnhang[]
  onAnhaengen: (dateien: File[]) => void
  onAnhangEntfernen: (id: string) => void
}

export function EniEingabe({
  gesperrt,
  onVorlegen,
  vorgabe,
  anhaengenMoeglich,
  anhaenge,
  onAnhaengen,
  onAnhangEntfernen,
}: Props) {
  const [text, setText] = useState('')
  const [absendeNr, setAbsendeNr] = useState(0)
  const feldRef = useRef<HTMLTextAreaElement>(null)
  const dateiRef = useRef<HTMLInputElement>(null)

  // das diktat haengt seine stuecke an den bestand an, statt ihn zu ersetzen:
  // wer erst tippt und dann spricht, verliert das getippte nicht.
  const nimmDiktat = useCallback((stueck: string) => {
    setText((vorher) => fuegeAn(vorher, stueck))
  }, [])
  const diktat = useDiktat(nimmDiktat)

  const etwasDabei = text.trim().length > 0 || anhaenge.length > 0

  // eine halb getippte vorlage ist arbeit, ein hochgeladenes bild auch. ein
  // wartender service worker darf beides nicht wegreissen, genauso wenig wie
  // eine offene wette im duell-tab.
  useNeustartBlocker(etwasDabei)

  useEffect(() => {
    if (!vorgabe) return
    setText(vorgabe.text)
    feldRef.current?.focus()
    // absichtlich nur an der nummer: derselbe text soll erneut greifen duerfen
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vorgabe?.nr])

  // das feld wächst mit dem text, statt ihn hinter einem scrollbalken zu
  // verstecken. erst zurücksetzen, dann messen, sonst schrumpft es nie wieder.
  useEffect(() => {
    const feld = feldRef.current
    if (!feld) return
    feld.style.height = 'auto'
    const zeile = Number.parseFloat(getComputedStyle(feld).lineHeight) || 20
    feld.style.height = `${Math.min(feld.scrollHeight, zeile * MAX_ZEILEN + 20)}px`
  }, [text])

  const legeVor = () => {
    const sauber = text.trim()
    if (!etwasDabei || gesperrt) return
    // ein offenes mikrofon gehoert nicht in die naechste vorlage hinein
    if (diktat.laeuft) diktat.stoppe()
    onVorlegen(sauber)
    setText('')
    setAbsendeNr((n) => n + 1)
    // die einzige haptik, die ein telefon hergibt. fehlt sie, fehlt nichts.
    try {
      navigator.vibrate?.(12)
    } catch {
      /* manche browser melden vibrate als vorhanden und verweigern es dann */
    }
  }

  const frei = MAX_ANHAENGE - anhaenge.length

  return (
    <form
      className="border-t border-linie pt-3"
      onSubmit={(event) => {
        event.preventDefault()
        legeVor()
      }}
    >
      {/*
        Ein Rahmen um alles, was zur Vorlage gehört: was mitgeht, was du
        schreibst, und womit du es abschickst. Vorher stand ein Kasten für den
        Text da und darunter drei lose Knöpfe, und der untere Rand der Ansicht
        las sich wie drei Sachen statt wie ein Feld.

        Der Rahmen zieht mit, wenn das Feld den Fokus hat. Das ist der einzige
        Grund, warum der Kasten überhaupt einen Rand braucht: er sagt, wohin
        das Getippte geht.
      */}
      <div className="rounded-[2px] border border-kontroll-rand bg-flaeche focus-within:border-kreide has-[textarea:focus-visible]:[outline:2px_solid_var(--fokus)] has-[textarea:focus-visible]:[outline-offset:3px]">
        <EniAnhangStreifen
          anhaenge={anhaenge}
          gesperrt={gesperrt}
          onEntfernen={onAnhangEntfernen}
        />

        <label htmlFor="eni-eingabe" className="sr-only">
          was du ENI vorlegst
        </label>
        {/*
          Das Feld hat keinen eigenen Rand mehr, der Rahmen drumherum ist
          seiner. Auch den Fokusring aus index.css bekommt der Rahmen statt des
          Feldes: sonst zöge er drei Pixel ausserhalb des Feldes, also mitten im
          Kasten, und der untere Rand sähe wieder nach zwei Kästen aus. Er
          bleibt an `:focus-visible` gebunden, kommt also weiterhin nur bei der
          Tastatur; die Maus bekommt den helleren Rand.
        */}
        <textarea
          id="eni-eingabe"
          ref={feldRef}
          rows={1}
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            // auf der tastatur schickt enter ab, umschalt-enter macht einen
            // absatz. auf dem telefon bleibt der knopf der weg.
            if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault()
              legeVor()
            }
          }}
          onPaste={(event) => {
            // ein screenshot aus der zwischenablage ist der schnellste weg, ENI
            // etwas zu zeigen. am schreibtisch ist das der normalfall.
            if (!anhaengenMoeglich || frei <= 0) return
            const bilder = [...event.clipboardData.files].filter((datei) =>
              datei.type.startsWith('image/')
            )
            if (bilder.length === 0) return
            event.preventDefault()
            onAnhaengen(bilder.slice(0, frei))
          }}
          placeholder="sag es gerade heraus"
          enterKeyHint="send"
          /* der fokusring gehört dem rahmen, siehe index.css */
          data-ring="rahmen"
          autoComplete="off"
          className="block min-h-11 w-full resize-none border-0 bg-transparent px-3 pt-3 text-[14px] leading-5 text-kreide placeholder:text-kreide-52"
        />

        {/* die knopfleiste im selben rahmen. links, was du mitgibst, rechts,
            womit du es abgibst — die reihenfolge, in der man es tut. */}
        <div className="flex items-center gap-0.5 px-1.5 pb-1">
          {anhaengenMoeglich && (
            <>
              <input
                ref={dateiRef}
                type="file"
                multiple
                accept={ANNEHMBAR}
                className="sr-only"
                onChange={(event) => {
                  const dateien = [...(event.target.files ?? [])].slice(0, frei)
                  // dasselbe bild zweimal hintereinander soll wieder greifen
                  event.target.value = ''
                  if (dateien.length > 0) onAnhaengen(dateien)
                }}
              />
              <button
                type="button"
                onClick={() => dateiRef.current?.click()}
                disabled={gesperrt || frei <= 0}
                aria-label={
                  frei <= 0
                    ? `mehr als ${MAX_ANHAENGE} anhänge gehen nicht`
                    : 'bild oder datei anhängen'
                }
                className="flex size-11 shrink-0 items-center justify-center rounded-[2px] text-kreide-60 disabled:opacity-40"
              >
                <Paperclip size={18} aria-hidden="true" />
              </button>
            </>
          )}

          {diktat.moeglich && (
            <button
              type="button"
              onClick={() => (diktat.laeuft ? diktat.stoppe() : diktat.starte())}
              disabled={gesperrt}
              aria-pressed={diktat.laeuft}
              aria-label={diktat.laeuft ? 'diktat beenden' : 'diktieren'}
              className="flex size-11 shrink-0 items-center justify-center rounded-[2px] disabled:opacity-40"
              style={{ color: diktat.laeuft ? 'var(--erijon)' : 'var(--kreide-60)' }}
            >
              <Microphone
                size={18}
                weight={diktat.laeuft ? 'fill' : 'regular'}
                aria-hidden="true"
              />
            </button>
          )}

          <span className="min-w-0 flex-1">
            {/* was das mikrofon gerade hört, steht blass in der leiste: es ist
                noch nicht gesagt, und es steht noch nicht im feld. */}
            {diktat.laeuft && (
              <span className="block truncate pl-1 text-[11px] italic text-kreide-52">
                {diktat.vorlaeufig || 'hört zu …'}
              </span>
            )}
          </span>

          {/*
            Ein Pfeil, kein Wort. Das Wort stand vier Zeichen neben dem Feld und
            war doch nur die Beschriftung für das, was Enter ohnehin tut; der
            Pfeil sagt dasselbe in der Breite eines Knopfes und lässt dem
            Diktatstreifen daneben Platz.

            Gefüllt statt umrandet, weil das hier dieselbe Sorte Handlung ist
            wie das Speichern einer Wette: sie gibt etwas aus der Hand. Solange
            nichts dasteht, was man aus der Hand geben könnte, ist er nur ein
            Umriss — eine graue Fläche wäre im leeren Chat das Lauteste nach der
            Überschrift, und das darf nicht der Knopf sein, den man nicht
            drücken kann.

            `vorlegen` bleibt der Name des Knopfes, nur nicht mehr auf ihm: wer
            die Oberfläche vorgelesen bekommt, hört weiterhin das Verb dieser
            App und nicht „senden".
          */}
          <motion.button
            type="submit"
            whileTap={{ scale: 0.96 }}
            transition={STEMPEL}
            disabled={!etwasDabei || gesperrt}
            aria-label="vorlegen"
            className="flex min-h-11 w-11 shrink-0 items-center justify-center rounded-[2px] border border-transparent bg-kreide text-grund disabled:border-linie-hell disabled:bg-transparent disabled:text-kreide-52"
          >
            <ArrowUp size={18} weight="bold" aria-hidden="true" />
          </motion.button>
        </div>
      </div>

      {/* dieselbe regel wie die zeile im kopf: es wird hingeschrieben, wohin
          etwas geht. die spracherkennung steckt zwar im browser, arbeitet bei
          chrome und safari aber auf deren servern. ein mikrofon, das so tut,
          als bliebe alles hier, wäre gelogen. */}
      {diktat.laeuft && (
        <p className="mt-1.5 text-[10px] leading-4 text-kreide-52">
          das mikrofon läuft über die spracherkennung deines browsers. dein ton geht dafür an
          google oder apple, nicht an ENI.
        </p>
      )}
      {diktat.fehler && (
        <p role="alert" className="mt-1.5 text-[11px]" style={{ color: 'var(--erijon)' }}>
          {diktat.fehler}
        </p>
      )}

      {/* die bestätigung ist ein strich, der einmal hart durchzieht. er sitzt
          unter dem rahmen, damit die eingabe beim tippen nicht springt. */}
      <Stempel nr={absendeNr} />
    </form>
  )
}

function Stempel({ nr }: { nr: number }) {
  const reduced = useReducedMotion()
  if (nr === 0 || reduced) return <div className="mt-2 h-px" aria-hidden="true" />

  return (
    <div className="mt-2 h-px overflow-hidden" aria-hidden="true">
      <motion.div
        key={nr}
        className="h-px bg-kreide"
        initial={{ scaleX: 0, opacity: 1 }}
        animate={{ scaleX: 1, opacity: 0 }}
        transition={{ duration: TAKT.sweep, ease: 'easeOut' }}
        style={{ originX: 0 }}
      />
    </div>
  )
}
