import { useEffect, useMemo, useRef, useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { DIAGRAMM, EASE } from '../lib/motion'
import { daysBetween, fromKey, langesDatum } from '../lib/dates'
import { USERS } from '../lib/types'
import type { Gewichte } from '../lib/types'
import {
  achse as baueAchse,
  fenster as baueFenster,
  formatDelta,
  formatKg,
  reihe as baueReihe,
  teileBeiLuecke,
  xMarken,
} from '../lib/gewicht'
import type { Gewichtsfenster, Gewichtsreihe } from '../lib/gewicht'

const BREITE = 380
const HOEHE = 200
const LINKS = 30
const RECHTS = 10
const OBEN = 12
const UNTEN = 24
const PLOT_BREITE = BREITE - LINKS - RECHTS
const PLOT_HOEHE = HOEHE - OBEN - UNTEN

const FENSTER: { wert: Gewichtsfenster; label: string }[] = [
  { wert: 30, label: '30' },
  { wert: 90, label: '90' },
  { wert: 'alles', label: 'alles' },
]

type Props = {
  gewichte: Gewichte
  heute: string
}

export function Gewichtsdiagramm({ gewichte, heute }: Props) {
  const reduced = useReducedMotion()
  const [gewaehlt, setGewaehlt] = useState<Gewichtsfenster>(30)
  /**
   * die aufbau-animation ist eine einmalige ladezeremonie. ohne diesen merker
   * liefe sie bei jedem umschalten neu, weil sich `d` ändert und die pfade
   * dabei neu aufgebaut werden.
   */
  const ersterAufbau = useRef(true)
  const baut = ersterAufbau.current && !reduced

  const { von, bis, reihen, achse, tage } = useMemo(() => {
    const f = baueFenster(gewichte, heute, gewaehlt)
    const r = USERS.map((u) => baueReihe(gewichte, u.id, f.von, f.bis))
    return {
      von: f.von,
      bis: f.bis,
      reihen: r,
      achse: baueAchse(r),
      tage: Math.max(1, tageZwischen(f.von, f.bis)),
    }
  }, [gewichte, heute, gewaehlt])

  const hatDaten = reihen.some((r) => r.punkte.length > 0)
  useEffect(() => {
    if (hatDaten) ersterAufbau.current = false
  }, [hatDaten])

  const x = (tag: string) => LINKS + (tageZwischen(von, tag) / tage) * PLOT_BREITE
  const y = (wert: number) =>
    OBEN + PLOT_HOEHE - ((wert - achse.min) / (achse.max - achse.min)) * PLOT_HOEHE

  return (
    <motion.section
      aria-labelledby="gewicht-titel"
      initial={reduced ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reduced ? 0 : 0.28, ease: EASE }}
      className="mt-3"
    >
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <h2 id="gewicht-titel" className="sr-only">
            gewichtsverlauf
          </h2>
          {FENSTER.map((f) => (
            <button
              key={f.label}
              type="button"
              aria-pressed={gewaehlt === f.wert}
              onClick={() => setGewaehlt(f.wert)}
              className="text-[12px] transition-colors duration-200"
              style={{ color: gewaehlt === f.wert ? 'var(--kreide)' : 'var(--kreide-52)' }}
            >
              {f.label}
            </button>
          ))}
        </div>
        <p className="text-right text-[11px] text-kreide-52">
          punkte tageswert, linie 7-tage-schnitt
        </p>
      </div>

      <svg
        viewBox={`0 0 ${BREITE} ${HOEHE}`}
        className="block h-auto w-full overflow-visible"
        role="img"
        aria-labelledby="gewicht-titel gewicht-beschreibung"
      >
        <desc id="gewicht-beschreibung">
          veränderung des gewichts im gewählten fenster für erijon und koray, in kilogramm
          gegenüber dem jeweils ersten wert.
        </desc>

        {achse.marken.map((wert) => (
          <g key={wert}>
            <line
              x1={LINKS}
              x2={BREITE - RECHTS}
              y1={y(wert)}
              y2={y(wert)}
              stroke={wert === 0 ? 'var(--linie-hell)' : 'var(--linie)'}
              strokeWidth={wert === 0 ? '1.4' : '1'}
              vectorEffect="non-scaling-stroke"
            />
            <text
              x={LINKS - 6}
              y={y(wert) + 3}
              textAnchor="end"
              fill="var(--kreide-52)"
              fontSize="10"
              className="tnum"
            >
              {formatDelta(wert)}
            </text>
          </g>
        ))}

        {xMarken(von, bis).map((marke) => (
          <text
            key={marke.tag}
            x={x(marke.tag)}
            y={HOEHE - 7}
            textAnchor="middle"
            fill="var(--kreide-52)"
            fontSize="10"
            className="tnum"
          >
            {marke.text}
          </text>
        ))}

        {/* rohpunkte zuerst, damit die trendlinie obenauf liegt */}
        {reihen.flatMap((r) =>
          r.punkte.map((p) => (
            <circle
              key={`${r.user}-roh-${p.tag}`}
              cx={x(p.tag)}
              cy={y(p.kg - r.basis)}
              r="1.6"
              fill={farbe(r)}
              fillOpacity="0.3"
            >
              <title>{`${r.user}, ${p.tag}: ${formatKg(p.kg)} kg`}</title>
            </circle>
          ))
        )}

        {reihen.flatMap((r) =>
          teileBeiLuecke(r.punkte).map((teil, index) => {
            if (teil.length < 2) {
              const punkt = teil[0]!
              return (
                <circle
                  key={`${r.user}-einzel-${punkt.tag}`}
                  cx={x(punkt.tag)}
                  cy={y(punkt.delta)}
                  r="2.4"
                  fill={farbe(r)}
                />
              )
            }
            return (
              <motion.path
                key={`${r.user}-linie-${index}`}
                d={teil.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(p.tag)} ${y(p.delta)}`).join(' ')}
                fill="none"
                stroke={farbe(r)}
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
                initial={baut ? { pathLength: 0, opacity: 0 } : false}
                animate={{ pathLength: 1, opacity: 1 }}
                transition={{ duration: baut ? DIAGRAMM.linienDauer : 0, ease: EASE }}
              />
            )
          })
        )}
      </svg>

      <div className="mt-2 flex flex-col gap-1">
        {reihen.map((r) => {
          const letzterPunkt = r.punkte[r.punkte.length - 1]
          return (
            <div key={r.user} className="flex items-baseline gap-2 text-[12px]">
              <span className="w-14 text-kreide-52">{name(r)}</span>
              {r.letzter ? (
                <>
                  <span className="tnum text-kreide-60">{formatKg(r.letzter.kg)} kg</span>
                  <span className="tnum font-semibold" style={{ color: farbe(r) }}>
                    {formatDelta(letzterPunkt?.delta ?? 0)}
                  </span>
                </>
              ) : (
                <span className="text-kreide-52">noch nichts gewogen</span>
              )}
            </div>
          )
        })}
      </div>

      {/* eine tabelle mit bis zu neunzig spalten liest niemand vor */}
      <div className="sr-only">
        {reihen.map((r) => (
          <p key={r.user}>
            {r.letzter
              ? `${name(r)}: ${r.punkte.length} einträge, zuletzt ${formatKg(r.letzter.kg)} kilogramm am ${langesDatum(fromKey(r.letzter.tag))}, trend ${formatDelta(r.punkte[r.punkte.length - 1]?.delta ?? 0)} kilogramm im gewählten fenster.`
              : `${name(r)}: keine einträge im gewählten fenster.`}
          </p>
        ))}
      </div>
    </motion.section>
  )
}

function farbe(r: Gewichtsreihe): string {
  return USERS.find((u) => u.id === r.user)!.farbe
}

function name(r: Gewichtsreihe): string {
  return USERS.find((u) => u.id === r.user)!.name
}

function tageZwischen(von: string, bis: string): number {
  return daysBetween(fromKey(von), fromKey(bis))
}
