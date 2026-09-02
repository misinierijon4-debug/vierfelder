import { AREAS, USERS } from '../lib/types'
import type { AreaId, UserId, Zustand } from '../lib/types'
import { hatTageswert, tagesWert } from '../lib/tracker'

type Props = {
  zustand: Zustand
  /** die sieben tage der woche */
  woche: string[]
}

/**
 * das volumen der woche je bereich und person: die summe der erfassten werte
 * über die sieben tage. minuten und seiten bleiben getrennt, weil sie sich
 * nicht addieren lassen.
 */
export function Volumenzeile({ zustand, woche }: Props) {
  const summeBereich = (u: UserId, a: AreaId): number | null =>
    woche.some((tag) => hatTageswert(zustand, u, a, tag))
      ? woche.reduce((s, tag) => s + tagesWert(zustand, u, a, tag), 0)
      : null

  const summeEinheit = (u: UserId, einheit: 'min' | 'seiten'): number | null => {
    const werte = AREAS.filter((a) => a.unit === einheit).map((a) => summeBereich(u, a.id))
    const erfasst = werte.filter((wert): wert is number => wert !== null)
    return erfasst.length > 0 ? erfasst.reduce((summe, wert) => summe + wert, 0) : null
  }

  const summeMin = (u: UserId) => summeEinheit(u, 'min')
  const summeSeiten = (u: UserId) => summeEinheit(u, 'seiten')

  const leer = USERS.every((u) => summeMin(u.id) === null && summeSeiten(u.id) === null)

  if (leer) {
    return (
      <div className="border-y border-linie px-3 py-2 text-[12px] text-kreide-52">
        noch kein volumen diese woche
      </div>
    )
  }

  return (
    <div aria-label="volumen der woche" className="border-y border-linie">
      <div className="grid grid-cols-[1fr_64px_64px] items-baseline px-3 py-2 text-[11px] text-kreide-52">
        <span>volumen der woche</span>
        {USERS.map((u) => (
          <span key={u.id} className="text-right">
            {u.name}
          </span>
        ))}
      </div>

      <div className="divide-y divide-linie border-t border-linie">
        {AREAS.map((a) => (
          <div key={a.id} className="grid grid-cols-[1fr_64px_64px] items-baseline px-3 py-2">
            <span className="text-[11px] text-kreide-52">{a.label}</span>
            {USERS.map((u) => (
              <span
                key={u.id}
                className="tnum text-right text-[13px] font-semibold"
                style={{ color: u.farbe }}
              >
                {summeBereich(u.id, a.id) ?? '—'}
              </span>
            ))}
          </div>
        ))}

        <div className="grid grid-cols-[1fr_64px_64px] items-baseline px-3 py-2">
          <span className="text-[11px] text-kreide-52">Σ min</span>
          {USERS.map((u) => (
            <span
              key={u.id}
              className="tnum text-right text-[13px] font-semibold"
              style={{ color: u.farbe }}
            >
              {summeMin(u.id) ?? '—'}
            </span>
          ))}
        </div>

        <div className="grid grid-cols-[1fr_64px_64px] items-baseline px-3 py-2">
          <span className="text-[11px] text-kreide-52">Σ seiten</span>
          {USERS.map((u) => (
            <span
              key={u.id}
              className="tnum text-right text-[13px] font-semibold"
              style={{ color: u.farbe }}
            >
              {summeSeiten(u.id) ?? '—'}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
