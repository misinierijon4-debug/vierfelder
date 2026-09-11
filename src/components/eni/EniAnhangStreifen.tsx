import { FileText, X } from '@phosphor-icons/react'
import { lesbareGroesse } from '../../lib/eniAnhang'
import type { VorbereiteterAnhang } from '../../lib/eniAnhang'

type Props = {
  anhaenge: VorbereiteterAnhang[]
  /** solange ENI prüft, wird nichts mehr entfernt */
  gesperrt: boolean
  onEntfernen: (id: string) => void
}

/**
 * Was mitgeht, bevor es mitgeht. Der Streifen sitzt im selben Rahmen wie das
 * Feld und die Knöpfe, aber über dem Text und nicht darin: ein Bild mitten im
 * Textfluss verschöbe die Schreibmarke, und auf einem Telefon spränge dann bei
 * jedem Anhang die halbe Ansicht.
 *
 * Bilder stehen als Bild da, Dateien als Name mit Größe. Beides ist die
 * Wahrheit über das, was ENI gleich zu sehen bekommt: bei einem Bild sieht er
 * dasselbe wie du, bei einer Datei liest er den Text, nicht das Symbol.
 */
export function EniAnhangStreifen({ anhaenge, gesperrt, onEntfernen }: Props) {
  if (anhaenge.length === 0) return null

  return (
    <ul aria-label="was du mitschickst" className="flex flex-wrap gap-2 px-3 pt-3">
      {anhaenge.map((anhang) => (
        <li key={anhang.id} className="relative">
          {anhang.art === 'bild' ? (
            <img
              src={anhang.vorschau}
              alt={anhang.name}
              className="size-16 rounded-[2px] border border-linie object-cover"
            />
          ) : (
            <div className="flex h-16 max-w-[190px] items-center gap-2 rounded-[2px] border border-linie px-2.5">
              <FileText size={16} aria-hidden="true" className="shrink-0 text-kreide-52" />
              <span className="min-w-0">
                <span className="block truncate text-[12px] text-kreide">{anhang.name}</span>
                <span className="tnum block text-[10px] text-kreide-52">
                  {lesbareGroesse(anhang.groesse)}
                  {anhang.gekuerzt ? ' · gekürzt' : ''}
                </span>
              </span>
            </div>
          )}

          <button
            type="button"
            disabled={gesperrt}
            onClick={() => onEntfernen(anhang.id)}
            aria-label={`${anhang.name} entfernen`}
            /* der knopf sitzt in der ecke und ist trotzdem elf pixel gross
               genug zum treffen: die flaeche greift ueber den rand hinaus. */
            className="absolute -right-1.5 -top-1.5 flex size-6 items-center justify-center rounded-full border border-linie bg-grund text-kreide-60 disabled:opacity-40"
          >
            <X size={11} weight="bold" aria-hidden="true" />
          </button>
        </li>
      ))}
    </ul>
  )
}
