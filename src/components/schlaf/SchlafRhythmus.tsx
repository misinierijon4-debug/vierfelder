import { USERS } from '../../lib/types'
import type { Schlafnacht } from '../../lib/types'
import { formatDauer } from '../../lib/schlafPhasen'

type Props = {
  naechte: Schlafnacht[]
  woche: string[]
}

export function SchlafRhythmus({ naechte, woche }: Props) {
  const wochenNaechte = naechte.filter((n) => woche.includes(n.nacht))

  const stats = USERS.map((u) => {
    const userNaechte = wochenNaechte.filter((n) => n.user === u.id && n.schlafMinuten > 0)
    const gesamtMinuten = userNaechte.reduce((acc, n) => acc + n.schlafMinuten, 0)
    const schnittMinuten = userNaechte.length > 0 ? gesamtMinuten / userNaechte.length : 0

    // Durchschnittliche Einschlafzeit (Minuten ab Mitternacht)
    let avgEinschlafMin: number | null = null
    if (userNaechte.length > 0) {
      const einschlafZeiten = userNaechte.map((n) => {
        const d = new Date(n.einschlafzeit)
        const min = d.getHours() * 60 + d.getMinutes()
        return min < 12 * 60 ? min + 24 * 60 : min
      })
      const sum = einschlafZeiten.reduce((a, b) => a + b, 0)
      avgEinschlafMin = Math.round(sum / einschlafZeiten.length) % (24 * 60)
    }

    const avgEinschlafFormat =
      avgEinschlafMin !== null
        ? `${String(Math.floor(avgEinschlafMin / 60)).padStart(2, '0')}:${String(
            avgEinschlafMin % 60
          ).padStart(2, '0')} Uhr`
        : '--:--'

    return {
      user: u,
      naechteCount: userNaechte.length,
      gesamt: gesamtMinuten,
      schnitt: schnittMinuten,
      einschlafAvg: avgEinschlafFormat,
    }
  })

  return (
    <section aria-labelledby="rhythmus-titel" className="mt-5">
      <h2 id="rhythmus-titel" className="border-b border-linie pb-2 text-[12px] font-normal text-kreide-52">
        wochen-rhythmus & duell
      </h2>

      <div className="mt-3 grid grid-cols-2 gap-2">
        {stats.map(({ user, naechteCount, gesamt, schnitt, einschlafAvg }) => (
          <div
            key={user.id}
            className="rounded-[2px] border border-linie bg-flaeche p-3"
            style={{ borderLeft: `3px solid ${user.farbe}` }}
          >
            <span className="text-[12px] font-medium" style={{ color: user.farbe }}>
              {user.name}
            </span>

            <div className="mt-2 space-y-1.5 text-[11px]">
              <div className="flex justify-between">
                <span className="text-kreide-52">wochenschnitt:</span>
                <span className="tnum font-medium text-kreide">
                  {naechteCount > 0 ? formatDauer(schnitt) : '--'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-kreide-52">gesamt geschlafen:</span>
                <span className="tnum font-medium text-kreide">
                  {naechteCount > 0 ? formatDauer(gesamt) : '--'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-kreide-52">Ø einschlafen:</span>
                <span className="tnum font-medium text-kreide">{einschlafAvg}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
