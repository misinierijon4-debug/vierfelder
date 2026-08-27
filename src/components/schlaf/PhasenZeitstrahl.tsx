import { motion } from 'motion/react'
import type { NachtPhasenAnalyse } from '../../lib/schlafPhasen'
import { formatDauer } from '../../lib/schlafPhasen'

type Props = {
  analyse: NachtPhasenAnalyse
}

const PHASEN = [
  { key: 'tief', label: 'tiefschlaf', color: '#3B82F6' },
  { key: 'rem', label: 'rem', color: '#A855F7' },
  { key: 'core', label: 'kernschlaf', color: '#38BDF8' },
  { key: 'wach', label: 'wach', color: '#F97316' },
] as const

export function PhasenZeitstrahl({ analyse }: Props) {
  if (!analyse.hatPhasenDaten) {
    return (
      <div className="mt-4 border-y border-linie py-4">
        <p className="text-[11px] font-medium text-kreide">keine Schlafphasen erfasst</p>
        <p className="mt-1 text-pretty text-[10px] text-kreide-52">
          Health hat für diese Nacht nur die Schlafdauer geliefert.
        </p>
      </div>
    )
  }

  const werte = {
    tief: { minuten: analyse.tiefMinuten, prozent: analyse.tiefProzent },
    rem: { minuten: analyse.remMinuten, prozent: analyse.remProzent },
    core: { minuten: analyse.coreMinuten, prozent: analyse.coreProzent },
    wach: { minuten: analyse.wachMinuten, prozent: analyse.wachProzent },
  }
  const gesamt = Math.max(
    1,
    analyse.tiefMinuten + analyse.remMinuten + analyse.coreMinuten + analyse.wachMinuten
  )

  return (
    <div className="mt-4 overflow-hidden rounded-[2px] border border-linie bg-flaeche">
      <div className="flex items-baseline justify-between gap-3 px-3.5 py-3">
        <span className="text-[11px] font-medium text-kreide">phasenverteilung</span>
        <span className="tnum shrink-0 text-[10px] text-kreide-52">
          {analyse.einschlafUhrzeit} – {analyse.aufwachUhrzeit}
        </span>
      </div>

      <div className="mx-3.5 flex h-3 overflow-hidden rounded-[1px] bg-grund" aria-label="Verteilung der Schlafphasen">
        {PHASEN.map((phase) => {
          const wert = werte[phase.key]
          if (wert.minuten <= 0) return null
          return (
            <motion.span
              key={phase.key}
              initial={{ scaleX: 0 }}
              animate={{ scaleX: 1 }}
              transition={{ duration: 0.18 }}
              title={`${phase.label}: ${formatDauer(wert.minuten)} (${wert.prozent}%)`}
              className="block h-full origin-left border-r border-grund/70 last:border-r-0"
              style={{ width: `${(wert.minuten / gesamt) * 100}%`, backgroundColor: phase.color }}
            />
          )
        })}
      </div>

      <dl className="mt-3.5 grid grid-cols-2 border-t border-linie">
        {PHASEN.map((phase, index) => {
          const wert = werte[phase.key]
          return (
            <div
              key={phase.key}
              className={`min-w-0 px-3 py-2.5 ${index % 2 === 1 ? 'border-l border-linie' : ''} ${index >= 2 ? 'border-t border-linie' : ''}`}
            >
              <dt className="flex items-center gap-1.5 text-[10px] text-kreide-52">
                <span className="size-2 rounded-[1px]" style={{ backgroundColor: phase.color }} />
                <span className="truncate">{phase.label}</span>
              </dt>
              <dd className="mt-1 flex items-baseline justify-between gap-2">
                <span className="tnum truncate text-[14px] font-semibold text-kreide">
                  {formatDauer(wert.minuten)}
                </span>
                <span className="tnum shrink-0 text-[10px] text-kreide-52">
                  {phase.key === 'wach' && analyse.wachphasenAnzahl > 0
                    ? `${analyse.wachphasenAnzahl}×`
                    : `${wert.prozent}%`}
                </span>
              </dd>
            </div>
          )
        })}
      </dl>
    </div>
  )
}
