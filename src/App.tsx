import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { AREAS, other, user as userDef } from './lib/types'
import type { AppTab, AreaId, UserId } from './lib/types'
import type { Backend } from './lib/backend'
import { istBilanzzeit, toKey, weekDays } from './lib/dates'
import { useTracker } from './lib/store'
import { lokalWechseln, lokalesBackend, lokalesMe } from './lib/lokal'
import { abmelden, hatSupabase, supabaseBackend, useSession } from './lib/supabase'
import { abstand, istGesetzt, streak, wert, wocheBereich, wocheGesamt } from './lib/tracker'
import { Kopf } from './components/Kopf'
import { Bereichszeile } from './components/Bereichszeile'
import { Raster } from './components/Raster'
import { Anmeldung } from './components/Anmeldung'
import { TabLeiste } from './components/TabLeiste'
import { SchlafTab } from './components/schlaf/SchlafTab'

const UNDO_MS = 5000

export function App() {
  const { status, session } = useSession()
  const [wechselNr, setWechselNr] = useState(0)

  /**
   * am konto festmachen, nicht am session-objekt: getSession() und
   * onAuthStateChange liefern beide dieselbe anmeldung, aber als zwei
   * verschiedene objekte. daran hing bisher ein zweites, überflüssiges laden.
   */
  const kontoId = session?.user.id ?? null

  const backend = useMemo<Backend | null>(() => {
    if (!hatSupabase) return lokalesBackend()
    return kontoId ? supabaseBackend(kontoId) : null
    // wechselNr erzwingt beim nutzerwechsel im prototyp ein neues laden
  }, [kontoId, wechselNr])

  if (hatSupabase && status === 'laden') return <div className="min-h-[100dvh] bg-grund" />
  if (hatSupabase && !session) return <Anmeldung />
  if (!backend) return <div className="min-h-[100dvh] bg-grund" />

  return <Tracker backend={backend} onWechsel={() => setWechselNr((n) => n + 1)} />
}

function Tracker({ backend, onWechsel }: { backend: Backend; onWechsel: () => void }) {
  const { me, zustand, schlaf, ladezustand, fehler, ereignis, toggle, setWert } = useTracker(backend)
  const [heute, setHeute] = useState(() => new Date())
  const [aktiverTab, setAktiverTab] = useState<AppTab>('tracker')
  const [undoFuer, setUndoFuer] = useState<AreaId | null>(null)

  const heuteKey = useMemo(() => toKey(heute), [heute])
  const woche = useMemo(() => weekDays(heute), [heute])
  const ich = userDef(me)
  const er = other(me)

  // datumswechsel um mitternacht und beim zurückkehren in die app
  useEffect(() => {
    const pruefe = () => {
      const jetzt = new Date()
      if (toKey(jetzt) !== heuteKey) setHeute(jetzt)
    }
    const jetzt = new Date()
    const mitternacht = new Date(jetzt)
    mitternacht.setHours(24, 0, 0, 0)
    const timer = window.setTimeout(pruefe, mitternacht.getTime() - jetzt.getTime() + 200)
    document.addEventListener('visibilitychange', pruefe)
    return () => {
      window.clearTimeout(timer)
      document.removeEventListener('visibilitychange', pruefe)
    }
  }, [heuteKey])

  // rückgängig steht fünf sekunden in der zeile, die du zuletzt angefasst hast
  useEffect(() => {
    if (!ereignis || ereignis.quelle !== 'selbst') return
    setUndoFuer(ereignis.area)
    const timer = window.setTimeout(() => setUndoFuer(null), UNDO_MS)
    return () => window.clearTimeout(timer)
  }, [ereignis])

  const meineWoche = wocheGesamt(zustand, me, woche)

  return (
    <div className="min-h-[100dvh] bg-grund">
      <main className="mx-auto w-full max-w-[420px] px-5 pb-6">
        <Kopf
          heute={heute}
          woche={woche}
          zustand={zustand}
          me={me}
          bilanzzeit={istBilanzzeit(heute)}
        />

        {/* Tab-Navigation */}
        <TabLeiste aktiverTab={aktiverTab} onTabWechsel={setAktiverTab} />

        {/* fester platz, damit eine fehlermeldung nichts verschiebt */}
        <div className="flex h-5 items-start">
          <AnimatePresence mode="wait" initial={false}>
            {fehler && (
              <motion.p
                key={fehler}
                role="alert"
                initial={{ opacity: 0 }}
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

        {/* Tab-Inhalte */}
        <AnimatePresence mode="wait">
          {aktiverTab === 'tracker' ? (
            <motion.div
              key="tab-tracker"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.18 }}
            >
              <section
                aria-label="heute eintragen"
                className="mt-2 border-t border-linie transition-opacity duration-200"
                style={{ opacity: ladezustand === 'laden' ? 0.4 : 1 }}
              >
                {AREAS.map((area, i) => (
                  <Bereichszeile
                    key={area.id}
                    area={area}
                    index={i}
                    gesetzt={istGesetzt(zustand, me, area.id, heuteKey)}
                    wocheIch={wocheBereich(zustand, me, area.id, woche)}
                    abstand={abstand(zustand, area.id, woche, me, er.id)}
                    streak={streak(zustand, me, area.id, heute)}
                    wert={wert(zustand.werte, area.id, heuteKey)}
                    farbe={ich.farbe}
                    farbeEr={er.farbe}
                    zeigeUndo={undoFuer === area.id}
                    onTap={() => toggle(area.id, heuteKey)}
                    onUndo={() => {
                      toggle(area.id, heuteKey)
                      setUndoFuer(null)
                    }}
                    onWert={(delta) =>
                      setWert(area.id, heuteKey, wert(zustand.werte, area.id, heuteKey) + delta)
                    }
                  />
                ))}
              </section>

              <Raster
                zustand={zustand}
                woche={woche}
                heute={heuteKey}
                ereignis={ereignis}
                leer={meineWoche === 0}
              />
            </motion.div>
          ) : (
            <motion.div
              key="tab-schlaf"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.18 }}
            >
              <SchlafTab
                naechte={schlaf}
                woche={woche}
                heuteKey={heuteKey}
                me={me}
              />
            </motion.div>
          )}
        </AnimatePresence>

        <Fusszeile art={backend.art} me={me} onWechsel={onWechsel} />
      </main>
    </div>
  )
}

function Fusszeile({
  art,
  me,
  onWechsel,
}: {
  art: Backend['art']
  me: UserId
  onWechsel: () => void
}) {
  const er = other(me)

  if (art === 'supabase') {
    return (
      <footer className="mt-6 flex items-center gap-2 text-[11px] text-kreide-52">
        <span>angemeldet als {userDef(me).name}</span>
        <button
          type="button"
          onClick={() => abmelden()}
          className="underline decoration-linie-hell underline-offset-4"
        >
          abmelden
        </button>
      </footer>
    )
  }

  return (
    <footer className="mt-6 flex items-center gap-2 text-[11px] text-kreide-52">
      <span>prototyp · angemeldet als {userDef(lokalesMe()).name}</span>
      <button
        type="button"
        onClick={() => {
          lokalWechseln(er.id)
          onWechsel()
        }}
        className="underline decoration-linie-hell underline-offset-4"
      >
        zu {er.name} wechseln
      </button>
    </footer>
  )
}
