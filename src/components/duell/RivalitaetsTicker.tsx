import { useEffect, useState } from 'react'
import { ShieldCheck } from '@phosphor-icons/react'
import { user as userDef } from '../../lib/types'
import type { UserId, Zustand } from '../../lib/types'
import { duellTickerEintraege } from '../../lib/duell'

type Props = {
  zustand: Zustand
  woche: string[]
  me: UserId
  kompakt?: boolean
  limit?: number
}

export function RivalitaetsTicker({ zustand, woche, me, kompakt = false, limit = 5 }: Props) {
  const [jetzt, setJetzt] = useState(() => new Date())
  useEffect(() => {
    const timer = window.setInterval(() => setJetzt(new Date()), 60_000)
    return () => window.clearInterval(timer)
  }, [])
  const eintraege = duellTickerEintraege(zustand, woche, jetzt, limit)

  if (eintraege.length === 0) {
    return kompakt ? null : (
      <div className="rounded-[2px] border border-linie bg-flaeche p-3 text-center text-[12px] text-kreide-52">
        noch keine aktivitäten diese woche
      </div>
    )
  }

  if (kompakt) {
    const top = eintraege[0]
    const u = userDef(top.userId)
    const istIch = top.userId === me

    return (
      <div className="mb-2 flex min-h-11 items-center justify-between gap-2 rounded-[2px] border border-linie bg-flaeche/60 px-2.5 py-1 text-[11px] text-kreide-60">
        <div className="flex min-w-0 items-center gap-1.5 truncate">
          <span
            className="inline-block size-1.5 rounded-full"
            style={{ background: u.farbe }}
            aria-hidden="true"
          />
          <span className="font-semibold" style={{ color: u.farbe }}>
            {istIch ? 'du' : u.name}
          </span>
          <span>·</span>
          <span className="text-kreide">{top.feld}</span>
          {top.zusatz && <span className="tnum text-kreide-52">({top.zusatz})</span>}
          {top.quelle === 'gemessen' && (
            <span className="inline-flex items-center gap-0.5 rounded-[1px] bg-linie px-1 py-0.2 text-[9px] font-semibold text-kreide">
              <ShieldCheck size={10} weight="bold" />
              gemessen
            </span>
          )}
        </div>
        <span className="shrink-0 text-[10px] text-kreide-52">{top.relativeZeit}</span>
      </div>
    )
  }

  return (
    <div className="divide-y divide-linie border-y border-linie">
      {eintraege.map((e) => {
        const u = userDef(e.userId)
        const istIch = e.userId === me
        return (
          <div
            key={e.id}
            className="flex min-h-12 items-center justify-between gap-2 bg-flaeche/35 px-3 py-2 text-[12px]"
          >
            <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
              <span
                className="size-2 rounded-full"
                style={{ background: u.farbe }}
                aria-hidden="true"
              />
              <span className="font-semibold" style={{ color: u.farbe }}>
                {istIch ? 'du' : u.name}
              </span>
              <span className="text-kreide font-medium">{e.feld}</span>
              {e.zusatz && (
                <span className="tnum text-[11px] text-kreide-52">
                  {e.zusatz}
                </span>
              )}
              {e.quelle === 'gemessen' ? (
                <span className="inline-flex items-center gap-1 rounded-[2px] border border-linie-hell bg-linie/40 px-1.5 py-0.5 text-[10px] font-semibold text-kreide">
                  <ShieldCheck size={12} weight="fill" className="text-kreide" />
                  verifiziert
                </span>
              ) : (
                <span className="rounded-[2px] border border-linie px-1 py-0.5 text-[10px] text-kreide-52">
                  getippt
                </span>
              )}
            </div>
            <span className="shrink-0 text-[11px] text-kreide-52">{e.relativeZeit}</span>
          </div>
        )
      })}
    </div>
  )
}
