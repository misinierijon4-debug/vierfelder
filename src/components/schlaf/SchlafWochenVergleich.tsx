import { motion } from 'motion/react'
import { TAGKUERZEL } from '../../lib/dates'
import { USERS } from '../../lib/types'
import type { Schlafnacht, UserId } from '../../lib/types'
import { formatDauer } from '../../lib/schlafPhasen'

type Props = {
  naechte: Schlafnacht[]
  woche: string[]
  gewaehlterTag: string
  onTagWaehlen: (tag: string) => void
}

export function SchlafWochenVergleich({ naechte, woche, gewaehlterTag, onTagWaehlen }: Props) {
  const nachUser = new Map<UserId, Map<string, Schlafnacht>>()
  for (const user of USERS) nachUser.set(user.id, new Map())
  for (const nacht of naechte) nachUser.get(nacht.user)?.set(nacht.nacht, nacht)

  const schnitte = USERS.map((user) => {
    const userNaechte = woche
      .map((tag) => nachUser.get(user.id)?.get(tag))
      .filter((nacht): nacht is Schlafnacht => Boolean(nacht && nacht.schlafMinuten > 0))
    const summe = userNaechte.reduce((acc, nacht) => acc + nacht.schlafMinuten, 0)
    return {
      user,
      schnitt: userNaechte.length > 0 ? summe / userNaechte.length : 0,
      anzahl: userNaechte.length,
    }
  })

  const maxMinuten = 10 * 60

  return (
    <section aria-labelledby="schlaf-wochenuebersicht" className="mt-2">
      <div className="mb-2.5 flex items-end justify-between">
        <h2 id="schlaf-wochenuebersicht" className="text-[12px] font-semibold text-kreide">
          diese woche
        </h2>
        <div className="flex items-center gap-1.5 text-[10px] text-kreide-52">
          <span className="block w-4 border-t border-dashed border-linie-hell" aria-hidden="true" />
          <span>8h ziel</span>
        </div>
      </div>

      <div className="overflow-hidden rounded-[2px] border border-linie bg-flaeche">
        <div className="grid grid-cols-2 divide-x divide-linie">
          {schnitte.map(({ user, schnitt, anzahl }) => (
            <div key={user.id} className="min-w-0 px-3 py-2.5">
              <div className="flex items-center gap-1.5 text-[11px]">
                <span className="size-2 rounded-full" style={{ backgroundColor: user.farbe }} />
                <span className="truncate text-kreide-52">{user.name}</span>
              </div>
              {anzahl > 0 ? (
                <div className="mt-1 flex items-baseline justify-between gap-2">
                  <span className="tnum truncate text-[17px] font-bold text-kreide">
                    {formatDauer(schnitt)}
                  </span>
                  <span className="shrink-0 text-[10px] text-kreide-52">
                    {anzahl} {anzahl === 1 ? 'nacht' : 'nächte'}
                  </span>
                </div>
              ) : (
                <p className="mt-1 text-[11px] text-kreide-52">noch keine daten</p>
              )}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 border-t border-linie">
          {woche.map((tag, idx) => {
            const istGewaehlt = tag === gewaehlterTag
            const erijonMin = nachUser.get('erijon')?.get(tag)?.schlafMinuten ?? 0
            const korayMin = nachUser.get('koray')?.get(tag)?.schlafMinuten ?? 0
            const hatDaten = erijonMin > 0 || korayMin > 0
            const erijonHoehe = Math.min(100, (erijonMin / maxMinuten) * 100)
            const korayHoehe = Math.min(100, (korayMin / maxMinuten) * 100)

            return (
              <button
                key={tag}
                type="button"
                aria-pressed={istGewaehlt}
                aria-label={`${TAGKUERZEL[idx]}, ${hatDaten ? 'Schlafdaten anzeigen' : 'keine Schlafdaten'}`}
                onClick={() => onTagWaehlen(tag)}
                className={`relative min-w-0 px-0.5 pb-2 pt-2.5 transition-colors duration-150 focus-visible:z-10 focus-visible:outline-none ${
                  istGewaehlt ? 'bg-grund/70' : 'hover:bg-grund/35'
                }`}
              >
                <span className={`text-[10px] font-bold uppercase ${istGewaehlt ? 'text-kreide' : 'text-kreide-52'}`}>
                  {TAGKUERZEL[idx]}
                </span>

                <div className="relative mx-auto my-2.5 flex h-16 w-full items-end justify-center gap-1">
                  <span
                    className="pointer-events-none absolute inset-x-0 border-t border-dashed border-linie-hell/50"
                    style={{ bottom: `${(480 / maxMinuten) * 100}%` }}
                    aria-hidden="true"
                  />
                  <div className="flex h-full w-2 flex-col justify-end overflow-hidden bg-grund">
                    {erijonMin > 0 && (
                      <motion.span
                        initial={{ scaleY: 0 }}
                        animate={{ scaleY: 1 }}
                        transition={{ duration: 0.18 }}
                        className="block w-full origin-bottom"
                        style={{ height: `${Math.max(6, erijonHoehe)}%`, backgroundColor: 'var(--erijon)' }}
                      />
                    )}
                  </div>
                  <div className="flex h-full w-2 flex-col justify-end overflow-hidden bg-grund">
                    {korayMin > 0 && (
                      <motion.span
                        initial={{ scaleY: 0 }}
                        animate={{ scaleY: 1 }}
                        transition={{ duration: 0.18 }}
                        className="block w-full origin-bottom"
                        style={{ height: `${Math.max(6, korayHoehe)}%`, backgroundColor: 'var(--koray)' }}
                      />
                    )}
                  </div>
                </div>

                <div className="flex h-7 flex-col items-center justify-center text-[9px] font-semibold leading-[13px]">
                  {erijonMin > 0 && (
                    <span className="tnum" style={{ color: 'var(--erijon)' }}>
                      {(erijonMin / 60).toFixed(1)}h
                    </span>
                  )}
                  {korayMin > 0 && (
                    <span className="tnum" style={{ color: 'var(--koray)' }}>
                      {(korayMin / 60).toFixed(1)}h
                    </span>
                  )}
                  {!hatDaten && <span className="text-kreide-52">—</span>}
                </div>

                {istGewaehlt && (
                  <span className="absolute inset-x-2 bottom-0 h-0.5 bg-kreide" aria-hidden="true" />
                )}
              </button>
            )
          })}
        </div>
      </div>
    </section>
  )
}
