import { useEffect } from 'react'
import { animate, motion, useMotionValue, useReducedMotion, useTransform } from 'motion/react'
import { EASE } from '../../lib/motion'

type Props = {
  /** 0 bis 1, oder null wenn der wert nicht gemessen wurde */
  anteil: number | null
  farbe: string
  label: string
  groesse?: number
}

const STRICH = 9

/**
 * Fortschrittsring nach dem Vorbild von Sleep Cycle: heller Anfang, satter
 * Schluss, ein leuchtender Kopf an der Spitze.
 *
 * Der Verlauf ist ein echter Winkelverlauf (conic-gradient mit Maske) statt
 * eines SVG-Strichs — nur so laeuft die Farbe der Drehung nach und nicht quer
 * darueber. Die Farbe ist die Identitaetsfarbe der Person, kein eigener
 * Farbraum. Der Kopf glimmt; das ist die einzige Stelle mit einem Schein, und
 * er markiert die Spitze, ist also Inhalt und nicht Schmuck.
 */
export function Ring({ anteil, farbe, label, groesse = 104 }: Props) {
  const reduced = useReducedMotion()
  const ziel = anteil === null ? 0 : Math.min(1, Math.max(0, anteil))

  const mitte = groesse / 2
  const radius = mitte - STRICH / 2
  const maske = `radial-gradient(farthest-side, transparent calc(100% - ${STRICH}px), #000 calc(100% - ${STRICH}px))`

  const hell = `color-mix(in srgb, ${farbe} 26%, var(--grund))`

  const fortschritt = useMotionValue(reduced ? ziel : 0)

  const verlauf = useTransform(fortschritt, (p) => {
    const grad = p * 360
    return `conic-gradient(from -90deg, ${hell} 0deg, ${farbe} ${grad}deg, transparent ${grad}deg)`
  })
  const kopfX = useTransform(fortschritt, (p) => mitte + radius * Math.cos(2 * Math.PI * p - Math.PI / 2))
  const kopfY = useTransform(fortschritt, (p) => mitte + radius * Math.sin(2 * Math.PI * p - Math.PI / 2))
  const prozent = useTransform(fortschritt, (p) => String(Math.round(p * 100)))

  useEffect(() => {
    if (reduced) {
      fortschritt.set(ziel)
      return
    }
    const lauf = animate(fortschritt, ziel, { duration: 1.05, ease: EASE })
    return () => lauf.stop()
  }, [ziel, reduced, fortschritt])

  return (
    <div className="relative shrink-0" style={{ width: groesse, height: groesse }}>
      {/* die spur */}
      <div
        aria-hidden
        className="absolute inset-0 rounded-full"
        style={{ background: 'var(--linie)', maskImage: maske, WebkitMaskImage: maske }}
      />

      {ziel > 0 && (
        <>
          <motion.div
            aria-hidden
            className="absolute inset-0 rounded-full"
            style={{ background: verlauf, maskImage: maske, WebkitMaskImage: maske }}
          />

          {/* der leuchtende kopf laeuft mit */}
          <motion.span
            aria-hidden
            className="absolute rounded-full"
            style={{
              width: STRICH * 2.4,
              height: STRICH * 2.4,
              left: kopfX,
              top: kopfY,
              x: '-50%',
              y: '-50%',
              background: 'var(--kreide)',
              opacity: 0.22,
              filter: 'blur(6px)',
            }}
          />
          <motion.span
            aria-hidden
            className="absolute rounded-full"
            style={{
              width: STRICH,
              height: STRICH,
              left: kopfX,
              top: kopfY,
              x: '-50%',
              y: '-50%',
              background: 'var(--kreide)',
            }}
          />
        </>
      )}

      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        {anteil === null ? (
          <span className="tnum text-[24px] font-bold leading-none text-kreide-52">–</span>
        ) : (
          <span className="tnum flex items-baseline text-[24px] font-bold leading-none text-kreide">
            <motion.span>{prozent}</motion.span>
            <span className="ml-0.5 text-[12px] font-medium text-kreide-52">%</span>
          </span>
        )}
        <span className="mt-1 text-[10px] leading-none text-kreide-52">{label}</span>
      </div>
    </div>
  )
}
