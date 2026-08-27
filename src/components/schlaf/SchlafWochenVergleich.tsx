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

  // Wochenschnitt pro Nutzer
  const schnitte = USERS.map((u) => {
    const userNaechte = woche
      .map((tag) => nachUser.get(u.id)?.get(tag))
      .filter((n): n is Schlafnacht => Boolean(n && n.schlafMinuten > 0))
    const summe = userNaechte.reduce((acc, n) => acc + n.schlafMinuten, 0)
    const schnitt = userNaechte.length > 0 ? summe / userNaechte.length : 0
    return { user: u, schnitt, anzahl: userNaechte.length }
  })

  const maxMinuten = 10 * 60 // 10 Stunden Maximalhöhe für die Säulen

  return (
    <section aria-labelledby="schlaf-wochenuebersicht" className="mt-2">
      {/* Head-to-Head Wochenschnitt */}
      <div className="mb-3 flex items-center justify-between rounded-[2px] border border-linie bg-flaeche px-3.5 py-2.5">
        {schnitte.map(({ user, schnitt, anzahl }) => (
          <div key={user.id} className="flex items-center gap-2">
            <span
              className="h-2.5 w-2.5 flex-shrink-0 rounded-full"
              style={{ backgroundColor: user.farbe }}
            />
            <span className="text-[11px] text-kreide-52">{user.name}:</span>
            <span className="tnum text-[13px] font-bold text-kreide">
              {anzahl > 0 ? formatDauer(schnitt) : '--'}
            </span>
            <span className="text-[10px] text-kreide-52">Ø</span>
          </div>
        ))}
      </div>

      {/* 7-Tage-Scoreboard */}
      <div className="grid grid-cols-7 gap-1">
        {woche.map((tag, idx) => {
          const istGewaehlt = tag === gewaehlterTag
          const erijonNacht = nachUser.get('erijon')?.get(tag)
          const korayNacht = nachUser.get('koray')?.get(tag)

          const erijonMin = erijonNacht?.schlafMinuten ?? 0
          const korayMin = korayNacht?.schlafMinuten ?? 0

          const erijonHoehe = Math.min(100, (erijonMin / maxMinuten) * 100)
          const korayHoehe = Math.min(100, (korayMin / maxMinuten) * 100)

          return (
            <button
              key={tag}
              type="button"
              onClick={() => onTagWaehlen(tag)}
              className={`relative flex flex-col items-center rounded-[2px] border py-2 px-1 transition-all duration-150 focus-visible:outline-none ${
                istGewaehlt
                  ? 'border-linie-hell bg-flaeche shadow-sm'
                  : 'border-linie/40 bg-flaeche/30 hover:border-linie hover:bg-flaeche/70'
              }`}
            >
              {/* Wochentags-Kürzel */}
              <span
                className={`text-[11px] font-semibold uppercase tracking-wider ${
                  istGewaehlt ? 'text-kreide' : 'text-kreide-52'
                }`}
              >
                {TAGKUERZEL[idx]}
              </span>

              {/* Säulen-Spur mit 8h-Referenz */}
              <div className="relative my-2.5 flex h-24 w-full items-end justify-center gap-1">
                {/* 8h Orientierungslinie */}
                <div
                  className="pointer-events-none absolute w-full border-b border-dashed border-linie/50"
                  style={{ bottom: `${(480 / maxMinuten) * 100}%` }}
                />

                {/* Erijon Spur */}
                <div className="flex h-full w-2 flex-col justify-end overflow-hidden rounded-t-[1px] bg-grund/60">
                  {erijonMin > 0 && (
                    <motion.div
                      initial={{ scaleY: 0 }}
                      animate={{ scaleY: 1 }}
                      transition={{ duration: 0.25 }}
                      className="w-full"
                      style={{
                        height: `${Math.max(6, erijonHoehe)}%`,
                        backgroundColor: 'var(--erijon)',
                        transformOrigin: 'bottom',
                      }}
                    />
                  )}
                </div>

                {/* Koray Spur */}
                <div className="flex h-full w-2 flex-col justify-end overflow-hidden rounded-t-[1px] bg-grund/60">
                  {korayMin > 0 && (
                    <motion.div
                      initial={{ scaleY: 0 }}
                      animate={{ scaleY: 1 }}
                      transition={{ duration: 0.25, delay: 0.04 }}
                      className="w-full"
                      style={{
                        height: `${Math.max(6, korayHoehe)}%`,
                        backgroundColor: 'var(--koray)',
                        transformOrigin: 'bottom',
                      }}
                    />
                  )}
                </div>
              </div>

              {/* Stunden-Werte unten */}
              <div className="flex flex-col items-center text-[10px] leading-tight font-medium">
                <span className="tnum" style={{ color: erijonMin > 0 ? 'var(--erijon)' : 'var(--kreide-52)' }}>
                  {erijonMin > 0 ? `${(erijonMin / 60).toFixed(1)}h` : '--'}
                </span>
                <span className="tnum" style={{ color: korayMin > 0 ? 'var(--koray)' : 'var(--kreide-52)' }}>
                  {korayMin > 0 ? `${(korayMin / 60).toFixed(1)}h` : '--'}
                </span>
              </div>
            </button>
          )
        })}
      </div>
    </section>
  )
}
