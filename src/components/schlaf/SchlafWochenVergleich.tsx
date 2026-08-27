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
  for (const nacht of naechte) {
    nachUser.get(nacht.user)?.set(nacht.nacht, nacht)
  }

  // Höchste Schlafdauer für die Skalierung (mindestens 8 Stunden)
  const alleMinuten = naechte
    .filter((n) => woche.includes(n.nacht))
    .map((n) => n.schlafMinuten)
  const maxMinuten = Math.max(8 * 60, ...alleMinuten, 10 * 60)

  // Wochenschnitt pro Nutzer
  const schnitte = USERS.map((u) => {
    const userNaechte = woche
      .map((tag) => nachUser.get(u.id)?.get(tag))
      .filter((n): n is Schlafnacht => Boolean(n && n.schlafMinuten > 0))
    const summe = userNaechte.reduce((acc, n) => acc + n.schlafMinuten, 0)
    const schnitt = userNaechte.length > 0 ? summe / userNaechte.length : 0
    return { user: u, schnitt, anzahl: userNaechte.length }
  })

  return (
    <section aria-labelledby="schlaf-wochenuebersicht" className="mt-2">
      {/* Header mit Wochenschnitt im Head-to-Head */}
      <div className="mb-3 flex items-center justify-between rounded-[2px] border border-linie bg-flaeche px-3 py-2">
        {schnitte.map(({ user, schnitt, anzahl }) => (
          <div key={user.id} className="flex items-center gap-2">
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: user.farbe }}
            />
            <div>
              <span className="text-[11px] text-kreide-52">{user.name}: </span>
              <span className="tnum text-[12px] font-semibold text-kreide">
                {anzahl > 0 ? formatDauer(schnitt) : '--'}
              </span>
              <span className="ml-1 text-[10px] text-kreide-52">Ø</span>
            </div>
          </div>
        ))}
      </div>

      {/* 7 Tage Wochenraster */}
      <div className="grid grid-cols-7 gap-1.5">
        {woche.map((tag, idx) => {
          const istGewaehlt = tag === gewaehlterTag
          const erijonNacht = nachUser.get('erijon')?.get(tag)
          const korayNacht = nachUser.get('koray')?.get(tag)

          const erijonMin = erijonNacht?.schlafMinuten ?? 0
          const korayMin = korayNacht?.schlafMinuten ?? 0

          const erijonHoeheProzent = (erijonMin / maxMinuten) * 100
          const korayHoeheProzent = (korayMin / maxMinuten) * 100

          return (
            <button
              key={tag}
              type="button"
              onClick={() => onTagWaehlen(tag)}
              className={`relative flex flex-col items-center rounded-[2px] border p-1.5 transition-all duration-150 focus-visible:outline-none ${
                istGewaehlt
                  ? 'border-linie-hell bg-flaeche shadow-sm'
                  : 'border-linie/60 bg-flaeche/40 hover:border-linie hover:bg-flaeche'
              }`}
            >
              {/* Wochentag-Label */}
              <span
                className={`text-[11px] font-medium ${
                  istGewaehlt ? 'text-kreide' : 'text-kreide-52'
                }`}
              >
                {TAGKUERZEL[idx]}
              </span>

              {/* Säulenbereich */}
              <div className="relative my-2 flex h-28 w-full items-end justify-center gap-1">
                {/* 8h Referenzlinie */}
                <div
                  className="pointer-events-none absolute w-full border-b border-dashed border-linie/40"
                  style={{ bottom: `${(480 / maxMinuten) * 100}%` }}
                />

                {/* Erijon Balken */}
                <div className="flex h-full w-2.5 flex-col items-center justify-end">
                  {erijonMin > 0 && (
                    <motion.div
                      initial={{ scaleY: 0 }}
                      animate={{ scaleY: 1 }}
                      transition={{ duration: 0.3 }}
                      className="w-full rounded-t-[1px]"
                      style={{
                        height: `${Math.max(4, erijonHoeheProzent)}%`,
                        backgroundColor: 'var(--erijon)',
                        transformOrigin: 'bottom',
                      }}
                    />
                  )}
                </div>

                {/* Koray Balken */}
                <div className="flex h-full w-2.5 flex-col items-center justify-end">
                  {korayMin > 0 && (
                    <motion.div
                      initial={{ scaleY: 0 }}
                      animate={{ scaleY: 1 }}
                      transition={{ duration: 0.3, delay: 0.05 }}
                      className="w-full rounded-t-[1px]"
                      style={{
                        height: `${Math.max(4, korayHoeheProzent)}%`,
                        backgroundColor: 'var(--koray)',
                        transformOrigin: 'bottom',
                      }}
                    />
                  )}
                </div>
              </div>

              {/* Direkte Stundenanzeige pro Tag */}
              <div className="flex flex-col items-center text-[10px] leading-tight">
                {erijonMin > 0 ? (
                  <span className="tnum font-medium text-kreide" style={{ color: 'var(--erijon)' }}>
                    {(erijonMin / 60).toFixed(1)}h
                  </span>
                ) : (
                  <span className="text-kreide-52">--</span>
                )}
                {korayMin > 0 && (
                  <span className="tnum font-medium text-kreide" style={{ color: 'var(--koray)' }}>
                    {(korayMin / 60).toFixed(1)}h
                  </span>
                )}
              </div>
            </button>
          )
        })}
      </div>
    </section>
  )
}
