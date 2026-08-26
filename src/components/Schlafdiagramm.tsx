import { motion, useReducedMotion } from 'motion/react'
import { TAGKUERZEL } from '../lib/dates'
import { DIAGRAMM, EASE } from '../lib/motion'
import { USERS } from '../lib/types'
import type { Schlafnacht, UserId } from '../lib/types'

const BREITE = 380
const HOEHE = 226
const LINKS = 26
const RECHTS = 28
const OBEN = 18
const UNTEN = 28
const PLOT_BREITE = BREITE - LINKS - RECHTS
const PLOT_HOEHE = HOEHE - OBEN - UNTEN
const BALKEN_BREITE = 9

type Props = {
  naechte: Schlafnacht[]
  woche: string[]
}

type Punkt = {
  x: number
  y: number
  nacht: Schlafnacht
  tagIndex: number
}

const STUNDEN = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 1 })

function stunden(minuten: number): string {
  return STUNDEN.format(minuten / 60)
}

function xFuerTag(index: number): number {
  return LINKS + ((index + 0.5) / 7) * PLOT_BREITE
}

function teileZusammenhaengend(punkte: Punkt[]): Punkt[][] {
  const teile: Punkt[][] = []
  for (const punkt of punkte) {
    const aktuell = teile[teile.length - 1]
    if (!aktuell || punkt.tagIndex !== aktuell[aktuell.length - 1]!.tagIndex + 1) teile.push([punkt])
    else aktuell.push(punkt)
  }
  return teile
}

