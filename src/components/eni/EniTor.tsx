import { useMemo } from 'react'
import { lokalesMe } from '../../lib/lokal'
import { lokalerEniSpeicher, supabaseEniSpeicher } from '../../lib/eniSpeicher'
import type { DuellKontext } from '../../lib/eniSpeicher'
import type { Backend } from '../../lib/backend'
import { EniApp } from './EniApp'

type Props = {
  art: 'supabase' | 'lokal'
  kontoId: string | null
  onZurueck: () => void
  initialDuellStand?: DuellKontext | null
  /** fuer vorschlaege, die ENI in die app eintragen will */
  backend?: Backend
}

export function EniTor({ art, kontoId, onZurueck, initialDuellStand, backend }: Props) {
  const speicher = useMemo(() => {
    if (art === 'supabase' && kontoId) return supabaseEniSpeicher(kontoId)
    let me: 'erijon' | 'koray' = 'erijon'
    try {
      me = lokalesMe()
    } catch {
      /* ein kaputter prototyp-speicher darf ENI nicht am start hindern */
    }
    return lokalerEniSpeicher(me)
  }, [art, kontoId])

  return (
    <EniApp
      speicher={speicher}
      onZurueck={onZurueck}
      initialDuellStand={initialDuellStand}
      backend={backend}
    />
  )
}
