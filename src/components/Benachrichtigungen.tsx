import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { BellRinging, BellSlash } from '@phosphor-icons/react'
import {
  alsAppInstalliert,
  istApple,
  pushAbmelden,
  pushAnmelden,
  pushProbe,
  pushZustand,
} from '../lib/push'
import type { PushZustand } from '../lib/push'

/**
 * Der Schalter fuer Benachrichtigungen.
 *
 * Er steht unten bei der Fusszeile und nicht oben bei den Bereichen, weil er
 * einmal angefasst wird und dann nie wieder. Solange er aus ist, ist er ein
 * Satz und ein Knopf; ist er an, schrumpft er auf eine Zeile mit zwei Links.
 *
 * Die Probe daneben ist kein Spielzeug: sie ist der einzige Weg, von aussen zu
 * sehen, ob die Kette bis zum Sperrbildschirm haelt. Kommt sie an, kommt jede
 * spaetere Erinnerung auch an.
 */
export function Benachrichtigungen() {
  const [zustand, setZustand] = useState<PushZustand | null>(null)
  const [laeuft, setLaeuft] = useState(false)
  const [meldung, setMeldung] = useState<string | null>(null)

  useEffect(() => {
    let aktiv = true
    pushZustand().then((z) => {
      if (aktiv) setZustand(z)
    })
    return () => {
      aktiv = false
    }
  }, [])

  // die meldung ist eine rueckmeldung, kein zustand. nach acht sekunden weg.
  useEffect(() => {
    if (!meldung) return
    const timer = window.setTimeout(() => setMeldung(null), 8000)
    return () => window.clearTimeout(timer)
  }, [meldung])

  /**
   * jede aktion endet mit einem frischen zustand statt mit dem, was sie
   * zurueckgibt: erlaubnis und abo koennen sich auch am browser vorbei
   * geaendert haben, und der schalter soll zeigen, was ist.
   */
  async function fuehreAus(was: () => Promise<string | null>) {
    setLaeuft(true)
    setMeldung(null)
    try {
      setMeldung(await was())
    } catch (fehler) {
      setMeldung(fehler instanceof Error ? fehler.message : 'hat nicht geklappt.')
    } finally {
      setZustand(await pushZustand())
      setLaeuft(false)
    }
  }

  // im prototyp gibt es kein konto, an das ein gerät hängen könnte
  if (zustand === null || zustand === 'ohne-konto') return null

  return (
    <section
      aria-label="benachrichtigungen"
      className="mt-6 border-t border-linie pt-3 text-[11px] text-kreide-52"
    >
      <Inhalt zustand={zustand} laeuft={laeuft} onAus={fuehreAus} />

      <AnimatePresence initial={false}>
        {meldung && (
          <motion.p
            key={meldung}
            role="status"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.14 }}
            className="mt-2 text-[11px] text-kreide-60"
          >
            {meldung}
          </motion.p>
        )}
      </AnimatePresence>
    </section>
  )
}

type InhaltProps = {
  zustand: PushZustand
  laeuft: boolean
  onAus: (was: () => Promise<string | null>) => void
}

function Inhalt({ zustand, laeuft, onAus }: InhaltProps) {
  if (zustand === 'ohne-schluessel') {
    return <p>benachrichtigungen sind auf dem server noch nicht eingerichtet.</p>
  }

  if (zustand === 'unmoeglich') {
    // der häufigste fall, und der einzige, den man selbst beheben kann
    if (istApple() && !alsAppInstalliert()) {
      return (
        <p>
          für benachrichtigungen muss zweikampf auf dem home-bildschirm liegen: in safari auf
          teilen tippen, dann „zum home-bildschirm“, und die app von dort öffnen.
        </p>
      )
    }
    return <p>dieser browser kann keine benachrichtigungen.</p>
  }

  if (zustand === 'blockiert') {
    return (
      <p>
        benachrichtigungen sind für zweikampf abgelehnt. das lässt sich nur in den
        einstellungen des geräts zurücknehmen.
      </p>
    )
  }

  if (zustand === 'aus') {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <p className="flex-1 min-w-[180px]">
          erinnerungen aufs handy, wenn am abend etwas fehlt.
        </p>
        <button
          type="button"
          disabled={laeuft}
          onClick={() =>
            onAus(async () => {
              const neu = await pushAnmelden()
              return neu === 'blockiert' ? 'die erlaubnis wurde abgelehnt.' : null
            })
          }
          className="flex min-h-11 items-center gap-2 rounded-[2px] border border-linie bg-flaeche px-3 text-[12px] font-semibold text-kreide transition-colors duration-150 hover:border-linie-hell disabled:opacity-50"
        >
          <BellRinging size={16} weight="bold" aria-hidden="true" />
          einschalten
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-wrap items-center gap-x-3">
      <span className="flex items-center gap-2 text-kreide-60">
        <BellRinging size={14} weight="bold" aria-hidden="true" />
        benachrichtigungen an
      </span>
      <button
        type="button"
        disabled={laeuft}
        onClick={() =>
          onAus(async () => {
            const ergebnis = await pushProbe()
            return ergebnis.gesendet > 0
              ? 'probe ist unterwegs. sie kommt auch, wenn die app zu ist.'
              : 'kein gerät erreicht. schalte einmal aus und wieder ein.'
          })
        }
        className="flex min-h-11 items-center px-1 underline decoration-linie-hell underline-offset-4 disabled:opacity-50"
      >
        probe senden
      </button>
      <button
        type="button"
        disabled={laeuft}
        aria-label="benachrichtigungen ausschalten"
        onClick={() =>
          onAus(async () => {
            await pushAbmelden()
            return null
          })
        }
        className="flex min-h-11 items-center gap-1 px-1 underline decoration-linie-hell underline-offset-4 disabled:opacity-50"
      >
        <BellSlash size={14} weight="bold" aria-hidden="true" />
        aus
      </button>
    </div>
  )
}
