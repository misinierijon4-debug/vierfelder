import { memo, useMemo } from 'react'
import { Megaphone } from '@phosphor-icons/react'
import { user as userDef } from '../../lib/types'
import type { UserId, Zustand } from '../../lib/types'
import {
  ansageStand,
  ansageZielText,
  reaktionsLage,
  wirksamerEinsatz,
  zaehltAusZustand,
} from '../../lib/ansagen'
import type { Ansage } from '../../lib/ansagen'
// `heute` wechselt nur mit dem tag: hier steht die frist, der countdown steht im duell
import { fristText } from '../../lib/ansageAnzeige'

type Props = {
  zustand: Zustand
  me: UserId
  heute: Date
  ansagen: Ansage[]
  onZumDuell: () => void
}

/**
 * eine laufende ansage an dich steht im tracker, genau dort, wo man sie
 * einlöst. darf man noch reagieren, steht das dabei. nichts, wenn keine
 * läuft — der platz gehört sonst dem eintragen.
 */
export const AnsageHinweis = memo(function AnsageHinweis({ zustand, me, heute, ansagen, onZumDuell }: Props) {
  const offen = useMemo(() => {
    const zaehlt = zaehltAusZustand(zustand)
    return ansagen
      .filter((a) => a.an === me)
      .map((a) => ({ ansage: a, stand: ansageStand(zaehlt, a, heute), reagieren: reaktionsLage(zaehlt, a, me, heute) }))
      .filter(({ stand }) => stand.status === 'laeuft')
  }, [zustand, me, heute, ansagen])

  if (offen.length === 0) return null
  return (
    <div className="mb-2 space-y-1">
      {offen.map(({ ansage, stand, reagieren }) => {
        const von = userDef(ansage.von)
        const e = wirksamerEinsatz(ansage)
        return (
          <button
            key={ansage.id}
            type="button"
            onClick={onZumDuell}
            className="flex min-h-11 w-full flex-wrap items-center justify-between gap-x-2 gap-y-1 rounded-[2px] border border-linie-hell bg-flaeche px-2.5 py-1 text-left text-[11px] text-kreide-60 hover:bg-linie"
            aria-label={`${von.name} ${ansage.bezug ? 'sagt: du auch' : 'fordert'}: ${ansageZielText(ansage.feld, ansage.ziel)}, ${stand.erreicht} von ${stand.ziel}, es geht um ${e}.${reagieren ? ' du kannst noch reagieren.' : ''} zum duell`}
          >
            <span className="flex min-w-0 items-center gap-1.5">
              <Megaphone size={13} weight="fill" style={{ color: von.farbe }} aria-hidden="true" />
              <span className="font-semibold" style={{ color: von.farbe }}>{von.name}</span>
              <span>{ansage.bezug ? 'sagt du auch:' : 'fordert:'}</span>
              <span className="font-bold text-kreide">{ansageZielText(ansage.feld, ansage.ziel)}</span>
              <span className="tnum">±{e}</span>
            </span>
            <span className="tnum shrink-0 text-kreide">
              {reagieren ? (
                <span className="font-bold" style={{ color: userDef(me).farbe }}>reagieren</span>
              ) : (
                <>
                  {stand.erreicht}/{stand.ziel} · {fristText(ansage)}
                </>
              )}
            </span>
          </button>
        )
      })}
    </div>
  )
})
