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
      <div className="flex items-center justify-between border-b border-linie pb-2.5">
        <h2 id="nacht-detail-titel" className="text-[12px] font-normal text-kreide-52">
          nacht-detail · <span className="font-semibold text-kreide">{datumLabel}</span>
        </h2>

        {/* Sauberer User-Switcher ohne Überlappungen */}
        <div className="flex items-center gap-1 rounded-[2px] border border-linie bg-flaeche p-0.5">
          {USERS.map((u) => {
            const istAktiv = ansichtUser === u.id
            return (
              <button
                key={u.id}
                type="button"
                onClick={() => setAnsichtUser(u.id)}
                className={`flex items-center gap-1.5 rounded-[1px] px-2.5 py-1 text-[11px] font-medium transition-all ${
                  istAktiv
                    ? 'bg-grund text-kreide shadow-sm border border-linie-hell'
                    : 'text-kreide-52 hover:text-kreide'
                }`}
              >
                <span
                  className="h-2 w-2 flex-shrink-0 rounded-full"
                  style={{ backgroundColor: u.farbe }}
                />
                <span>{u.name}</span>
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
            {/* Hero Stat Card */}
            <div className="rounded-[2px] border border-linie bg-flaeche p-4">
              <div className="flex items-baseline justify-between">
                <div>
                  <span className="text-[11px] text-kreide-52">echte schlafzeit</span>
                  <div className="tnum text-[26px] font-bold tracking-tight leading-none mt-1" style={{ color: person.farbe }}>
                    {formatDauer(analyse.schlafMinuten)}
                  </div>
                </div>

                <div className="text-right">
                  <span className="text-[11px] text-kreide-52">effizienz</span>
                  <div className="tnum text-[20px] font-bold text-kreide leading-none mt-1">
                    {analyse.effizienz}%
                  </div>
                </div>
              </div>

              <div className="mt-4 flex items-center justify-between border-t border-linie/50 pt-3 text-[12px]">
                <div className="flex items-center gap-1.5">
                  <span className="text-kreide-52">schlaffenster:</span>
                  <span className="tnum font-semibold text-kreide">
                    {analyse.einschlafUhrzeit} – {analyse.aufwachUhrzeit}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-kreide-52">im bett:</span>
                  <span className="tnum font-semibold text-kreide">
                    {formatDauer(analyse.inBedMinuten)}
                  </span>
                </div>
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
