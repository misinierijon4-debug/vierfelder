import { motion, useReducedMotion } from 'motion/react'
import { USERS } from '../../lib/types'
import type { UserId } from '../../lib/types'
import { TAGKUERZEL } from '../../lib/dates'
import { BERICHT, EASE } from '../../lib/motion'
import { alsDauer } from '../../lib/wochenbericht'
import type { Wochenbericht } from '../../lib/wochenbericht'

type Props = { bericht: Wochenbericht; grundVersatz: number }

const LINKS = 30
const RECHTS = 310

/**
 * Dauer und Nachtwert stehen absichtlich in zwei Bildern.
 *
 * Es sind zwei Groessen mit zwei Einheiten: Stunden und ein Punktwert von 0
 * bis 100. Auf eine gemeinsame Achse gelegt, oder auf zwei Achsen in ein Bild,
 * erzeugen sie Schnittpunkte, die nichts bedeuten — ein Diagramm, das luegt,
 * ohne eine falsche Zahl zu enthalten. Zwei Bilder kosten ein bisschen Platz
 * und sagen die Wahrheit.
 */
export function BerichtSchlaf({ bericht, grundVersatz }: Props) {
  return (
    <div className="space-y-4">
      <SchlafDauer bericht={bericht} grundVersatz={grundVersatz} />
      <SchlafQualitaet bericht={bericht} grundVersatz={grundVersatz + 0.1} />
    </div>
  )
}

/** Balken je Nacht, gestrichelt der Wochenschnitt. */
function SchlafDauer({ bericht, grundVersatz }: Props) {
  const reduced = useReducedMotion()
  const naechte = bericht.schlaf.naechte
  const hoechste = Math.max(
    480,
    ...naechte.flatMap((n) => [n.minuten.erijon ?? 0, n.minuten.koray ?? 0])
  )
  const max = Math.ceil(hoechste / 120) * 120
  const OBEN = 10
  const UNTEN = 96

  const y = (minuten: number) => UNTEN - (minuten / max) * (UNTEN - OBEN)
  const spalte = (RECHTS - LINKS) / 7
  const breite = Math.min(9, (spalte - 6) / 2)

  return (
    <figure className="m-0">
      <figcaption className="mb-1 text-[10px] uppercase tracking-wide text-kreide-52">
        dauer je nacht · gestrichelt der schnitt
      </figcaption>
      <svg
        viewBox="0 0 320 118"
        className="w-full"
        role="img"
        aria-label={`schlafdauer je nacht, schnitt erijon ${alsDauer(
          bericht.schlaf.person.erijon.minuten.wert
        )}, koray ${alsDauer(bericht.schlaf.person.koray.minuten.wert)}`}
      >
        {[0, max / 2, max].map((wert) => (
          <g key={wert}>
            <line x1={LINKS} x2={RECHTS} y1={y(wert)} y2={y(wert)} stroke="var(--linie)" strokeWidth={1} />
            <text
              x={LINKS - 6}
              y={y(wert) + 3}
              textAnchor="end"
              className="tnum"
              fill="var(--kreide-52)"
              fontSize={8}
            >
              {wert === 0 ? '0' : `${wert / 60}h`}
            </text>
          </g>
        ))}

        {naechte.map((nacht, index) =>
          USERS.map((person, i) => {
            const minuten = nacht.minuten[person.id]
            if (minuten === null) return null
            const mitte = LINKS + spalte * index + spalte / 2
            const x = mitte - breite - 1 + i * (breite + 2)
            const hoehe = Math.max(1.5, UNTEN - y(minuten))
            return (
              <motion.rect
                key={`${nacht.tag}-${person.id}`}
                x={x}
                width={breite}
                rx={1.5}
                fill={person.farbe}
                initial={reduced ? false : { y: UNTEN, height: 0 }}
                animate={{ y: UNTEN - hoehe, height: hoehe }}
                transition={{
                  duration: BERICHT.balkenDauer,
                  ease: EASE,
                  delay: grundVersatz + index * BERICHT.balkenVersatz + i * 0.03,
                }}
              />
            )
          })
        )}

        {USERS.map((person) => {
          const schnitt = bericht.schlaf.person[person.id].minuten.wert
          if (schnitt === null) return null
          return (
            // die deckkraft und nicht die laenge: motion schreibt fuer
            // `pathLength` ein eigenes `stroke-dasharray` und wischt damit
            // genau den strich weg, der diese linie als schnitt kenntlich macht
            <motion.line
              key={`schnitt-${person.id}`}
              x1={LINKS}
              x2={RECHTS}
              y1={y(schnitt)}
              y2={y(schnitt)}
              stroke={person.farbe}
              strokeWidth={1}
              strokeDasharray="3 3"
              initial={reduced ? false : { opacity: 0 }}
              animate={{ opacity: 0.8 }}
              transition={{ duration: 0.3, ease: EASE, delay: grundVersatz + 0.34 }}
            />
          )
        })}

        {TAGKUERZEL.map((kuerzel, index) => (
          <text
            key={kuerzel}
            x={LINKS + spalte * index + spalte / 2}
            y={UNTEN + 16}
            textAnchor="middle"
            fill="var(--kreide-52)"
            fontSize={8}
          >
            {kuerzel}
          </text>
        ))}
      </svg>
    </figure>
  )
}

