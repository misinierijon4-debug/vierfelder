import { useRef } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { IconCaretDown, IconSanduhr } from './EniSymbole'
import { useMenueDaneben } from './useMenueDaneben'
import { ankerVon, huelleBewegung, zeileBewegung } from './menueBewegung'
import type { AnbieterInfo } from '../../lib/eniAntwort'

type Props = {
  anbieter: AnbieterInfo[]
  gewaehlt: string | null
  /** ob die gewählte gegenstelle erst nachdenken soll */
  denkt: boolean
  offen: boolean
  /** gesperrt, solange ENI gerade antwortet: mitten im satz wechselt niemand */
  gesperrt?: boolean
  onUmschalten: () => void
  onSchliessen: () => void
  onWaehlen: (id: string) => void
  onDenken: () => void
}

/**
 * Wer gerade für ENI spricht — und ob er sich dafür Zeit nimmt.
 *
 * Das Modell ist nicht ENI, es ist die Stimme, mit der er antwortet. Damit
 * gehört es dorthin, wo man ihn zum Reden bringt, und nicht in den Kopf, wo
 * sein Name steht. Oben steht, mit wem du redest; unten, womit er antwortet.
 *
 * Die Zeile sitzt in dem Feld, das sonst das Diktat und das „wird verarbeitet"
 * trägt. Dieses Feld sagt ohnehin, was gerade läuft — wenn nichts läuft, sagt
 * es, wer spricht.
 *
 * **Das Vordenken ist ein Umschalter, keine zweite Zeile.** Eine Zeit lang
 * stand `ling 3.0 flash (denkt)` als eigener Eintrag daneben, und bei einem
 * Modell ging das auch. Bei dreien wären es sechs Einträge für drei
 * Gesprächspartner: ein Menü, das mehr über den Modus redet als über die Wahl,
 * und auf dem Telefon eine Liste, die über den oberen Rand läuft. Jetzt stehen
 * die Modelle oben und die Stellung darunter, durch eine Haarlinie getrennt —
 * zwei Fragen, zwei Orte.
 *
 * **Unter den Namen steht nichts.** Eine Zeile je Modell, sonst nichts: das
 * Menü beantwortet die Frage „wer spricht", und drei Erklärzeilen darunter
 * haben sie lauter beantwortet als nötig. Was ein Modell kann und was es
 * kostet, steht in ENI-SCHLUESSEL.md — hier steht, was man wählt. Der einzige
 * Satz, der bleibt, gehört zum Umschalter: der sagt, was man eintauscht, und
 * das ist bei jedem Modell etwas anderes.
 *
 * **Eine Warnung ist die Ausnahme davon.** Sie erklärt nicht, was ein Modell
 * kann, sondern was mit einem schiefgeht — qwen 3.8 gibt die Systemanweisung
 * wörtlich aus. Das erfährt man sonst erst aus der Antwort, und dann ist es zu
 * spät. Sie steht nur, wo der Server sie setzt.
 *
 * Was hier steht, kommt vom Server: genau die Schlüssel, die gesetzt sind, und
 * für jeden die Auskunft, ob er überhaupt vordenken kann. Der Browser kennt
 * weder Adresse noch Schlüssel, nur den Namen, eine id und ein Ja oder Nein.
 */
