import { CaretRight } from '@phosphor-icons/react'
import type { Fach, Note } from '../../lib/types'
import { brauchtFuerSchnitt, fachSchnitt, trend } from '../../lib/noten'
import { Zahl } from '../Zahl'
import { Trendlinie } from './Trendlinie'

export function Fachzeile({ fach, noten, onOeffnen }: { fach: Fach; noten: Note[]; onOeffnen: () => void }) {
  const schnitt = fachSchnitt(noten, fach).gesamt
  const braucht = brauchtFuerSchnitt(noten, fach)
  return (
    <li className="border-b border-linie">
      <button type="button" onClick={onOeffnen} className="flex min-h-16 w-full items-center gap-3 py-2 text-left active:translate-y-px">
        <span className="min-w-0 flex-1">
          <span className="display block truncate text-[18px] font-semibold lowercase leading-none">{fach.name}</span>
          <span className="mt-1 block text-[11px] text-kreide-52">{fach.kursart} · {fachSchnitt(noten, fach).anzahl || 'keine'} noten</span>
          {braucht !== null && (
            <span className="mt-0.5 block text-[10px] text-kreide-52">nächste klausur hält schnitt ab {braucht} {braucht === 1 ? 'punkt' : 'punkten'}</span>
          )}
        </span>
        <Trendlinie werte={trend(noten, fach.id)} />
        <span className="w-12 text-right">
          {schnitt === null ? <span className="tnum text-[18px] text-kreide-52">–</span> : <Zahl value={schnitt.toFixed(1).replace('.', ',')} className="text-[18px] font-semibold" />}
        </span>
        <CaretRight size={14} className="shrink-0 text-kreide-52" aria-hidden="true" />
      </button>
    </li>
  )
}
