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
  const { phasen, einschlafzeit, aufwachzeit, tiefMinuten, remMinuten, coreMinuten, wachMinuten } = analyse
  const startMs = Date.parse(einschlafzeit)
  const endMs = Date.parse(aufwachzeit)
  const gesamtMs = Math.max(1, endMs - startMs)

  // Wenn keine einzelnen Segmente vorliegen, erzeugen wir synoptische Blöcke
  let segs: PhasenSegment[] = phasen
  if (segs.length === 0 && analyse.schlafMinuten > 0) {
    let cur = startMs
    const pushSeg = (art: 'deep' | 'rem' | 'core' | 'awake', min: number) => {
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
    pushSeg('deep', tiefMinuten)
    pushSeg('core', Math.round(coreMinuten * 0.5))
    pushSeg('rem', remMinuten)
    if (wachMinuten > 0) pushSeg('awake', wachMinuten)
    pushSeg('core', Math.round(coreMinuten * 0.5))
  }

  return (
    <div className="mt-4 rounded-[2px] border border-linie bg-flaeche p-3">
      <div className="mb-2 flex items-baseline justify-between text-[11px] text-kreide-52">
        <span>schlafphasen-verlauf</span>
        <span className="tnum font-medium text-kreide">
          {analyse.einschlafUhrzeit} → {analyse.aufwachUhrzeit}
        </span>
      </div>

      {/* Zeitstrahl-Balken */}
      <div className="relative h-6 w-full overflow-hidden rounded-[2px] bg-grund flex">
        {segs.map((seg, idx) => {
          const anteil = ((seg.endMs - seg.startMs) / gesamtMs) * 100
          if (anteil <= 0) return null
          return (
            <motion.div
              key={idx}
              initial={{ scaleY: 0, opacity: 0 }}
              animate={{ scaleY: 1, opacity: 1 }}
              transition={{ duration: 0.25, delay: idx * 0.015 }}
              title={`${PHASEN_NAMEN[seg.art]}: ${formatDauer(seg.dauerMinuten)}`}
              className="h-full flex-shrink-0"
              style={{
                width: `${anteil}%`,
                backgroundColor: FARBEN[seg.art] ?? FARBEN.core,
                borderRight: '1px solid rgba(20, 23, 28, 0.4)',
              }}
            />
          )
        })}
      </div>

      {/* Legende mit echten Minuten */}
      <div className="mt-3 grid grid-cols-2 gap-2 pt-2 border-t border-linie/50 sm:grid-cols-4">
        <div className="flex items-center gap-1.5 text-[11px]">
          <span className="h-2.5 w-2.5 rounded-[1px]" style={{ backgroundColor: FARBEN.deep }} />
          <span className="text-kreide-52">tief:</span>
          <span className="tnum font-medium text-kreide">{formatDauer(tiefMinuten)}</span>
        </div>
        <div className="flex items-center gap-1.5 text-[11px]">
          <span className="h-2.5 w-2.5 rounded-[1px]" style={{ backgroundColor: FARBEN.rem }} />
          <span className="text-kreide-52">rem:</span>
          <span className="tnum font-medium text-kreide">{formatDauer(remMinuten)}</span>
        </div>
        <div className="flex items-center gap-1.5 text-[11px]">
          <span className="h-2.5 w-2.5 rounded-[1px]" style={{ backgroundColor: FARBEN.core }} />
          <span className="text-kreide-52">kern:</span>
          <span className="tnum font-medium text-kreide">{formatDauer(coreMinuten)}</span>
        </div>
        <div className="flex items-center gap-1.5 text-[11px]">
          <span className="h-2.5 w-2.5 rounded-[1px]" style={{ backgroundColor: FARBEN.awake }} />
          <span className="text-kreide-52">wach:</span>
          <span className="tnum font-medium text-kreide">{formatDauer(wachMinuten)}</span>
        </div>
      </div>
    </div>
  )
}
