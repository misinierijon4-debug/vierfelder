import { motion } from 'motion/react'
import type { NachtPhasenAnalyse, PhasenSegment } from '../../lib/schlafPhasen'
import { formatDauer } from '../../lib/schlafPhasen'

type Props = {
  analyse: NachtPhasenAnalyse
}

const FARBEN: Record<string, string> = {
  deep: '#3B82F6', // Sattes Blau für Tiefschlaf
  rem: '#A855F7',  // Violett für Traumschlaf
  core: '#38BDF8', // Klares Hellblau für Kernschlaf
  awake: '#F97316',// Kräftiges Orange für Wach
}

const PHASEN_NAMEN: Record<string, string> = {
  deep: 'tief',
  rem: 'rem',
  core: 'kern',
  awake: 'wach',
}

export function PhasenZeitstrahl({ analyse }: Props) {
  const { phasen, einschlafUhrzeit, aufwachUhrzeit, tiefMinuten, remMinuten, coreMinuten, wachMinuten } = analyse

  // Wenn keine einzelnen Segmente vorliegen, bauen wir eine synoptische Sequenz
  let segs: PhasenSegment[] = phasen
  if (segs.length === 0 && analyse.schlafMinuten > 0) {
    segs = []
    let cur = Date.parse(analyse.einschlafzeit)
    const addSeg = (art: 'deep' | 'rem' | 'core' | 'awake', min: number) => {
      if (min <= 0) return
      const next = cur + min * 60000
      segs.push({
        art,
        start: new Date(cur).toISOString(),
        end: new Date(next).toISOString(),
        startMs: cur,
        endMs: next,
        dauerMinuten: min,
      })
      cur = next
    }
    // Typischer Schlafzyklus-Ablauf: Einschlafen -> Deep -> Core -> REM -> Core -> REM -> Wach -> Aufwachen
    addSeg('deep', tiefMinuten)
    addSeg('core', Math.round(coreMinuten * 0.45))
    addSeg('rem', Math.round(remMinuten * 0.5))
    if (wachMinuten > 0) addSeg('awake', wachMinuten)
    addSeg('core', Math.round(coreMinuten * 0.55))
    addSeg('rem', Math.round(remMinuten * 0.5))
  }

  // Gesamtdauer der Segmente
  const summeMinuten = Math.max(1, segs.reduce((acc, s) => acc + s.dauerMinuten, 0))

  return (
    <div className="mt-4 rounded-[2px] border border-linie bg-flaeche p-3">
      {/* Header mit Uhrzeiten */}
      <div className="mb-2.5 flex items-baseline justify-between text-[11px] text-kreide-52">
        <span>schlafphasen-verlauf</span>
        <span className="tnum font-medium text-kreide">
          {einschlafUhrzeit} → {aufwachUhrzeit}
        </span>
      </div>

      {/* Durchgehender Zeitstrahl-Balken ohne Lücken */}
      <div className="relative flex h-7 w-full overflow-hidden rounded-[2px] bg-grund">
        {segs.map((seg, idx) => {
          const anteil = (seg.dauerMinuten / summeMinuten) * 100
          if (anteil <= 0) return null
          return (
            <motion.div
              key={idx}
              initial={{ scaleY: 0, opacity: 0 }}
              animate={{ scaleY: 1, opacity: 1 }}
              transition={{ duration: 0.2, delay: idx * 0.01 }}
              title={`${PHASEN_NAMEN[seg.art]}: ${formatDauer(seg.dauerMinuten)}`}
              className="h-full"
              style={{
                width: `${anteil}%`,
                backgroundColor: FARBEN[seg.art] ?? FARBEN.core,
                borderRight: '1px solid rgba(20, 23, 28, 0.5)',
              }}
            />
          )
        })}
      </div>

      {/* Legende mit echten Minuten - ohne unschöne Zeilenumbrüche */}
      <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 border-t border-linie/50 pt-2.5 sm:grid-cols-4">
        <div className="flex items-center gap-1.5 text-[11px] whitespace-nowrap">
          <span className="h-2.5 w-2.5 flex-shrink-0 rounded-[1px]" style={{ backgroundColor: FARBEN.deep }} />
          <span className="text-kreide-52">tief:</span>
          <span className="tnum font-semibold text-kreide">{formatDauer(tiefMinuten)}</span>
        </div>
        <div className="flex items-center gap-1.5 text-[11px] whitespace-nowrap">
          <span className="h-2.5 w-2.5 flex-shrink-0 rounded-[1px]" style={{ backgroundColor: FARBEN.rem }} />
          <span className="text-kreide-52">rem:</span>
          <span className="tnum font-semibold text-kreide">{formatDauer(remMinuten)}</span>
        </div>
        <div className="flex items-center gap-1.5 text-[11px] whitespace-nowrap">
          <span className="h-2.5 w-2.5 flex-shrink-0 rounded-[1px]" style={{ backgroundColor: FARBEN.core }} />
          <span className="text-kreide-52">kern:</span>
          <span className="tnum font-semibold text-kreide">{formatDauer(coreMinuten)}</span>
        </div>
        <div className="flex items-center gap-1.5 text-[11px] whitespace-nowrap">
          <span className="h-2.5 w-2.5 flex-shrink-0 rounded-[1px]" style={{ backgroundColor: FARBEN.awake }} />
          <span className="text-kreide-52">wach:</span>
          <span className="tnum font-semibold text-kreide">{formatDauer(wachMinuten)}</span>
        </div>
      </div>
    </div>
  )
}
