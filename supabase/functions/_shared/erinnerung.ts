/** Die Erinnerungen rechnen nach deutscher Ortszeit, auch an Zeitumstellungen. */
export const ERINNERUNGS_ZONE = 'Europe/Berlin'
export const NACHTRUHE_AB = '22:00'

export type LokaleMinute = {
  /** yyyy-mm-dd */
  tag: string
  /** hh:mm, 24-stuendig */
  minute: string
}

/**
 * `toISOString()` waere hier falsch: 20:00 in Berlin ist je nach Jahreszeit
 * 18:00 oder 19:00 UTC. `formatToParts` laesst die Zeitzonendatenbank genau
 * diese Umrechnung machen und liefert stabile, sortierbare Teile.
 */
export function lokaleMinute(
  jetzt: Date,
  zone: string = ERINNERUNGS_ZONE
): LokaleMinute {
  const teile = new Intl.DateTimeFormat('en-CA', {
    timeZone: zone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(jetzt)
  const wert = (art: Intl.DateTimeFormatPartTypes) =>
    teile.find((teil) => teil.type === art)?.value ?? ''
  return {
    tag: `${wert('year')}-${wert('month')}-${wert('day')}`,
    minute: `${wert('hour')}:${wert('minute')}`,
  }
}

/**
 * ISO-artige Uhrzeiten lassen sich lexikografisch vergleichen. Nach 22 Uhr
 * wird auch nach einem Ausfall nichts nachgeschickt; Ruhe ist die hoehere
 * Regel als ein verpasster Lauf.
 */
export function istFaellig(jetzt: string, geplant: string): boolean {
  const minute = geplant.slice(0, 5)
  return jetzt >= minute && jetzt < NACHTRUHE_AB
}