/**
 * Der Nachtwert je Nacht, auf einer eigenen, herangezogenen Skala.
 *
 * Von 0 bis 100 gezeichnet waeren alle Naechte ein flaches Band in der oberen
 * Haelfte. Die Skala schnappt deshalb auf Zehnerschritte um die vorhandenen
 * Werte — mit einer Mindestspanne, damit eine ruhige Woche kein Gebirge wird.
 */
function SchlafQualitaet({ bericht, grundVersatz }: Props) {
  const reduced = useReducedMotion()
  const naechte = bericht.schlaf.naechte
  const werte = naechte.flatMap((n) =>
    [n.wert.erijon, n.wert.koray].filter((w): w is number => w !== null)
  )
  if (werte.length === 0) {
    return (
      <p className="border-t border-linie pt-3 text-[11px] text-kreide-52">
        kein nachtwert in dieser woche — der kommt aus der datenbank und fehlt im prototyp.
      </p>
    )
  }

  const OBEN = 10
  const UNTEN = 84
  let min = Math.floor(Math.min(...werte) / 10) * 10
  let max = Math.ceil(Math.max(...werte) / 10) * 10
  if (max - min < 30) {
    const mitte = Math.round((max + min) / 2)
    min = Math.max(0, mitte - 15)
    max = Math.min(100, min + 30)
    min = Math.max(0, max - 30)
  }

  const spalte = (RECHTS - LINKS) / 7
  const x = (index: number) => LINKS + spalte * index + spalte / 2
  const y = (wert: number) => UNTEN - ((wert - min) / (max - min)) * (UNTEN - OBEN)

  const linieVon = (u: UserId) =>
    naechte
      .map((n, i) => ({ n, i }))
      .filter(({ n }) => n.wert[u] !== null)
      .map(({ n, i }) => `${x(i).toFixed(1)},${y(n.wert[u]!).toFixed(1)}`)
      .join(' ')

  return (
    <figure className="m-0">
      <figcaption className="mb-1 text-[10px] uppercase tracking-wide text-kreide-52">
        qualität je nacht · nachtwert
      </figcaption>
      <svg
        viewBox="0 0 320 104"
        className="w-full"
        role="img"
        aria-label={`nachtwert je nacht, schnitt erijon ${
          bericht.schlaf.person.erijon.wert.wert === null
            ? 'ohne wert'
            : Math.round(bericht.schlaf.person.erijon.wert.wert)
        }, koray ${
          bericht.schlaf.person.koray.wert.wert === null
            ? 'ohne wert'
            : Math.round(bericht.schlaf.person.koray.wert.wert)
        }`}
      >
        {[min, (min + max) / 2, max].map((wert) => (
          <g key={wert}>
            <line x1={LINKS} x2={RECHTS} y1={y(wert)} y2={y(wert)} stroke="var(--linie)" strokeWidth={1} />
            <text
              x={LINKS - 6}
              y={y(wert) + 3}
              textAnchor="end"
              className="tnum"
              fill="var(--kreide-52)"
              fontSize={8}
            >
              {Math.round(wert)}
            </text>
          </g>
        ))}

        {USERS.map((person, i) => {
          const punkte = linieVon(person.id)
          if (!punkte.includes(' ')) return null
          return (
            <motion.polyline
              key={person.id}
              points={punkte}
              fill="none"
              stroke={person.farbe}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              initial={reduced ? false : { pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: BERICHT.linieDauer, ease: EASE, delay: grundVersatz + i * 0.08 }}
            />
          )
        })}

        {USERS.map((person, i) =>
          naechte.map((nacht, index) => {
            const wert = nacht.wert[person.id]
            if (wert === null) return null
            return (
              <motion.circle
                key={`${person.id}-${nacht.tag}`}
                cx={x(index)}
                cy={y(wert)}
                r={2.6}
                fill="var(--grund)"
                stroke={person.farbe}
                strokeWidth={1.6}
                initial={reduced ? false : { opacity: 0, scale: 0.4 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{
                  duration: BERICHT.punktDauer,
                  ease: EASE,
                  delay:
                    grundVersatz + BERICHT.linieDauer * 0.55 + index * BERICHT.punktVersatz + i * 0.04,
                }}
              />
            )
          })
        )}

        {TAGKUERZEL.map((kuerzel, index) => (
          <text
            key={kuerzel}
            x={x(index)}
            y={UNTEN + 16}
            textAnchor="middle"
            fill="var(--kreide-52)"
            fontSize={8}
          >
            {kuerzel}
          </text>
        ))}
      </svg>
      <figcaption className="mt-1 text-[10px] text-kreide-52">
        die schnitte stehen oben bei den kennzahlen
      </figcaption>
    </figure>
  )
}
