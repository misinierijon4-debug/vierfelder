import { useMemo } from 'react'
import { lokalesMe } from '../../lib/lokal'
import { lokalerEniSpeicher, supabaseEniSpeicher } from '../../lib/eniSpeicher'
import { EniApp } from './EniApp'

type Props = {
  art: 'supabase' | 'lokal'
  kontoId: string | null
  onZurueck: () => void
}

/**
 * die tür in der lazy geladenen hälfte: hier wird entschieden, wohin der
 * verlauf geht. `EniApp` bekommt den fertigen speicher und weiß deshalb nicht,
 * ob sie gerade gegen supabase oder gegen den prototyp läuft.
 */
export function EniTor({ art, kontoId, onZurueck }: Props) {
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

  return <EniApp speicher={speicher} onZurueck={onZurueck} />
}