export function Schlafdiagramm({ naechte, woche }: Props) {
  const reduced = useReducedMotion()
  const sichtbareNaechte = naechte.filter((nacht) => woche.includes(nacht.nacht))
  const groessteDauer = Math.max(0, ...sichtbareNaechte.map((nacht) => nacht.schlafMinuten))
  const maxStunden = Math.max(8, Math.ceil(groessteDauer / 120) * 2)
  const stundenMarken = [0, maxStunden / 2, maxStunden]
  const ohneWachphasen = sichtbareNaechte.some((nacht) => nacht.bewertungsbasis === 80)
  const letzterBalken = Math.max(0, sichtbareNaechte.length - 1)
  const linienStart = reduced
    ? 0
    : DIAGRAMM.balkenDauer + letzterBalken * DIAGRAMM.balkenVersatz + DIAGRAMM.linienPause

  const nachUser = new Map<UserId, Map<string, Schlafnacht>>()
  for (const user of USERS) nachUser.set(user.id, new Map())
  for (const nacht of sichtbareNaechte) nachUser.get(nacht.user)?.set(nacht.nacht, nacht)

  return (
    <motion.section
      aria-labelledby="schlaf-titel"
      initial={reduced ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reduced ? 0 : 0.28, ease: EASE }}
      className="mt-7"
    >
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <h2 id="schlaf-titel" className="text-[12px] font-normal text-kreide-52">
          schlaf
        </h2>
        <p className="text-right text-[11px] text-kreide-52">balken stunden, linie nachtwert</p>
      </div>

      <svg
        viewBox={`0 0 ${BREITE} ${HOEHE}`}
        className="block h-auto w-full overflow-visible"
        role="img"
        aria-labelledby="schlaf-titel schlaf-beschreibung"
      >
        <desc id="schlaf-beschreibung">
          schlafstunden und selbst berechneter nachtwert für erijon und koray in der aktuellen woche.
        </desc>

        {stundenMarken.map((wert) => {
          const y = OBEN + PLOT_HOEHE - (wert / maxStunden) * PLOT_HOEHE
          return (
            <g key={wert}>
              <line
                x1={LINKS}
                x2={BREITE - RECHTS}
                y1={y}
                y2={y}
                stroke="var(--linie)"
                strokeWidth="1"
                vectorEffect="non-scaling-stroke"
              />
              <text
                x={LINKS - 6}
                y={y + 3}
                textAnchor="end"
                fill="var(--kreide-52)"
                fontSize="10"
                className="tnum"
              >
                {wert}
              </text>
            </g>
          )
        })}

        {[0, 50, 100].map((wert) => {
          const y = OBEN + PLOT_HOEHE - (wert / 100) * PLOT_HOEHE
          return (
            <text
              key={wert}
              x={BREITE - RECHTS + 6}
              y={y + 3}
              textAnchor="start"
              fill="var(--kreide-52)"
              fontSize="10"
              className="tnum"
            >
              {wert}
            </text>
          )
        })}

        {TAGKUERZEL.map((tag, index) => (
          <text
            key={tag}
            x={xFuerTag(index)}
            y={HOEHE - 7}
            textAnchor="middle"
            fill="var(--kreide-52)"
            fontSize="10"
          >
            {tag}
          </text>
        ))}

        {USERS.flatMap((user, userIndex) =>
          woche.flatMap((tag, tagIndex) => {
            const nacht = nachUser.get(user.id)?.get(tag)
            if (!nacht) return []
            const hoehe = (nacht.schlafMinuten / 60 / maxStunden) * PLOT_HOEHE
            const x = xFuerTag(tagIndex) + (userIndex === 0 ? -BALKEN_BREITE - 1.5 : 1.5)
            const y = OBEN + PLOT_HOEHE - hoehe
            const reihenfolge = tagIndex * 2 + userIndex
            return [
              <motion.rect
                key={`${user.id}-${tag}`}
                x={x}
                y={y}
                width={BALKEN_BREITE}
                height={hoehe}
                rx="2"
                fill={user.farbe}
                fillOpacity="0.68"
                initial={reduced ? false : { scaleY: 0, opacity: 0 }}
                animate={{ scaleY: 1, opacity: 1 }}
                transition={{
                  duration: reduced ? 0 : DIAGRAMM.balkenDauer,
                  delay: reduced ? 0 : reihenfolge * DIAGRAMM.balkenVersatz,
                  ease: EASE,
                }}
                style={{ transformBox: 'fill-box', transformOrigin: '50% 100%' }}
              >
                <title>{`${user.name}, ${tag}: ${stunden(nacht.schlafMinuten)} stunden`}</title>
              </motion.rect>,
            ]
          })
        )}

        {USERS.flatMap((user) => {
          const punkte = woche.flatMap((tag, tagIndex) => {
            const nacht = nachUser.get(user.id)?.get(tag)
            if (!nacht) return []
            return [
              {
                x: xFuerTag(tagIndex),
                y: OBEN + PLOT_HOEHE - (nacht.nachtwert / 100) * PLOT_HOEHE,
                nacht,
                tagIndex,
              },
            ]
          })
          const teile = teileZusammenhaengend(punkte)

          return [
            ...teile
              .filter((teil) => teil.length > 1)
              .map((teil, index) => (
                <motion.path
                  key={`${user.id}-linie-${index}`}
                  d={teil.map((punkt, i) => `${i === 0 ? 'M' : 'L'} ${punkt.x} ${punkt.y}`).join(' ')}
                  fill="none"
                  stroke={user.farbe}
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  vectorEffect="non-scaling-stroke"
                  initial={reduced ? false : { pathLength: 0, opacity: 0 }}
                  animate={{ pathLength: 1, opacity: 1 }}
                  transition={{ duration: reduced ? 0 : DIAGRAMM.linienDauer, delay: linienStart, ease: EASE }}
                />
              )),
            ...punkte.map((punkt, index) => (
              <motion.circle
                key={`${user.id}-punkt-${punkt.nacht.nacht}`}
                cx={punkt.x}
                cy={punkt.y}
                r="2.8"
                fill="var(--grund)"
                stroke={user.farbe}
                strokeWidth="1.6"
                vectorEffect="non-scaling-stroke"
                initial={reduced ? false : { opacity: 0, scale: 0 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{
                  duration: reduced ? 0 : 0.2,
                  delay: reduced ? 0 : linienStart + DIAGRAMM.linienDauer + index * 0.035,
                  ease: EASE,
                }}
                style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
              >
                <title>{`${user.name}, ${punkt.nacht.nacht}: nachtwert ${punkt.nacht.nachtwert}`}</title>
              </motion.circle>
            )),
          ]
        })}
      </svg>

      {ohneWachphasen && (
        <p className="mt-1 text-[11px] leading-snug text-kreide-52">
          nachtwert ohne wachphasen: dauer und rhythmus werden von 80 auf 100 umgerechnet.
        </p>
      )}

      <div className="sr-only">
        <table>
          <caption>schlafstunden und nachtwert der aktuellen woche</caption>
          <thead>
            <tr>
              <th>person</th>
              {woche.map((tag) => (
                <th key={tag}>{tag}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {USERS.map((user) => (
              <tr key={user.id}>
                <th>{user.name}</th>
                {woche.map((tag) => {
                  const nacht = nachUser.get(user.id)?.get(tag)
                  return (
                    <td key={tag}>
                      {nacht
                        ? `${stunden(nacht.schlafMinuten)} stunden, nachtwert ${nacht.nachtwert}`
                        : 'keine daten'}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </motion.section>
  )
}