export function EniModellwahl({
  anbieter,
  gewaehlt,
  denkt,
  offen,
  gesperrt = false,
  onUmschalten,
  onSchliessen,
  onWaehlen,
  onDenken,
}: Props) {
  const huelleRef = useRef<HTMLDivElement>(null)
  useMenueDaneben(offen, huelleRef, onSchliessen)

  const reduziert = useReducedMotion() ?? false
  const huelle = huelleBewegung('unten-links', reduziert)
  const zeile = zeileBewegung(reduziert)

  if (anbieter.length === 0) return null

  const aktiv = anbieter.find((eintrag) => eintrag.id === gewaehlt) ?? anbieter[0]!

  /*
    Eine Wahl mit einer Möglichkeit ist keine Wahl: steht nur ein Anbieter da,
    bleibt die Liste weg. Der Umschalter kann trotzdem dastehen — bei einem
    einzigen Schlüssel ist die Stellung die einzige Frage, die noch offen ist.
  */
  const zeigeModelle = anbieter.length > 1
  const zeigeDenken = aktiv.denkbar
  if (!zeigeModelle && !zeigeDenken) return null

  const denktJetzt = denkt && aktiv.denkbar

  return (
    <div ref={huelleRef} className="relative">
      <button
        type="button"
        onClick={onUmschalten}
        disabled={gesperrt}
        aria-haspopup="menu"
        aria-expanded={offen}
        aria-label={`modell wählen, gerade ${aktiv.name}${aktiv.warnung ? `, ${aktiv.warnung}` : ''}${denktJetzt ? ', denkt vor' : ''}`}
        className="flex min-w-0 max-w-full items-center gap-1 py-1 text-[11px] transition-opacity disabled:opacity-40"
        style={{ color: offen ? 'var(--kreide)' : 'var(--kreide-52)' }}
      >
        <span className="truncate">{aktiv.name}</span>
        {/*
          Dass gerade vorgedacht wird, gehört an dieselbe Zeile: sie ist die
          einzige Stelle, an der ohne Tippen steht, was mit deinem Satz
          passiert. Ein stiller Modus, der nur die Antwort verlangsamt, wäre
          genau die Sorte Geheimnis, die diese App sonst nicht hat.
        */}
        {denktJetzt && (
          <span className="shrink-0 whitespace-nowrap">· denkt</span>
        )}
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
            {zeigeModelle &&
              anbieter.map((eintrag) => {
                const dran = eintrag.id === aktiv.id
                return (
                  <motion.button
                    key={eintrag.id}
                    variants={zeile}
                    type="button"
                    role="menuitemradio"
                    aria-checked={dran}
                    onClick={() => onWaehlen(eintrag.id)}
                    /*
                      Eine Zeile, ein Name. `min-h-11` statt eines zweiten
                      Satzes: was die Zeile an Höhe verliert, bekommt sie als
                      Griff zurück — 44 Pixel sind die Daumenbreite, unter der
                      auf dem Telefon niemand trifft.
                    */
                    className="flex min-h-11 w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-grund"
                  >
                    <span
                      aria-hidden="true"
                      className="flex w-3 shrink-0 justify-center text-[11px] leading-none"
                      style={{ color: dran ? 'var(--kreide)' : 'transparent', opacity: dran ? 1 : 0 }}
                    >
                      •
                    </span>
                    <span className="min-w-0 flex-1">
                      <span
                        className="block truncate text-[12px] font-bold leading-tight"
                        style={{ color: dran ? 'var(--kreide)' : 'var(--kreide-60)' }}
                      >
                        {eintrag.name}
                      </span>
                      {eintrag.warnung !== '' && (
                        <span className="block pt-0.5 text-[10px] leading-tight text-kreide-52">
                          {eintrag.warnung}
                        </span>
                      )}
                    </span>
                  </motion.button>
                )
              })}

            {zeigeModelle && zeigeDenken && (
              /*
                Eine Haarlinie, kein Abstand: die Stellung ist keine vierte
                Stimme in derselben Liste, sondern die zweite Frage.
              */
              <motion.div
                variants={zeile}
                aria-hidden="true"
                className="my-1 border-t border-linie"
              />
            )}

            {zeigeDenken && (
              <motion.button
                variants={zeile}
                type="button"
                role="menuitemcheckbox"
                aria-checked={denkt}
                /*
                  Das Menü bleibt beim Umschalten offen: man soll die Sanduhr
                  umspringen sehen, statt vor einer geschlossenen Zeile zu
                  raten, ob es angekommen ist. Dieselbe Regel wie im Kopfmenü.
                */
                onClick={onDenken}
                className="flex w-full items-start gap-2 px-3 py-2.5 text-left transition-colors hover:bg-grund"
              >
                <span
                  aria-hidden="true"
                  className="mt-[1px] flex w-3 shrink-0 justify-center"
                  style={{ color: denkt ? 'var(--kreide)' : 'var(--kreide-52)' }}
                >
                  <IconSanduhr size={12} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <span
                      className="text-[12px] font-bold leading-tight"
                      style={{ color: denkt ? 'var(--kreide)' : 'var(--kreide-60)' }}
                    >
                      erst nachdenken
                    </span>
                    <span
                      aria-hidden="true"
                      className="shrink-0 text-[10px] leading-tight"
                      style={{ color: denkt ? 'var(--kreide)' : 'var(--kreide-52)' }}
                    >
                      {denkt ? 'an' : 'aus'}
                    </span>
                  </span>
                  {/*
                    Was es kostet, sagt der Anbieter selbst — bei DeepSeek ist
                    das Geld, sonst nur Zeit. Ein Satz für alle wäre bei einem
                    von dreien gelogen.
                  */}
                  {aktiv.denkHinweis !== '' && (
                    <span className="block pt-0.5 text-[10px] leading-tight text-kreide-52">
                      {aktiv.denkHinweis}
                    </span>
                  )}
                </span>
              </motion.button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
