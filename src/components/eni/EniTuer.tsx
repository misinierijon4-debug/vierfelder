import { EniMarke } from './EniMarke'

type Props = {
  onOeffnen: () => void
}

/**
 * Der Weg zu ENI aus der Anzeigetafel heraus.
 *
 * Hochwertig, ruhig und ausgewogen gestaltet:
 * - 14px Beschriftung fuer klare Lesbarkeit
 * - Mehr Innenraum mit komfortabler 44px-Trefferflaeche
 * - Dezenterer, ruhiger Rand statt harter Kastenkante
 * - Harmonisch proportioniertes Logo
 */
export function EniTuer({ onOeffnen }: Props) {
  return (
    <button
      type="button"
      onClick={onOeffnen}
      aria-label="ENI öffnen"
      className="group relative flex min-h-11 items-center gap-2 rounded-[2px] border border-linie/40 bg-flaeche/70 px-3.5 py-1.5 text-kreide transition-colors hover:border-linie hover:bg-flaeche active:bg-grund focus-visible:outline-2 focus-visible:outline-fokus"
    >
      <EniMarke groesse={17} grund="var(--flaeche)" />
      <span className="display text-[14px] font-bold leading-none tracking-[0.05em] text-kreide transition-colors">
        ENI
      </span>
    </button>
  )
}
