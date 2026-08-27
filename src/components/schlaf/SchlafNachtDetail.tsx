import { useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { USERS, user as userDef } from '../../lib/types'
import type { Schlafnacht, UserId } from '../../lib/types'
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

  return (
    <section aria-labelledby="nacht-detail-titel" className="mt-5">
      {/* Header mit Tag & User-Auswahl */}
      <div className="flex items-center justify-between border-b border-linie pb-2">
        <h2 id="nacht-detail-titel" className="text-[12px] font-normal text-kreide-52">
          nacht-detail · <span className="tnum text-kreide">{gewaehlterTag}</span>
        </h2>

        {/* User-Umschalter */}
        <div className="flex rounded-[2px] border border-linie bg-flaeche p-[2px]">
          {USERS.map((u) => {
            const istAktiv = ansichtUser === u.id
            return (
              <button
                key={u.id}
                type="button"
                onClick={() => setAnsichtUser(u.id)}
                className="relative px-2.5 py-0.5 text-[11px] font-medium transition-colors"
                style={{ color: istAktiv ? 'var(--kreide)' : 'var(--kreide-52)' }}
              >
                {istAktiv && (
                  <motion.div
                    layoutId="detailUserAktiv"
                    className="absolute inset-0 rounded-[1px] bg-grund"
                    style={{ border: '1px solid var(--linie-hell)' }}
                  />
                )}
                <span className="relative z-10 flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: u.farbe }} />
                  {u.name}
                </span>
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
            transition={{ duration: 0.2 }}
            className="mt-3"
          >
            {/* Große Kennzahlen-Übersicht */}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <div className="rounded-[2px] border border-linie bg-flaeche p-2.5">
                <span className="text-[10px] text-kreide-52">echte schlafzeit</span>
                <p
                  className="tnum text-[18px] font-semibold tracking-tight"
                  style={{ color: person.farbe }}
                >
                  {formatDauer(analyse.schlafMinuten)}
                </p>
              </div>

              <div className="rounded-[2px] border border-linie bg-flaeche p-2.5">
                <span className="text-[10px] text-kreide-52">zeit im bett</span>
                <p className="tnum text-[18px] font-semibold tracking-tight text-kreide">
                  {formatDauer(analyse.inBedMinuten)}
                </p>
              </div>

              <div className="rounded-[2px] border border-linie bg-flaeche p-2.5">
                <span className="text-[10px] text-kreide-52">schlaffenster</span>
                <p className="tnum text-[15px] font-medium tracking-tight text-kreide mt-0.5">
                  {analyse.einschlafUhrzeit} – {analyse.aufwachUhrzeit}
                </p>
              </div>

              <div className="rounded-[2px] border border-linie bg-flaeche p-2.5">
                <span className="text-[10px] text-kreide-52">effizienz</span>
                <p className="tnum text-[18px] font-semibold tracking-tight text-kreide">
                  {analyse.effizienz}%
                </p>
              </div>
            </div>

            {/* Phasen Zeitstrahl */}
            <PhasenZeitstrahl analyse={analyse} />
          </motion.div>
        ) : (
          <motion.div
            key="keine-daten"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="mt-3 flex h-32 items-center justify-center rounded-[2px] border border-dashed border-linie bg-flaeche/30 text-[12px] text-kreide-52"
          >
            keine health-daten für {person.name} in dieser nacht
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  )
}
