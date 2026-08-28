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
 * kappe und kopf sind einen pixel schmaler als der strich. die maske laesst den
 * reif an beiden kanten je eine halbe pixelbreite auslaufen; eine scheibe in
 * voller strichbreite stuende also oben und unten je einen halben pixel ueber —
 * das ist die kleine delle am ringanfang.
 */
const SCHEIBE = STRICH - 1
/** wo die funken auf dem bogen sitzen, als anteil der gezogenen strecke */
const FUNKEN = [0.21, 0.44, 0.62, 0.83]

/**
 * Fortschrittsring nach dem Vorbild von Sleep Cycle: heller Anfang, satter
 * Schluss, ein leuchtender Kopf an der Spitze.
 *
 * Der Verlauf ist ein echter Winkelverlauf (conic-gradient mit Maske) statt
 * eines SVG-Strichs — nur so laeuft die Farbe der Drehung nach und nicht quer
 * darueber. Die Farbe ist die Identitaetsfarbe der Person, kein eigener
 * Farbraum. Der Ring ist die einzige Stelle in der App mit einem Schein: der
 * Kopf glimmt, ueber den fertigen Bogen wandert ein Glanz, und auf ihm funkelt
 * es. Beides markiert die gemessene Strecke, ist also Inhalt und nicht Schmuck.
 */
export function Ring({ anteil, farbe, label, groesse = 104 }: Props) {
  const reduced = useReducedMotion()
  const ziel = anteil === null ? 0 : Math.min(1, Math.max(0, anteil))

  const mitte = groesse / 2
  const radius = mitte - STRICH / 2
  /** die funken sitzen knapp ausserhalb des reifs — auf dem strich lesen sie sich als schmutz */
  const funkeRadius = mitte + 1.5
  const zielGrad = ziel * 360

  /**
   * die maske schneidet den reif aus der flaeche. beide kanten laufen ueber eine
   * halbe pixelbreite aus, sonst treppt der rand sichtbar.
   */
  const maske =
    `radial-gradient(farthest-side, transparent calc(100% - ${STRICH}px - 0.5px), ` +
    `#000 calc(100% - ${STRICH}px + 0.5px), #000 calc(100% - 0.5px), transparent 100%)`

  /** der anfang wird kreidig aufgehellt, nicht in den grund gemischt — sonst verschwindet er */
  const hell = `color-mix(in srgb, ${farbe} 62%, var(--kreide))`
  /**
   * alles leuchtende traegt die identitaetsfarbe und liegt additiv auf (screen).
   * kreide-graues ueber dem ring liest sich sonst als schmutz, nicht als licht.
   */
  const kopfKern = `color-mix(in srgb, ${farbe} 25%, var(--kreide))`
  const glanzFarbe = `color-mix(in srgb, ${farbe} 72%, var(--kreide))`
  const bloom = farbe
  const bloomRand = `color-mix(in srgb, ${farbe} 45%, transparent)`
  const funkeFarbe = `color-mix(in srgb, ${farbe} 55%, var(--kreide))`

  const fortschritt = useMotionValue(reduced ? ziel : 0)
  const glanz = useMotionValue(0)

  /**
   * conic-gradient faengt von haus aus oben an und laeuft im uhrzeigersinn. ein
   * `from -90deg` waere der winkel aus der trigonometrie und wuerde den ganzen
   * bogen eine vierteldrehung nach links kippen — dann steht die luecke links,
   * waehrend der kopf oben leuchtet.
   */
  const verlauf = useTransform(fortschritt, (p) => {
    const grad = p * 360
    return `conic-gradient(${hell} 0deg, ${farbe} ${grad}deg, transparent ${grad + 0.5}deg)`
  })

  /** ein schmales lichtband wandert in ruhe einmal ueber den fertigen bogen */
  const glanzVerlauf = useTransform(glanz, (g) => {
    const breit = 24
    const kopf = Math.min(zielGrad, Math.max(0, g * (zielGrad + 2 * breit) - breit))
    const von = Math.max(0, kopf - breit)
    const bis = Math.min(zielGrad, kopf + breit)
    return (
      `conic-gradient(transparent ${von}deg, ` +
      `color-mix(in srgb, ${glanzFarbe} 60%, transparent) ${kopf}deg, transparent ${bis}deg)`
    )
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
    const band = animate(glanz, [0, 1], {
      duration: 1.9,
      ease: 'easeInOut',
      repeat: Infinity,
      repeatDelay: 3.6,
      delay: 1.25,
    })
    return () => {
      lauf.stop()
      band.stop()
    }
  }, [ziel, reduced, fortschritt, glanz])

  const funkeln = !reduced && ziel > 0.12

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

          {/* runde kappe am anfang, damit der bogen nicht abgehackt beginnt */}
          <span
            aria-hidden
            className="absolute rounded-full"
            style={{
              width: SCHEIBE,
              height: SCHEIBE,
              left: mitte,
              top: STRICH / 2,
              transform: 'translate(-50%, -50%)',
              background: hell,
            }}
          />

          {!reduced && (
            <motion.div
              aria-hidden
              className="absolute inset-0 rounded-full"
              style={{
                background: glanzVerlauf,
                maskImage: maske,
                WebkitMaskImage: maske,
                mixBlendMode: 'screen',
                opacity: 0.55,
              }}
            />
          )}

          {funkeln &&
            FUNKEN.map((f, i) => {
              const w = 2 * Math.PI * ziel * f - Math.PI / 2
              const gr = 6 + (i % 2) * 3
              return (
                <motion.svg
                  key={f}
                  aria-hidden
                  viewBox="0 0 24 24"
                  className="absolute"
                  style={{
                    width: gr,
                    height: gr,
                    left: mitte + funkeRadius * Math.cos(w),
                    top: mitte + funkeRadius * Math.sin(w),
                    x: '-50%',
                    y: '-50%',
                    color: funkeFarbe,
                    mixBlendMode: 'screen',
                  }}
                  initial={{ opacity: 0, scale: 0.3 }}
                  animate={{ opacity: [0, 0.85, 0], scale: [0.3, 1, 0.3], rotate: [0, 40, 70] }}
                  transition={{
                    duration: 1.5,
                    times: [0, 0.42, 1],
                    ease: 'easeInOut',
                    repeat: Infinity,
                    repeatDelay: 2.4 + i * 0.9,
                    delay: 1.05 + i * 0.55,
                  }}
                >
                  <path d="M12 1.5Q13 11 22.5 12Q13 13 12 22.5Q11 13 1.5 12Q11 11 12 1.5Z" fill="currentColor" />
                </motion.svg>
              )
            })}

          {/* der kopf laeuft mit: ein warmer schein, der atmet, und ein heller kern */}
          <motion.span
            aria-hidden
            className="absolute rounded-full"
            style={{
              width: STRICH * 1.9,
              height: STRICH * 1.9,
              left: kopfX,
              top: kopfY,
              x: '-50%',
              y: '-50%',
              background: `radial-gradient(circle, ${bloom} 0%, ${bloomRand} 42%, transparent 74%)`,
              mixBlendMode: 'screen',
            }}
            animate={reduced ? { opacity: 0.7 } : { opacity: [0.6, 0.92, 0.6] }}
            transition={reduced ? undefined : { duration: 2.8, repeat: Infinity, ease: 'easeInOut' }}
          />
          <motion.span
            aria-hidden
            className="absolute rounded-full"
            style={{
              width: SCHEIBE,
              height: SCHEIBE,
              left: kopfX,
              top: kopfY,
              x: '-50%',
              y: '-50%',
              background: kopfKern,
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
