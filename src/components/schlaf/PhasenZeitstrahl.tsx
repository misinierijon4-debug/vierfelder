import { motion } from 'motion/react'
import type { NachtPhasenAnalyse } from '../../lib/schlafPhasen'
import { formatDauer } from '../../lib/schlafPhasen'

type Props = {
  analyse: NachtPhasenAnalyse
}

export function PhasenZeitstrahl({ analyse }: Props) {
  const {
    tiefMinuten,
    remMinuten,
    coreMinuten,
    wachMinuten,
    tiefProzent,
    remProzent,
    coreProzent,
    wachphasenAnzahl,
    inBedMinuten,
  } = analyse

  // Anteile an der Gesamtzeit im Bett
  const tiefAnteil = inBedMinuten > 0 ? (tiefMinuten / inBedMinuten) * 100 : 20
  const remAnteil = inBedMinuten > 0 ? (remMinuten / inBedMinuten) * 100 : 25
  const coreAnteil = inBedMinuten > 0 ? (coreMinuten / inBedMinuten) * 100 : 45
  const wachAnteil = inBedMinuten > 0 ? (wachMinuten / inBedMinuten) * 100 : 10

  return (
    <div className="mt-4 rounded-[2px] border border-linie bg-flaeche p-3.5">
      {/* Header */}
      <div className="mb-2.5 flex items-baseline justify-between text-[11px]">
        <span className="font-medium text-kreide">schlafphasen</span>
        <span className="tnum text-kreide-52">
          {analyse.einschlafUhrzeit} → {analyse.aufwachUhrzeit}
        </span>
      </div>

      {/* Proportionaler Phasenbalken ohne Lücken */}
      <div className="relative flex h-5 w-full overflow-hidden rounded-[2px] bg-grund">
        <motion.div
          initial={{ scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{ duration: 0.3 }}
          title={`Tiefschlaf: ${formatDauer(tiefMinuten)} (${tiefProzent}%)`}
          className="h-full origin-left border-r border-grund/50"
          style={{ width: `${tiefAnteil}%`, backgroundColor: '#3B82F6' }}
        />
        <motion.div
          initial={{ scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{ duration: 0.3, delay: 0.05 }}
          title={`Traumschlaf (REM): ${formatDauer(remMinuten)} (${remProzent}%)`}
          className="h-full origin-left border-r border-grund/50"
          style={{ width: `${remAnteil}%`, backgroundColor: '#A855F7' }}
        />
        <motion.div
          initial={{ scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{ duration: 0.3, delay: 0.1 }}
          title={`Kernschlaf: ${formatDauer(coreMinuten)} (${coreProzent}%)`}
          className="h-full origin-left border-r border-grund/50"
          style={{ width: `${coreAnteil}%`, backgroundColor: '#38BDF8' }}
        />
        <motion.div
          initial={{ scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{ duration: 0.3, delay: 0.15 }}
          title={`Wach: ${formatDauer(wachMinuten)}`}
          className="h-full origin-left"
          style={{ width: `${wachAnteil}%`, backgroundColor: '#F97316' }}
        />
      </div>

      {/* 4 saubere Phasen-Karten */}
      <div className="mt-3.5 grid grid-cols-2 gap-2 text-[11px]">
        <div className="flex items-center justify-between rounded-[2px] bg-grund/60 px-2.5 py-2">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 flex-shrink-0 rounded-[1px]" style={{ backgroundColor: '#3B82F6' }} />
            <span className="text-kreide-52">tiefschlaf</span>
          </div>
          <div className="text-right">
            <span className="tnum font-semibold text-kreide">{formatDauer(tiefMinuten)}</span>
            <span className="ml-1 text-[10px] text-kreide-52">({tiefProzent}%)</span>
          </div>
        </div>

        <div className="flex items-center justify-between rounded-[2px] bg-grund/60 px-2.5 py-2">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 flex-shrink-0 rounded-[1px]" style={{ backgroundColor: '#A855F7' }} />
            <span className="text-kreide-52">traum (rem)</span>
          </div>
          <div className="text-right">
            <span className="tnum font-semibold text-kreide">{formatDauer(remMinuten)}</span>
            <span className="ml-1 text-[10px] text-kreide-52">({remProzent}%)</span>
          </div>
        </div>

        <div className="flex items-center justify-between rounded-[2px] bg-grund/60 px-2.5 py-2">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 flex-shrink-0 rounded-[1px]" style={{ backgroundColor: '#38BDF8' }} />
            <span className="text-kreide-52">kernschlaf</span>
          </div>
          <div className="text-right">
            <span className="tnum font-semibold text-kreide">{formatDauer(coreMinuten)}</span>
            <span className="ml-1 text-[10px] text-kreide-52">({coreProzent}%)</span>
          </div>
        </div>

        <div className="flex items-center justify-between rounded-[2px] bg-grund/60 px-2.5 py-2">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 flex-shrink-0 rounded-[1px]" style={{ backgroundColor: '#F97316' }} />
            <span className="text-kreide-52">wachzeit</span>
          </div>
          <div className="text-right">
            <span className="tnum font-semibold text-kreide">{formatDauer(wachMinuten)}</span>
            {wachphasenAnzahl > 0 && (
              <span className="ml-1 text-[10px] text-kreide-52">({wachphasenAnzahl}×)</span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
