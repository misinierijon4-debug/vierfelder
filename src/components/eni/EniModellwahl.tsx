import { useRef } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { IconCaretDown } from './EniSymbole'
import { useMenueDaneben } from './useMenueDaneben'
import { ankerVon, huelleBewegung, zeileBewegung } from './menueBewegung'
import type { AnbieterInfo } from '../../lib/eniAntwort'

type Props = {
  anbieter: AnbieterInfo[]
  gewaehlt: string | null
  offen: boolean
  /** gesperrt, solange ENI gerade antwortet: mitten im satz wechselt niemand */
  gesperrt?: boolean
  onUmschalten: () => void
  onSchliessen: () => void
  onWaehlen: (id: string) => void
}

/**
 * Wer gerade für ENI spricht — unten an der Eingabe, nicht oben am Namen.
 *
 * Das Modell ist nicht ENI, es ist die Stimme, mit der er antwortet. Damit
 * gehört es dorthin, wo man ihn zum Reden bringt, und nicht in den Kopf, wo
 * sein Name steht. Oben steht, mit wem du redest; unten, womit er antwortet.
 *
 * Die Zeile sitzt in dem Feld, das sonst das Diktat und das „wird verarbeitet"
 * trägt. Dieses Feld sagt ohnehin, was gerade läuft — wenn nichts läuft, sagt
 * es, wer spricht.
 *
 * Steht nur ein Anbieter zur Wahl, steht hier nichts. Eine Wahl mit einer
 * Möglichkeit ist keine Wahl, und eine Herkunftszeile, die niemand braucht,
 * war schon einmal da und ist auf Ansage wieder rausgeflogen.
 *
 * Was hier steht, kommt vom Server: genau die Schlüssel, die gesetzt sind. Der
 * Browser kennt weder Adresse noch Schlüssel, nur den Namen und eine id.
 */
export function EniModellwahl({
  anbieter,
  gewaehlt,
  offen,
  gesperrt = false,
  onUmschalten,
  onSchliessen,
  onWaehlen,
}: Props) {
  const huelleRef = useRef<HTMLDivElement>(null)
  useMenueDaneben(offen, huelleRef, onSchliessen)

  const reduziert = useReducedMotion() ?? false
  const huelle = huelleBewegung('unten-links', reduziert)
  const zeile = zeileBewegung(reduziert)

  if (anbieter.length < 2) return null

  const aktiv = anbieter.find((eintrag) => eintrag.id === gewaehlt) ?? anbieter[0]!

  return (
    <div ref={huelleRef} className="relative">
      <button
        type="button"
        onClick={onUmschalten}
        disabled={gesperrt}
        aria-haspopup="menu"
        aria-expanded={offen}
        aria-label={`modell wählen, gerade ${aktiv.name}`}
        className="flex min-w-0 max-w-full items-center gap-1 py-1 text-[11px] transition-opacity disabled:opacity-40"
        style={{ color: offen ? 'var(--kreide)' : 'var(--kreide-52)' }}
      >
        <span className="truncate">{aktiv.name}</span>
        <IconCaretDown
          size={10}
          className="shrink-0 transition-transform"
          style={{ transform: offen ? 'rotate(180deg)' : 'none' }}
        />
      </button>

      <AnimatePresence>
        {offen && (
          /*
            Nach oben, nicht nach unten: unter der Eingabe ist der Rand des
            Bildschirms, und auf dem Telefon steht dort die Tastatur.
          */
          <motion.div
            key="modell"
            role="menu"
            aria-label="modell"
            variants={huelle}
            initial="zu"
            animate="auf"
            exit="weg"
            style={{ transformOrigin: ankerVon('unten-links') }}
            className="absolute bottom-full left-0 z-20 mb-1.5 w-[230px] border border-linie-hell bg-flaeche py-1"
          >
            {anbieter.map((eintrag) => {
              const dran = eintrag.id === aktiv.id
              return (
                <motion.button
                  key={eintrag.id}
                  variants={zeile}
                  type="button"
                  role="menuitemradio"
                  aria-checked={dran}
                  onClick={() => onWaehlen(eintrag.id)}
                  className="flex w-full items-start gap-2 px-3 py-2.5 text-left transition-colors hover:bg-grund"
                >
                  <span
                    aria-hidden="true"
                    className="mt-[3px] text-[11px] leading-none"
                    style={{ color: dran ? 'var(--kreide)' : 'transparent' }}
                  >
                    ›
                  </span>
                  <span className="min-w-0 flex-1">
                    <span
                      className="block text-[12px] font-bold leading-tight"
                      style={{ color: dran ? 'var(--kreide)' : 'var(--kreide-60)' }}
                    >
                      {eintrag.name}
                    </span>
                    <span className="block pt-0.5 text-[10px] leading-tight text-kreide-52">
                      {eintrag.hinweis}
                    </span>
                  </span>
                </motion.button>
              )
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
