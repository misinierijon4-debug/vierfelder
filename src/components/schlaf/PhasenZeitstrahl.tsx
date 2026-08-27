import { motion, useReducedMotion } from 'motion/react'
import type { NachtPhasenAnalyse } from '../../lib/schlafPhasen'
import { formatDauer, position, stundenmarken } from '../../lib/schlafPhasen'
import { EASE } from '../../lib/motion'
import type { PhasenArt } from '../../lib/types'

type Props = {
  analyse: NachtPhasenAnalyse
}

/**
 * Die vier Phasenfarben gehoeren keiner Person, sie sind eine Legende. Sie
 * stehen nur hier im Nachtdetail; das Wochenraster bleibt zweifarbig.
 */
const FARBE: Record<PhasenArt, string> = {
  tief: 'var(--phase-tief)',
  rem: 'var(--phase-rem)',
  kern: 'var(--phase-kern)',
  unspez: 'var(--phase-kern)',
  wach: 'var(--phase-wach)',
}

export function PhasenZeitstrahl({ analyse }: Props) {
  const reduced = useReducedMotion()

  if (!analyse.hatPhasenDaten) {
    return (
      <div className="mt-4 border-y border-linie py-4">
        <p className="text-[11px] font-medium text-kreide">keine schlafphasen erfasst</p>
        <p className="mt-1 text-pretty text-[10px] text-kreide-52">
          health hat für diese nacht nur die schlafdauer geliefert.
        </p>
      </div>
    )
  }

  // die achse gehört dieser einen nacht, damit die auflösung so fein wie möglich bleibt
  const von = Math.floor(Math.min(analyse.einschlafMinute, analyse.bettVon ?? Infinity) / 30) * 30
  const bis = Math.ceil(Math.max(analyse.aufwachMinute, analyse.bettBis ?? 0) / 30) * 30
  const marken = stundenmarken(von, bis, 60)

  const kacheln = [
    { key: 'tief' as const, label: 'tiefschlaf', minuten: analyse.tiefMinuten, prozent: analyse.tiefProzent },
    { key: 'rem' as const, label: 'rem', minuten: analyse.remMinuten, prozent: analyse.remProzent },
    { key: 'kern' as const, label: 'kernschlaf', minuten: analyse.coreMinuten, prozent: analyse.coreProzent },
    { key: 'wach' as const, label: 'wach', minuten: analyse.wachMinuten, prozent: analyse.wachProzent },
  ]

  return (
    <div className="mt-4 overflow-hidden rounded-[2px] border border-linie bg-flaeche">
      <div className="flex items-baseline justify-between gap-3 px-3.5 py-3">
        <span className="text-[11px] font-medium text-kreide">verlauf der nacht</span>
        <span className="tnum shrink-0 text-[10px] text-kreide-52">
          {analyse.einschlafUhrzeit} – {analyse.aufwachUhrzeit}
        </span>
      </div>

      {/* echter zeitverlauf: die breite ist die uhr, nicht der anteil */}
      <div
        className="relative mx-3.5 h-7 overflow-hidden rounded-[1px] bg-grund"
        role="img"
        aria-label={`schlafverlauf von ${analyse.einschlafUhrzeit} bis ${analyse.aufwachUhrzeit}`}
      >
        <motion.div
          className="absolute inset-0"
          initial={reduced ? false : { clipPath: 'inset(0 100% 0 0)' }}
          animate={{ clipPath: 'inset(0 0% 0 0)' }}
          transition={{ duration: reduced ? 0 : 0.45, ease: EASE }}
        >
          {analyse.stuecke.map((p) => {
            const start = analyse.einschlafMinute + p.start
            return (
              <span
                key={`${p.art}-${p.start}`}
                className="absolute top-0 bottom-0 block"
                style={{
                  left: `${position(start, von, bis) * 100}%`,
                  width: `${(p.dauer / (bis - von)) * 100}%`,
                  background: FARBE[p.art],
                }}
              />
            )
          })}
        </motion.div>

        {/* die stundenmarken liegen über den phasen, sonst sieht man sie gar nicht */}
        {marken.map((m) => (
          <span
            key={m}
            aria-hidden
            className="absolute top-0 bottom-0 w-px bg-grund opacity-70"
            style={{ left: `${position(m, von, bis) * 100}%` }}
          />
        ))}
      </div>

      <p className="mx-3.5 mt-1.5 text-[10px] text-kreide-52">
        von links nach rechts durch die nacht · raster: eine stunde
      </p>

      <dl className="mt-3 grid grid-cols-2 border-t border-linie">
        {kacheln.map((kachel, index) => (
          <div
            key={kachel.key}
            className={`min-w-0 px-3 py-2.5 ${index % 2 === 1 ? 'border-l border-linie' : ''} ${
              index >= 2 ? 'border-t border-linie' : ''
            }`}
          >
            <dt className="flex items-center gap-1.5 text-[10px] text-kreide-52">
              <span
                className="size-2 shrink-0 rounded-[1px]"
                style={{ background: FARBE[kachel.key] }}
              />
              <span className="truncate">{kachel.label}</span>
            </dt>
            <dd className="mt-1 flex items-baseline justify-between gap-2">
              <span className="tnum truncate text-[14px] font-semibold text-kreide">
                {formatDauer(kachel.minuten)}
              </span>
              <span className="tnum shrink-0 text-[10px] text-kreide-52">
                {kachel.key === 'wach' && analyse.wachphasenAnzahl > 0
                  ? `${analyse.wachphasenAnzahl}×`
                  : `${kachel.prozent}%`}
              </span>
            </dd>
          </div>
        ))}
      </dl>
    </div>
  )
}
