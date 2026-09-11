import { lazy, Suspense, useEffect, useState } from 'react'
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
import {
  ladeGewichtErinnerung,
  ladeGewichtErinnerungszeit,
  setzeGewichtAktiv,
  setzeGewichtErinnerungszeit,
} from '../lib/erinnerung'
import { blockiereNeustart } from '../lib/pwaBlocker'

const AktivitaetsErinnerungen = lazy(() =>
  import('./AktivitaetsErinnerungen').then((modul) => ({
    default: modul.AktivitaetsErinnerungen,
  }))
)

/**
 * Der Schalter fuer Benachrichtigungen.
 *
 * Er steht unten bei der Fusszeile und fasst alle Erinnerungen in einem
 * gemeinsamen Menue zusammen. Ist Push aus, bleibt er ein Satz und ein Knopf;
 * ist er an, oeffnet sich ein Menue mit den Aktionen (Probe, Aus) und allen
 * vier Erinnerungen (Gewicht, Lernen, Lesen, Wochenendspurt) im selben Rhythmus.
 */
export function Benachrichtigungen() {
  const [zustand, setZustand] = useState<PushZustand | null>(null)
  const [laeuft, setLaeuft] = useState(false)
  const [meldung, setMeldung] = useState<string | null>(null)
  const [zeit, setZeit] = useState<string | null>(null)
  const [zeitLaeuft, setZeitLaeuft] = useState(false)
  const [gewichtAktiv, setGewichtAktiv] = useState(true)

  useEffect(() => {
    let aktiv = true
    const ladeGewicht =
      typeof ladeGewichtErinnerung === 'function'
        ? ladeGewichtErinnerung
        : async () => {
            const z = await ladeGewichtErinnerungszeit()
            return z ? { zeit: z, aktiv: true } : null
          }

    Promise.all([pushZustand(), ladeGewicht()])
      .then(([z, gewicht]) => {
        if (!aktiv) return
        setZustand(z)
        if (gewicht) {
          setZeit(gewicht.zeit)
          setGewichtAktiv(gewicht.aktiv)
        }
      })
      .catch((fehler) => {
        if (!aktiv) return
        setMeldung(
          fehler instanceof Error
            ? fehler.message
            : 'einstellung konnte nicht geladen werden.'
        )
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
    const loeseNeustartschutz = blockiereNeustart()
    setLaeuft(true)
    setMeldung(null)
    try {
      setMeldung(await was())
    } catch (fehler) {
      setMeldung(fehler instanceof Error ? fehler.message : 'hat nicht geklappt.')
    } finally {
      try {
        setZustand(await pushZustand())
      } catch {
        setMeldung('benachrichtigungsstatus konnte nicht bestätigt werden.')
      }
      setLaeuft(false)
      loeseNeustartschutz()
    }
  }

  async function aendereZeit(neu: string) {
    const loeseNeustartschutz = blockiereNeustart()
    const vorher = zeit
    setZeit(neu)
    setZeitLaeuft(true)
    setMeldung(null)
    try {
      await setzeGewichtErinnerungszeit(neu)
      setMeldung(`gewichtserinnerung ist auf ${neu} gestellt.`)
    } catch (fehler) {
      setZeit(vorher)
      setMeldung(
        fehler instanceof Error
          ? fehler.message
          : 'uhrzeit konnte nicht gespeichert werden.'
      )
    } finally {
      setZeitLaeuft(false)
      loeseNeustartschutz()
    }
  }

  async function aendereGewichtAktiv(neuAktiv: boolean) {
    const loeseNeustartschutz = blockiereNeustart()
    const vorher = gewichtAktiv
    setGewichtAktiv(neuAktiv)
    setLaeuft(true)
    setMeldung(null)
    try {
      if (typeof setzeGewichtAktiv === 'function') {
        await setzeGewichtAktiv(neuAktiv)
      }
      setMeldung(
        neuAktiv
          ? 'gewichtserinnerung eingeschaltet.'
          : 'gewichtserinnerung ausgeschaltet.'
      )
    } catch (fehler) {
      setGewichtAktiv(vorher)
      setMeldung(
        fehler instanceof Error
          ? fehler.message
          : 'einstellung konnte nicht gespeichert werden.'
      )
    } finally {
      setLaeuft(false)
      loeseNeustartschutz()
    }
  }

  // im prototyp gibt es kein konto, an das ein gerät hängen könnte
  if (zustand === null || zustand === 'ohne-konto') return null

  return (
    <section
      aria-label="benachrichtigungen"
      className="mt-6 border-t border-linie pt-3 text-[11px] text-kreide-52"
    >
      <Inhalt
        zustand={zustand}
        laeuft={laeuft}
        zeit={zeit}
        zeitLaeuft={zeitLaeuft}
        gewichtAktiv={gewichtAktiv}
        onZeit={aendereZeit}
        onGewichtAktiv={aendereGewichtAktiv}
        onAus={fuehreAus}
      />

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
  zeit: string | null
  zeitLaeuft: boolean
  gewichtAktiv: boolean
  onZeit: (zeit: string) => void
  onGewichtAktiv: (aktiv: boolean) => void
  onAus: (was: () => Promise<string | null>) => void
}

function Inhalt({
  zustand,
  laeuft,
  zeit,
  zeitLaeuft,
  gewichtAktiv,
  onZeit,
  onGewichtAktiv,
  onAus,
}: InhaltProps) {
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
    <details className="mt-2">
      <summary className="min-h-11 cursor-pointer py-3 text-kreide-60 transition-colors duration-150 hover:text-kreide">
        benachrichtigungen
      </summary>

      <div className="space-y-1 pb-2">
        <div className="flex flex-wrap items-center gap-x-3 pb-2 border-b border-linie">
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

        {zeit && (
          <div className="flex min-h-11 items-center gap-3 py-2">
            <input
              type="checkbox"
              checked={gewichtAktiv}
              disabled={laeuft || zeitLaeuft}
              onChange={(e) => void onGewichtAktiv(e.target.checked)}
              aria-label="gewicht erinnern"
              className="h-4 w-4 accent-current cursor-pointer"
            />
            <div className="flex-1">
              <label className="flex flex-wrap items-center gap-2 cursor-pointer">
                <span className="text-[12px] font-semibold text-kreide">gewicht</span>
                <span className="text-kreide-52">täglich um</span>
                <input
                  type="time"
                  min="06:00"
                  max="21:59"
                  step="300"
                  value={zeit}
                  disabled={!gewichtAktiv || zeitLaeuft}
                  onChange={(ereignis) => onZeit(ereignis.target.value)}
                  aria-label="uhrzeit der gewichtserinnerung"
                  className="rounded-[2px] border border-linie bg-flaeche px-2 py-0.5 text-[12px] font-semibold text-kreide disabled:opacity-50"
                />
              </label>
              <span className="block text-[11px] text-kreide-52">
                wenn heute noch kein gewichtseintrag vorliegt
              </span>
            </div>
          </div>
        )}

        <Suspense fallback={null}>
          <AktivitaetsErinnerungen />
        </Suspense>

        <p className="pt-2 text-[11px] text-kreide-52 border-t border-linie/40 mt-1">
          deutsche zeit · laufende sitzungen pausieren die jeweilige erinnerung · nach 22 uhr ruhe
        </p>
      </div>
    </details>
  )
}