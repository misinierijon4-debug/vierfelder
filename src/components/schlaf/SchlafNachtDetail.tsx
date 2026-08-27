import { useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { USERS, user as userDef } from '../../lib/types'
import type { Schlafnacht, UserId } from '../../lib/types'
import { fromKey, langesDatum } from '../../lib/dates'
import { analysiereSchlafnacht, formatDauer } from '../../lib/schlafPhasen'
import { PhasenZeitstrahl } from './PhasenZeitstrahl'

type Props = {
  naechte: Schlafnacht[]
  gewaehlterTag: string
  me: UserId
}

export function SchlafNachtDetail({ naechte, gewaehlterTag, me }: Props) {
  const [ansichtUser, setAnsichtUser] = useState<UserId>(me)

  // Finde die Nacht für den ausgewählten Tag und Nutzer
  const aktuelleNacht = naechte.find(
    (n) => n.nacht === gewaehlterTag && n.user === ansichtUser
  )

  const analyse = aktuelleNacht ? analysiereSchlafnacht(aktuelleNacht) : null
  const person = userDef(ansichtUser)

  let datumLabel = gewaehlterTag
  try {
    datumLabel = langesDatum(fromKey(gewaehlterTag))
  } catch {
    datumLabel = gewaehlterTag
  }

  return (
    <section aria-labelledby="nacht-detail-titel" className="mt-5">
      {/* Header mit formatiertem Datum & sauberem User-Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-linie pb-2.5">
        <h2 id="nacht-detail-titel" className="text-[12px] font-normal text-kreide-52">
          nacht-detail · <span className="font-medium text-kreide">{datumLabel}</span>
        </h2>

        {/* Sauberer, getrennter User-Umschalter ohne Überlappung */}
        <div className="inline-flex rounded-[2px] border border-linie bg-flaeche p-[2px]">
          {USERS.map((u) => {
            const istAktiv = ansichtUser === u.id
            return (
              <button
                key={u.id}
                type="button"
                onClick={() => setAnsichtUser(u.id)}
                className="relative flex items-center gap-1.5 px-3 py-1 text-[11px] font-medium transition-colors"
                style={{ color: istAktiv ? 'var(--kreide)' : 'var(--kreide-52)' }}
              >
                {istAktiv && (
                  <motion.div
                    layoutId="detailUserPill"
                    className="absolute inset-0 rounded-[1px] bg-grund"
                    style={{ border: '1px solid var(--linie-hell)' }}
                  />
                )}
                <span
                  className="relative z-10 h-2 w-2 flex-shrink-0 rounded-full"
                  style={{ backgroundColor: u.farbe }}
                />
                <span className="relative z-10">{u.name}</span>
              </button>
            )
          })}
        </div>
      </div>

      <AnimatePresence mode="wait">
        {analyse ? (
          <motion.div
            key={`${ansichtUser}-${gewaehlterTag}`}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.18 }}
            className="mt-3.5"
          >
            {/* Übersichtskarten: 2x2 Grid mit festen einzeiligen Werten */}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <div className="flex flex-col justify-between rounded-[2px] border border-linie bg-flaeche p-3">
                <span className="text-[11px] text-kreide-52">echte schlafzeit</span>
                <p
                  className="tnum text-[17px] font-bold tracking-tight whitespace-nowrap mt-1"
                  style={{ color: person.farbe }}
                >
                  {formatDauer(analyse.schlafMinuten)}
                </p>
              </div>

              <div className="flex flex-col justify-between rounded-[2px] border border-linie bg-flaeche p-3">
                <span className="text-[11px] text-kreide-52">zeit im bett</span>
                <p className="tnum text-[17px] font-bold tracking-tight text-kreide whitespace-nowrap mt-1">
                  {formatDauer(analyse.inBedMinuten)}
                </p>
              </div>

              <div className="flex flex-col justify-between rounded-[2px] border border-linie bg-flaeche p-3">
                <span className="text-[11px] text-kreide-52">schlaffenster</span>
                <p className="tnum text-[14px] font-semibold tracking-tight text-kreide whitespace-nowrap mt-1">
                  {analyse.einschlafUhrzeit} – {analyse.aufwachUhrzeit}
                </p>
              </div>

              <div className="flex flex-col justify-between rounded-[2px] border border-linie bg-flaeche p-3">
                <span className="text-[11px] text-kreide-52">effizienz</span>
                <p className="tnum text-[17px] font-bold tracking-tight text-kreide whitespace-nowrap mt-1">
                  {analyse.effizienz}%
                </p>
              </div>
            </div>

            {/* Phasen-Zeitstrahl */}
            <PhasenZeitstrahl analyse={analyse} />
          </motion.div>
        ) : (
          <motion.div
            key="keine-daten"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="mt-3.5 flex h-28 items-center justify-center rounded-[2px] border border-dashed border-linie bg-flaeche/40 text-[12px] text-kreide-52"
          >
            keine health-daten für {person.name} in dieser nacht
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  )
}
