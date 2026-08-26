import { useState } from 'react'
import type { FormEvent } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { anmelden } from '../lib/supabase'
import { EASE, EINGANG } from '../lib/motion'

export function Anmeldung() {
  const [email, setEmail] = useState('')
  const [passwort, setPasswort] = useState('')
  const [laeuft, setLaeuft] = useState(false)
  const [fehler, setFehler] = useState<string | null>(null)
  const reduced = useReducedMotion()

  const absenden = async (e: FormEvent) => {
    e.preventDefault()
    if (laeuft) return
    setLaeuft(true)
    setFehler(await anmelden(email.trim(), passwort))
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
          <h1 className="display text-[16px] font-bold lowercase leading-none">vierfelder</h1>
          <p className="mt-1.5 text-[12px] text-kreide-52">
            lernen, gym, boxen, lesen. zu zweit, eine woche.
          </p>
        </motion.div>

        <form onSubmit={absenden} className="mt-8">
          <motion.div {...eingang(1)}>
            <Feld
              id="email"
              label="e-mail"
              type="email"
              autoComplete="username"
              value={email}
              onChange={setEmail}
            />
          </motion.div>

          <motion.div {...eingang(2)} className="mt-4">
            <Feld
              id="passwort"
              label="passwort"
              type="password"
              autoComplete="current-password"
              value={passwort}
              onChange={setPasswort}
            />
          </motion.div>

          <motion.div {...eingang(3)} className="mt-6">
            <motion.button
              type="submit"
              disabled={laeuft || !email || !passwort}
              whileTap={reduced || laeuft ? undefined : { scale: 0.99 }}
              transition={{ duration: 0.09, ease: EASE }}
              className="display h-12 w-full rounded-[2px] bg-kreide text-[15px] font-semibold lowercase text-grund transition-opacity duration-150 disabled:opacity-35"
            >
              {laeuft ? 'wird geprüft' : 'anmelden'}
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

        <motion.p {...eingang(4)} className="mt-8 text-[11px] text-kreide-52">
          zwei konten, keine registrierung. wenn du keins hast, gibt es keins.
        </motion.p>
      </main>
    </div>
  )
}

function Feld({
  id,
  label,
  type,
  autoComplete,
  value,
  onChange,
}: {
  id: string
  label: string
  type: string
  autoComplete: string
  value: string
  onChange: (v: string) => void
}) {
  return (
    <label htmlFor={id} className="block">
      <span className="text-[12px] text-kreide-52">{label}</span>
      <input
        id={id}
        type={type}
        autoComplete={autoComplete}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1.5 h-12 w-full rounded-[2px] border border-linie-hell bg-transparent px-3 text-[15px] text-kreide outline-none transition-colors duration-150 focus:border-kreide-52"
      />
    </label>
  )
}
