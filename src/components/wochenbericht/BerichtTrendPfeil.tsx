import { alsDelta } from '../../lib/wochenbericht'

type Props = {
  /** differenz zur vorwoche; null heisst: es gibt keine vergleichbare vorwoche */
  delta: number | null
  einheit?: '' | 'm'
  /**
   * ob mehr besser ist. beim gewicht ist es das nicht — eine zahl, die weder
   * gut noch schlecht ist, bekommt keine farbe, sondern nur eine richtung.
   */
  wertung?: 'mehr-ist-besser' | 'neutral'
}

/**
 * Der Pfeil gegen die Vorwoche.
 *
 * Ohne Vorwoche steht hier nichts — ein "±0" gegen eine Woche, die es nicht
 * gab, waere eine erfundene Aussage. Die Farbe ist absichtlich zurueckhaltend:
 * der Bericht bewertet nicht, er zeigt die Richtung.
 */
export function BerichtTrendPfeil({ delta, einheit = '', wertung = 'mehr-ist-besser' }: Props) {
  if (delta === null) return null
  const gerundet = Math.round(delta)
  const zeichen = gerundet === 0 ? '→' : gerundet > 0 ? '↗' : '↘'
  const farbe =
    wertung === 'neutral' || gerundet === 0
      ? 'var(--kreide-52)'
      : gerundet > 0
        ? 'var(--kreide)'
        : 'var(--kreide-52)'

  return (
    <span className="tnum whitespace-nowrap text-[10px] font-semibold" style={{ color: farbe }}>
      <span aria-hidden="true">{zeichen} </span>
      {alsDelta(gerundet, einheit)}
      <span className="sr-only"> gegenüber der vorwoche</span>
    </span>
  )
}
