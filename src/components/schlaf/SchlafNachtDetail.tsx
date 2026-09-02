import { useEffect } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { USERS, user as userDef } from '../../lib/types'
import type { Schlafnacht, UserId } from '../../lib/types'
import { addDays, fromKey, langesDatum } from '../../lib/dates'
import { STEMPEL } from '../../lib/motion'
import { abendDatum, analysiereSchlafnacht, formatDauer } from '../../lib/schlafPhasen'
import { medianAbweichung, scoreKomponentenZeilen } from '../../lib/schlafPhasen'
import { PhasenZeitstrahl } from './PhasenZeitstrahl'
import { Ring } from './Ring'

const MORGEN = new Intl.DateTimeFormat('de-DE', { weekday: 'long' })

type Props = {
  naechte: Schlafnacht[]
  registrierte: ReadonlySet<UserId>
  gewaehlterTag: string
  ansichtUser: UserId
  onAnsichtUserWaehlen: (user: UserId) => void
  /** wird gerufen, sobald eine nacht ohne verlauf angezeigt werden soll */
  onVerlaufBrauchen: (user: UserId, nacht: string) => void
}

export function SchlafNachtDetail({
  naechte,
  registrierte,
  gewaehlterTag,
  ansichtUser,
  onAnsichtUserWaehlen,
  onVerlaufBrauchen,
}: Props) {
  const aktuelleNacht = naechte.find(
    (nacht) => abendDatum(nacht.einschlafzeit) === gewaehlterTag && nacht.user === ansichtUser
  )
  const analyse = aktuelleNacht ? analysiereSchlafnacht(aktuelleNacht) : null
  const scoreZeilen = aktuelleNacht ? scoreKomponentenZeilen(aktuelleNacht) : []
  // wie weit diese nacht von der eigenen gewohnheit entfernt ist; ohne eine
  // einzige vornacht gibt es keine gewohnheit und damit keinen abstand
  const medianInfo = aktuelleNacht ? medianAbweichung(aktuelleNacht, naechte) : null

  // aeltere naechte kommen ohne verlauf. sichtbar wird er erst, wenn jemand
  // die nacht aufschlaegt — also wird er auch erst dann geholt.
  const fehlenderVerlauf =
    aktuelleNacht && aktuelleNacht.phasen === null
      ? { user: aktuelleNacht.user, nacht: aktuelleNacht.nacht }
      : null
  useEffect(() => {
    if (fehlenderVerlauf) onVerlaufBrauchen(fehlenderVerlauf.user, fehlenderVerlauf.nacht)
  }, [fehlenderVerlauf?.user, fehlenderVerlauf?.nacht, onVerlaufBrauchen])
  const person = userDef(ansichtUser)
  const istRegistriert = registrierte.has(ansichtUser)

  // die nacht traegt den abend, an dem sie begonnen hat — wie in sleep cycle
  let datumLabel = gewaehlterTag
  let bisLabel = ''
  try {
    const abend = fromKey(gewaehlterTag)
    datumLabel = langesDatum(abend)
    bisLabel = MORGEN.format(addDays(abend, 1)).toLowerCase()
  } catch {
    datumLabel = gewaehlterTag
  }

  return (
    <section aria-labelledby="nacht-detail-titel" className="mt-5">
      <div className="border-b border-linie pb-3">
        <p className="text-[10px] text-kreide-52">
          {bisLabel ? `nacht auf ${bisLabel}` : 'nacht-detail'}
        </p>
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
                onClick={() => onAnsichtUserWaehlen(user.id)}
                className={`relative flex min-h-11 items-center justify-center gap-1.5 text-[11px] font-medium transition-colors duration-150 focus-visible:outline-none ${
                  istAktiv ? 'text-kreide' : 'text-kreide-52 hover:text-kreide'
                }`}
              >
                {/* derselbe wandernde indikator wie in der tab-leiste: die
                    umschaltung ist dieselbe handlung, also sieht sie gleich aus */}
                {istAktiv && (
                  <motion.span
                    layoutId="aktivePersonIndikator"
                    transition={STEMPEL}
                    aria-hidden
                    className="absolute inset-0 rounded-[1px] bg-grund"
                    style={{ border: '1px solid var(--linie-hell)' }}
                  />
                )}
                <span className="relative z-10 size-2 rounded-[1px]" style={{ backgroundColor: user.farbe }} />
                <span className="relative z-10">{user.name}</span>
              </button>
            )
          })}
        </div>
      </div>

      <AnimatePresence mode="wait">
        {!istRegistriert ? (
          <motion.div
            key={`${ansichtUser}-nicht-verbunden`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="mt-3.5 rounded-[2px] border border-dashed border-linie px-4 py-6 text-center"
          >
            <p className="text-pretty text-[12px] font-medium text-kreide">
              {person.name} ist noch nicht mit Schlaf verbunden
            </p>
            <p className="mt-1 text-pretty text-[10px] text-kreide-52">
              nach dem ersten Health-Import erscheinen die Nächte automatisch
            </p>
          </motion.div>
        ) : analyse ? (
          <motion.div
            key={`${ansichtUser}-${gewaehlterTag}`}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.18 }}
            className="mt-3.5"
          >
            <div className="overflow-hidden rounded-[2px] border border-linie bg-flaeche">
              <div className="flex items-center gap-4 px-4 py-4">
                <Ring
                  anteil={analyse.qualitaet / 100}
                  farbe={person.farbe}
                  label="qualität"
                />

                <div className="min-w-0 flex-1">
                  <span className="text-[10px] text-kreide-52">echte schlafzeit</span>
                  <div
                    className="tnum mt-1 truncate text-[28px] font-bold leading-none"
                    style={{ color: person.farbe }}
                  >
                    {formatDauer(analyse.schlafMinuten)}
                  </div>

                  <span className="mt-3 block text-[10px] text-kreide-52">
                    {analyse.inBedBasis === 'bett' ? 'zeit im bett' : 'schlaffenster'}
                  </span>
                  <div className="tnum mt-1 truncate text-[15px] font-semibold leading-none text-kreide">
                    {analyse.hatZeitfensterDaten ? formatDauer(analyse.inBedMinuten) : '—'}
                  </div>
                </div>
              </div>

              <dl className="grid grid-cols-3 divide-x divide-linie border-t border-linie">
                <div className="min-w-0 px-2.5 py-2.5">
                  <dt className="text-[10px] text-kreide-52">eingeschlafen</dt>
                  <dd className="mt-1 truncate">
                    <span className="tnum text-[13px] font-semibold text-kreide">
                      {analyse.einschlafUhrzeit}
                    </span>
                    {analyse.einschlafdauerMinuten !== null && (
                      <span className="tnum mt-0.5 block text-[10px] text-kreide-52">
                        {analyse.einschlafdauerMinuten < 1
                          ? 'sofort'
                          : `nach ${formatDauer(analyse.einschlafdauerMinuten)} im bett`}
                      </span>
                    )}
                    {medianInfo !== null && (
                      <span className="tnum mt-0.5 block text-[10px] text-kreide-52">
                        ±{Math.round(medianInfo.abweichung)} min vom median ({medianInfo.basis}{' '}
                        {medianInfo.basis === 1 ? 'nacht' : 'nächte'})
                      </span>
                    )}
                  </dd>
                </div>
                <div className="min-w-0 px-2.5 py-2.5">
                  <dt className="text-[10px] text-kreide-52">aufgewacht</dt>
                  <dd className="mt-1 truncate">
                    <span className="tnum text-[13px] font-semibold text-kreide">
                      {analyse.hatZeitfensterDaten ? analyse.aufwachUhrzeit : '—'}
                    </span>
                    {analyse.imBettBisUhrzeit !== null && (
                      <span className="tnum mt-0.5 block text-[10px] text-kreide-52">
                        bis {analyse.imBettBisUhrzeit} im bett
                      </span>
                    )}
                  </dd>
                </div>
                <div className="min-w-0 px-2.5 py-2.5">
                  <dt className="text-[10px] text-kreide-52">effizienz</dt>
                  <dd className="tnum mt-1 truncate text-[13px] font-semibold text-kreide">
                    {analyse.effizienz === null ? '—' : `${analyse.effizienz}%`}
                  </dd>
                </div>
              </dl>

              {scoreZeilen.length > 0 && (
                <div className="grid grid-cols-5 divide-x divide-linie border-t border-linie">
                  {scoreZeilen.map((zeile) => (
                    <div key={zeile.id} className="min-w-0 px-1.5 py-2.5">
                      <p className="truncate text-[9px] text-kreide-52">{zeile.label}</p>
                      <p className="tnum mt-1 truncate text-[13px] font-semibold text-kreide">
                        {zeile.wert === null ? '—' : String(Math.round(zeile.wert))}
                      </p>
                      <p className="mt-0.5 truncate text-[8px] text-kreide-52">
                        {zeile.punkte === null ? '(keine punkte)' : `+${zeile.punkte} pt`}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <PhasenZeitstrahl analyse={analyse} />
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
