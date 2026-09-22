import { memo, useEffect, useMemo, useState } from 'react'
import { ShieldCheck } from '@phosphor-icons/react'
import { user as userDef } from '../../lib/types'
import type { UserId, Zustand } from '../../lib/types'
import { duellTickerEintraege } from '../../lib/duell'
import type { DruckStatus } from '../../lib/duell'
import { BADGE_KURZ, BADGE_LANG, heuristischesBadge } from '../../lib/duellBadge'
import type { RivalitaetsBadge } from '../../lib/duellBadge'

type Props = {
  zustand: Zustand
  woche: string[]
  me: UserId
  kompakt?: boolean
  limit?: number
  /** die drucklage der laufenden woche; ohne sie bleibt das badge neutral */
  druck?: DruckStatus
}

/**
 * Feste breite für jedes badge.
 *
 * Das urteil kommt asynchron und kann sich ändern, sobald der dienst antwortet
 * — „routine“ heute, „kraftakt“ eine sekunde später. Ein kasten, der mit dem
 * wort wächst, würde in genau dem moment die zeitangabe verschieben. Deshalb
 * steht die breite vorher fest und nur der text darin wechselt.
 */
const BADGE_STIL =
  'inline-block min-w-[62px] shrink-0 rounded-[2px] border border-linie px-1 py-0.5 text-center text-[9px] font-semibold text-kreide'

/** im kompaktmodus fällt nur auf, was die lage wirklich dreht */
const KOMPAKT_AKZENT: readonly RivalitaetsBadge[] = ['konter', 'aufholjagd']

export const RivalitaetsTicker = memo(function RivalitaetsTicker({
  zustand,
  woche,
  me,
  kompakt = false,
  limit = 5,
  druck = 'offen',
}: Props) {
  const [jetzt, setJetzt] = useState(() => new Date())
  useEffect(() => {
    const timer = window.setInterval(() => setJetzt(new Date()), 60_000)
    return () => window.clearInterval(timer)
  }, [])
  const eintraege = useMemo(
    () => duellTickerEintraege(zustand, woche, jetzt, limit),
    [zustand, woche, jetzt, limit]
  )

  const [badges, setBadges] = useState<Record<string, RivalitaetsBadge>>({})
  const ids = eintraege.map((e) => e.id).join('|')
  useEffect(() => {
    let aktiv = true
    const anreichern = async () => {
      // erst hier geladen, nicht oben: die zuordnung samt anweisungstexten und
      // http-teil gehört nicht in den kaltstart. Bis der chunk da ist, steht
      // die heuristik im badge.
      const { klassifiziereTickerEreignis } = await import('../../lib/duellKlassifizierung')
      if (!aktiv) return
      const urteile = await Promise.all(
        eintraege.map((eintrag) =>
          klassifiziereTickerEreignis({
            eintrag,
            druckStatus: druck,
            istIch: eintrag.userId === me,
          }),
        ),
      )
      if (!aktiv) return
      setBadges((alt) => {
        const neu: Record<string, RivalitaetsBadge> = {}
        eintraege.forEach((eintrag, i) => {
          neu[eintrag.id] = urteile[i]!
        })
        const unveraendert =
          Object.keys(neu).length === Object.keys(alt).length &&
          Object.entries(neu).every(([id, wert]) => alt[id] === wert)
        return unveraendert ? alt : neu
      })
    }
    // Der einzige weg hier heraus ist ein chunk, der offline nicht kommt.
    // Dann bleibt stehen, was schon steht — kein grund, jemandem etwas zu sagen.
    void anreichern().catch(() => {})
    return () => {
      aktiv = false
    }
    // `eintraege` entsteht bei jedem rendern neu und taugt nicht als abhängigkeit;
    // `ids` ist derselbe inhalt als stabiler schlüssel.
  }, [ids, druck, me])

  /** solange der dienst noch antwortet, steht die heuristik da — nie eine lücke */
  const badgeVon = (eintragId: string, istIch: boolean): RivalitaetsBadge =>
    badges[eintragId] ?? heuristischesBadge(druck, istIch)

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
    const badge = badgeVon(top.id, istIch)
    const akzent = KOMPAKT_AKZENT.includes(badge)

    return (
      <div className="mb-2 flex min-h-11 flex-wrap items-center justify-between gap-x-2 gap-y-1 rounded-[2px] border border-linie bg-flaeche/60 px-2.5 py-1 text-[11px] text-kreide-60 min-[260px]:flex-nowrap">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
          <span
            className="inline-block size-1.5 rounded-full"
            style={{ background: u.farbe }}
            aria-hidden="true"
          />
          <span className="font-semibold" style={{ color: u.farbe }}>
            {istIch ? 'du' : u.name}
          </span>
          <span>·</span>
          <span className="min-w-0 break-words text-kreide">{top.feld}</span>
          {top.zusatz && <span className="tnum min-w-0 break-words text-kreide-52">({top.zusatz})</span>}
          {top.quelle === 'gemessen' && (
            <span className="inline-flex items-center gap-0.5 rounded-[1px] bg-linie px-1 py-0.5 text-[9px] font-semibold text-kreide">
              <ShieldCheck size={10} weight="bold" aria-hidden="true" />
              gemessen
            </span>
          )}
        </div>
        {/* der platz steht immer, auch wenn nichts darin steht: sonst rutschte
            die zeitangabe, sobald der dienst „konter“ meldet */}
        <span
          className={BADGE_STIL + (akzent ? '' : ' invisible')}
          title={akzent ? BADGE_LANG[badge] : undefined}
        >
          {BADGE_KURZ[badge]}
        </span>
        <span className="shrink-0 text-[10px] text-kreide-52">{top.relativeZeit}</span>
      </div>
    )
  }

  return (
    <div className="divide-y divide-linie border-y border-linie">
      {eintraege.map((e) => {
        const u = userDef(e.userId)
        const istIch = e.userId === me
        const badge = badgeVon(e.id, istIch)
        return (
          <div
            key={e.id}
            className="flex min-h-12 flex-wrap items-center justify-between gap-x-2 gap-y-1 bg-flaeche/35 px-3 py-2 text-[12px] min-[260px]:flex-nowrap"
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
              <span className="min-w-0 break-words text-kreide font-medium">{e.feld}</span>
              {e.zusatz && (
                <span className="tnum min-w-0 break-words text-[11px] text-kreide-52">
                  {e.zusatz}
                </span>
              )}
              {e.quelle === 'gemessen' ? (
                <span className="inline-flex items-center gap-1 rounded-[2px] border border-linie-hell bg-linie/40 px-1.5 py-0.5 text-[10px] font-semibold text-kreide">
                  <ShieldCheck size={12} weight="fill" className="text-kreide" aria-hidden="true" />
                  verifiziert
                </span>
              ) : (
                <span className="rounded-[2px] border border-linie px-1 py-0.5 text-[10px] text-kreide-52">
                  getippt
                </span>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <span className={BADGE_STIL} title={BADGE_LANG[badge]}>
                {BADGE_KURZ[badge]}
              </span>
              <span className="text-[11px] text-kreide-52">{e.relativeZeit}</span>
            </div>
          </div>
        )
      })}
    </div>
  )
})
