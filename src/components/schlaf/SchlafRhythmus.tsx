import { USERS } from '../../lib/types'
import type { Schlafnacht } from '../../lib/types'
import { formatDauer } from '../../lib/schlafPhasen'

type Props = {
  naechte: Schlafnacht[]
  woche: string[]
}

export function SchlafRhythmus({ naechte, woche }: Props) {
  const wochenNaechte = naechte.filter((nacht) => woche.includes(nacht.nacht))

  const stats = USERS.map((user) => {
    const userNaechte = wochenNaechte.filter(
      (nacht) => nacht.user === user.id && nacht.schlafMinuten > 0
    )
    const gesamtMinuten = userNaechte.reduce((acc, nacht) => acc + nacht.schlafMinuten, 0)
    const schnittMinuten = userNaechte.length > 0 ? gesamtMinuten / userNaechte.length : 0

    const einschlafZeiten = userNaechte
      .map((nacht) => new Date(nacht.einschlafzeit))
      .filter((datum) => !Number.isNaN(datum.getTime()))
      .map((datum) => {
        const minuten = datum.getHours() * 60 + datum.getMinutes()
        return minuten < 12 * 60 ? minuten + 24 * 60 : minuten
      })
    const avgEinschlafMin = einschlafZeiten.length > 0
      ? Math.round(einschlafZeiten.reduce((a, b) => a + b, 0) / einschlafZeiten.length) % (24 * 60)
      : null
    const einschlafAvg = avgEinschlafMin === null
      ? null
      : `${String(Math.floor(avgEinschlafMin / 60)).padStart(2, '0')}:${String(avgEinschlafMin % 60).padStart(2, '0')}`

    return {
      user,
      naechteCount: userNaechte.length,
      schnitt: schnittMinuten,
      einschlafAvg,
    }
  })

  return (
    <section aria-labelledby="rhythmus-titel" className="mt-5">
      <h2 id="rhythmus-titel" className="border-b border-linie pb-2 text-[12px] font-semibold text-kreide">
        wochenrhythmus
      </h2>

      <div className="mt-3 grid grid-cols-2 gap-2.5">
        {stats.map(({ user, naechteCount, schnitt, einschlafAvg }) => (
          <div
            key={user.id}
            className="flex min-h-32 min-w-0 flex-col rounded-[2px] border border-linie bg-flaeche p-3"
            style={{ borderTop: `2px solid ${user.farbe}` }}
          >
            <span className="truncate text-[10px] font-bold uppercase" style={{ color: user.farbe }}>
              {user.name}
            </span>

            {naechteCount > 0 ? (
              <>
                <span className="tnum mt-2 truncate text-[20px] font-bold text-kreide">
                  {formatDauer(schnitt)}
                </span>
                <span className="text-[9px] text-kreide-52">
                  schnitt · {naechteCount} {naechteCount === 1 ? 'nacht' : 'nächte'}
                </span>
                <div className="mt-auto flex items-baseline justify-between gap-2 border-t border-linie pt-2">
                  <span className="truncate text-[9px] text-kreide-52">Ø einschlafen</span>
                  <span className="tnum shrink-0 text-[11px] font-semibold text-kreide">
                    {einschlafAvg ?? '—'}
                  </span>
                </div>
              </>
            ) : (
              <p className="mt-auto mb-auto text-pretty text-[10px] leading-4 text-kreide-52">
                noch keine Health-Daten in dieser Woche
              </p>
            )}
          </div>
        ))}
      </div>
    </section>
  )
}
