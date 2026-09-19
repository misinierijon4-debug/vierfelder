import { motion, useReducedMotion } from 'motion/react'
import { EASE } from '../../lib/motion'
import type { WochenberichtTexte } from '../../lib/wochenberichtTexte'

export type EniTextStatus = 'aus' | 'laedt' | 'fehlt' | 'da' | 'offen'

type Props = {
  status: EniTextStatus
  texte: WochenberichtTexte | null
  /** nur gesetzt, wenn ein erneuter versuch etwas bringen kann */
  onErneut?: () => void
}

/**
 * Der einzige Teil des Berichts, den ENI schreibt.
 *
 * Er steht hinter den Zahlen und nicht davor: erst sieht man, was war, dann
 * liest man, was jemand dazu meint. Und er ist ersetzbar — faellt er aus, ist
 * der Bericht trotzdem vollstaendig. Genau darum sind hier nur Saetze und
 * keine Werte.
 */
export function BerichtEni({ status, texte, onErneut }: Props) {
  const reduced = useReducedMotion()

  return (
    <section
      className="rounded-[2px] border border-linie bg-flaeche p-3"
      aria-labelledby="bericht-eni-titel"
    >
      <h3
        id="bericht-eni-titel"
        className="flex items-center gap-2 text-[11px] uppercase tracking-wide text-kreide-52"
      >
        <span className="size-2 rounded-full bg-kreide-60" aria-hidden="true" />
        was ENI dazu sagt
      </h3>

      {status === 'da' && texte ? (
        <motion.div
          initial={reduced ? false : { opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.28, ease: EASE }}
          className="mt-2.5 space-y-3"
        >
          <p className="text-pretty text-[14px] font-semibold leading-snug text-kreide">
            {texte.ueberschrift}
          </p>
          <Absatz titel="das lief" text={texte.lief} />
          <Absatz titel="das muster" text={texte.muster} />
          <div>
            <h4 className="text-[10px] uppercase tracking-wide text-kreide-52">nächste woche</h4>
            <ol className="mt-1 space-y-1.5">
              {texte.naechste.map((eintrag, i) => (
                <li key={eintrag} className="flex gap-2 text-pretty text-[12px] leading-snug text-kreide">
                  <span className="tnum shrink-0 text-kreide-52">{i + 1}</span>
                  <span>{eintrag}</span>
                </li>
              ))}
            </ol>
          </div>
        </motion.div>
      ) : status === 'laedt' ? (
        <Platzhalter />
      ) : (
        <div className="mt-2.5">
          <p className="text-pretty text-[12px] leading-snug text-kreide-52">
            {status === 'aus'
              ? 'im prototyp schreibt ENI nichts — die zahlen oben stehen trotzdem alle da.'
              : status === 'offen'
                ? 'ENI blickt am montag auf die abgeschlossene woche zurück.'
                : 'ENIs Rückblick ist gerade nicht verfügbar. Bei einem laufenden Versuch bitte kurz warten.'}
          </p>
          {status === 'fehlt' && onErneut && (
            <button
              type="button"
              onClick={onErneut}
              className="mt-2 rounded-[2px] border border-kontroll-rand px-2.5 py-1.5 text-[11px] text-kreide transition-colors duration-150 hover:border-linie-hell focus-visible:outline-none"
            >
              nochmal versuchen
            </button>
          )}
        </div>
      )}
    </section>
  )
}

function Absatz({ titel, text }: { titel: string; text: string }) {
  return (
    <div>
      <h4 className="text-[10px] uppercase tracking-wide text-kreide-52">{titel}</h4>
      <p className="mt-1 text-pretty text-[12px] leading-snug text-kreide">{text}</p>
    </div>
  )
}

/**
 * Drei Balken in der Form der spaeteren Absaetze.
 *
 * Kein Spinner: der Bericht ist schon da, hier fehlt nur noch der Kommentar.
 * Ein Ladekreis wuerde behaupten, die Seite sei noch nicht fertig.
 */
function Platzhalter() {
  const reduced = useReducedMotion()
  const breiten = ['85%', '100%', '62%']

  return (
    <div className="mt-3 space-y-2" aria-live="polite" aria-busy="true">
      <span className="sr-only">ENI schreibt die zusammenfassung</span>
      {breiten.map((breite, i) => (
        <motion.span
          key={breite}
          aria-hidden="true"
          className="block h-3 rounded-[2px] bg-linie"
          style={{ width: breite }}
          animate={reduced ? undefined : { opacity: [0.45, 0.9, 0.45] }}
          transition={{ duration: 1.5, ease: 'easeInOut', repeat: Infinity, delay: i * 0.14 }}
        />
      ))}
    </div>
  )
}
