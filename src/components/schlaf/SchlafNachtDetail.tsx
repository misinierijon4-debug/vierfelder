import { useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
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
    (nacht) => nacht.nacht === gewaehlterTag && nacht.user === ansichtUser
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
      <div className="border-b border-linie pb-3">
        <p className="text-[10px] text-kreide-52">nacht-detail</p>
        <h2 id="nacht-detail-titel" className="mt-0.5 text-balance text-[13px] font-semibold text-kreide">
          {datumLabel}
        </h2>

        <div className="mt-3 grid grid-cols-2 rounded-[2px] border border-linie bg-flaeche p-0.5" role="group" aria-label="person auswählen">
          {USERS.map((user) => {
            const istAktiv = ansichtUser === user.id
            return (
              <button
                key={user.id}
                type="button"
                aria-pressed={istAktiv}
                onClick={() => setAnsichtUser(user.id)}
                className={`flex min-h-9 items-center justify-center gap-1.5 rounded-[1px] border text-[11px] font-medium transition-colors duration-150 focus-visible:outline-none ${
                  istAktiv
                    ? 'border-linie-hell bg-grund text-kreide'
                    : 'border-transparent text-kreide-52 hover:text-kreide'
                }`}
              >
                <span className="size-2 rounded-[1px]" style={{ backgroundColor: user.farbe }} />
                <span>{user.name}</span>
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
            <div className="overflow-hidden rounded-[2px] border border-linie bg-flaeche">
              <div className="flex items-end justify-between gap-4 px-4 py-3.5">
                <div className="min-w-0">
                  <span className="text-[10px] text-kreide-52">echte schlafzeit</span>
                  <div className="tnum mt-1 truncate text-[28px] font-bold leading-none" style={{ color: person.farbe }}>
                    {formatDauer(analyse.schlafMinuten)}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <span className="text-[10px] text-kreide-52">effizienz</span>
                  <div className="tnum mt-1 text-[20px] font-bold leading-none text-kreide">
                    {analyse.effizienz === null ? '—' : `${analyse.effizienz}%`}
                  </div>
                </div>
              </div>

              <dl className="grid grid-cols-3 divide-x divide-linie border-t border-linie">
                <div className="min-w-0 px-2.5 py-2.5">
                  <dt className="text-[9px] text-kreide-52">eingeschlafen</dt>
                  <dd className="tnum mt-1 truncate text-[13px] font-semibold text-kreide">
                    {analyse.einschlafUhrzeit}
                  </dd>
                </div>
                <div className="min-w-0 px-2.5 py-2.5">
                  <dt className="text-[9px] text-kreide-52">aufgewacht</dt>
                  <dd className="tnum mt-1 truncate text-[13px] font-semibold text-kreide">
                    {analyse.hatZeitfensterDaten ? analyse.aufwachUhrzeit : '—'}
                  </dd>
                </div>
                <div className="min-w-0 px-2.5 py-2.5">
                  {/* ohne InBed-segmente ist es die schlafspanne, nicht die bettzeit */}
                  <dt className="text-[9px] text-kreide-52">
                    {analyse.inBedBasis === 'bett' ? 'zeit im bett' : 'schlaffenster'}
                  </dt>
                  <dd className="tnum mt-1 truncate text-[13px] font-semibold text-kreide">
                    {analyse.hatZeitfensterDaten ? formatDauer(analyse.inBedMinuten) : '—'}
                  </dd>
                </div>
              </dl>
            </div>

            <PhasenZeitstrahl analyse={analyse} farbe={person.farbe} />
          </motion.div>
        ) : (
          <motion.div
            key="keine-daten"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="mt-3.5 rounded-[2px] border border-dashed border-linie px-4 py-6 text-center"
          >
            <p className="text-pretty text-[12px] font-medium text-kreide">keine Health-Daten für {person.name}</p>
            <p className="mt-1 text-pretty text-[10px] text-kreide-52">für diese Nacht wurde noch kein Schlaf importiert</p>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  )
}
