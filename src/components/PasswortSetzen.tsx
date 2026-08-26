import { useState } from 'react'
import type { FormEvent } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { abmelden, passwortSetzen } from '../lib/supabase'
import { EASE, EINGANG } from '../lib/motion'

const MINDESTLAENGE = 8

/**
 * kommt nach dem ersten login mit dem startpasswort. bis das eigene passwort
 * steht, gibt es die app nicht zu sehen.
 */
export function PasswortSetzen({ email }: { email: string }) {
  const [neu, setNeu] = useState('')
  const [wiederholung, setWiederholung] = useState('')
  const [laeuft, setLaeuft] = useState(false)
  const [fehler, setFehler] = useState<string | null>(null)
  const reduced = useReducedMotion()

  const absenden = async (e: FormEvent) => {
    e.preventDefault()
    if (laeuft) return
    if (neu.length < MINDESTLAENGE) {
      setFehler(`mindestens ${MINDESTLAENGE} zeichen.`)
      return
    }
    if (neu !== wiederholung) {
      setFehler('die beiden eingaben sind nicht gleich.')
      return
    }
    setLaeuft(true)
    setFehler(await passwortSetzen(neu))
    setLaeuft(false)
  }

  const eingang = (i: number) => ({
    initial: reduced ? false : { opacity: 0, y: EINGANG.weg },
    animate: { opacity: 1, y: 0 },
    transition: {
      duration: reduced ? 0 : EINGANG.dauer,
      ease: EASE,
      delay: reduced ? 0 : i * EINGANG.versatz,
    },
  })

  return (
    <div className="flex min-h-[100dvh] items-center bg-grund">
      <main className="mx-auto w-full max-w-[420px] px-5 pb-16">
        <motion.div {...eingang(0)}>
          <h1 className="display text-[16px] font-bold lowercase leading-none">
            passwort festlegen
          </h1>
          <p className="mt-1.5 text-[12px] text-kreide-52">
            das startpasswort kennt noch jemand anderes. setz dein eigenes, dann ist es weg.
          </p>
          <p className="mt-1 text-[11px] text-kreide-52">{email}</p>
        </motion.div>

        <form onSubmit={absenden} className="mt-8">
          <motion.div {...eingang(1)}>
            <Feld
              id="neu"
              label="neues passwort"
              value={neu}
              onChange={(v) => {
                setNeu(v)
                setFehler(null)
              }}
            />
          </motion.div>

          <motion.div {...eingang(2)} className="mt-4">
            <Feld
              id="wiederholung"
              label="nochmal"
              value={wiederholung}
              onChange={(v) => {
                setWiederholung(v)
                setFehler(null)
              }}
            />
          </motion.div>

          <motion.div {...eingang(3)} className="mt-6">
            <motion.button
              type="submit"
              disabled={laeuft || !neu || !wiederholung}
              whileTap={reduced || laeuft ? undefined : { scale: 0.99 }}
              transition={{ duration: 0.09, ease: EASE }}
              className="display h-12 w-full rounded-[2px] bg-kreide text-[15px] font-semibold lowercase text-grund transition-opacity duration-150 disabled:opacity-35"
            >
              {laeuft ? 'wird gespeichert' : 'passwort festlegen'}
            </motion.button>
          </motion.div>

          <div className="mt-3 flex h-5 items-start">
            <AnimatePresence mode="wait" initial={false}>
              {fehler && (
                <motion.p
                  key={fehler}
                  role="alert"
                  initial={reduced ? false : { opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.14 }}
                  className="text-[12px]"
                  style={{ color: 'var(--erijon)' }}
                >
                  {fehler}
                </motion.p>
              )}
            </AnimatePresence>
          </div>
        </form>

        <motion.button
          {...eingang(4)}
          type="button"
          onClick={() => abmelden()}
          className="mt-8 text-[11px] text-kreide-52 underline decoration-linie-hell underline-offset-4"
        >
          abmelden
        </motion.button>
      </main>
    </div>
  )
}

function Feld({
  id,
  label,
  value,
  onChange,
}: {
  id: string
  label: string
  value: string
  onChange: (v: string) => void
}) {
  return (
    <label htmlFor={id} className="block">
      <span className="text-[12px] text-kreide-52">{label}</span>
      <input
        id={id}
        type="password"
        autoComplete="new-password"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1.5 h-12 w-full rounded-[2px] border border-linie-hell bg-transparent px-3 text-[15px] text-kreide outline-none transition-colors duration-150 focus:border-kreide-52"
      />
    </label>
  )
}
