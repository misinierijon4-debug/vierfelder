import { useRef } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import {
  IconClock,
  IconGedaechtnis,
  IconMenue,
  IconSpeakerHigh,
  IconSpeakerSlash,
} from './EniSymbole'
import { useMenueDaneben } from './useMenueDaneben'
import { ankerVon, huelleBewegung, zeileBewegung } from './menueBewegung'

type Props = {
  offen: boolean
  /** ohne stimme im gerät steht das vorlesen gar nicht erst im menü */
  stimmeMoeglich: boolean
  vorlesen: boolean
  onVorlesen: () => void
  onVerlauf: () => void
  onGedaechtnis: () => void
  onUmschalten: () => void
  onSchliessen: () => void
}

/**
 * Alles, was nicht der neue Chat ist, hinter einem Knopf.
 *
 * Der Kopf trug vier gleich große, gleich graue Symbole: vorlesen, gedächtnis,
 * verlauf, neuer chat. Vier Werkzeuge neben einem Rückweg und einem Namen sind
 * mehr Gerät, als eine Leiste verträgt, die vor allem eines sagen soll: hier
 * redest du mit ENI. Geblieben ist der neue Chat, weil er der einzige Griff
 * ist, den man mitten im Reden braucht; der Rest liegt hier.
 *
 * Im Menü stehen die Dinge ausgeschrieben. Ein Symbol allein muss geraten
 * werden, eine Zeile mit Wort nicht — und Platz ist hier keiner mehr knapp.
 */
export function EniKopfmenue({
  offen,
  stimmeMoeglich,
  vorlesen,
  onVorlesen,
  onVerlauf,
  onGedaechtnis,
  onUmschalten,
  onSchliessen,
}: Props) {
  const huelleRef = useRef<HTMLDivElement>(null)
  useMenueDaneben(offen, huelleRef, onSchliessen)

  const reduziert = useReducedMotion() ?? false
  const huelle = huelleBewegung('oben-rechts', reduziert)
  const zeile = zeileBewegung(reduziert)

  return (
    <div ref={huelleRef} className="relative">
      <button
        type="button"
        onClick={onUmschalten}
        aria-haspopup="menu"
        aria-expanded={offen}
        aria-label="menü"
        className="flex size-11 items-center justify-center transition-colors"
        style={{ color: offen ? 'var(--kreide)' : 'var(--kreide-60)' }}
      >
        <IconMenue size={18} />
      </button>

      <AnimatePresence>
        {offen && (
          <motion.div
            key="menue"
            role="menu"
            aria-label="menü"
            variants={huelle}
            initial="zu"
            animate="auf"
            exit="weg"
            style={{ transformOrigin: ankerVon('oben-rechts') }}
            /*
              Rechtsbündig statt mittig: das Menü hängt am rechten Rand des
              Kopfes, und ein mittig gesetztes Feld würde dort über die Kante
              laufen. Eine hellere Haarlinie hebt es ab — kein Schatten, die App
              kennt nur eine Ebene.
            */
            className="absolute right-0 top-full z-20 mt-1 w-[230px] border border-linie-hell bg-flaeche py-1"
          >
            <motion.button
              variants={zeile}
              type="button"
              role="menuitem"
              onClick={onVerlauf}
              className="flex min-h-11 w-full items-center gap-2.5 px-3 text-left text-kreide-60 transition-colors hover:bg-grund hover:text-kreide active:bg-grund/80"
            >
              <span aria-hidden="true" className="flex w-[16px] shrink-0 justify-center">
                <IconClock size={16} />
              </span>
              <span className="text-[12px] font-semibold leading-tight">verlauf</span>
            </motion.button>

            {stimmeMoeglich && (
              <motion.button
                variants={zeile}
                type="button"
                role="menuitemcheckbox"
                aria-checked={vorlesen}
                /*
                  Das Menü bleibt beim Umschalten offen: man soll das Symbol
                  umspringen sehen, statt vor einer geschlossenen Leiste zu
                  raten, ob es angekommen ist.
                */
                onClick={onVorlesen}
                className="flex min-h-11 w-full items-center gap-2.5 px-3 text-left transition-colors hover:bg-grund active:bg-grund/80"
              >
                <span
                  aria-hidden="true"
                  className="flex w-[16px] shrink-0 justify-center"
                  style={{ color: vorlesen ? 'var(--kreide)' : 'var(--kreide-52)' }}
                >
                  {vorlesen ? <IconSpeakerHigh size={16} /> : <IconSpeakerSlash size={16} />}
                </span>
                <span
                  className="text-[12px] font-semibold leading-tight"
                  style={{ color: vorlesen ? 'var(--kreide)' : 'var(--kreide-60)' }}
                >
                  antworten vorlesen
                </span>
                {vorlesen && (
                  <span
                    aria-hidden="true"
                    className="ml-auto inline-block size-1.5 shrink-0 rounded-full bg-kreide"
                  />
                )}
              </motion.button>
            )}

            <motion.button
              variants={zeile}
              type="button"
              role="menuitem"
              onClick={onGedaechtnis}
              className="flex min-h-11 w-full items-center gap-2.5 px-3 text-left text-kreide-60 transition-colors hover:bg-grund hover:text-kreide active:bg-grund/80"
            >
              <span aria-hidden="true" className="flex w-[16px] shrink-0 justify-center">
                <IconGedaechtnis size={16} />
              </span>
              <span className="text-[12px] font-semibold leading-tight">
                das weiß ENI über mich
              </span>
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
