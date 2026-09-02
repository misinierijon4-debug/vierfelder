const MS_DAY = 86_400_000

export function toKey(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function fromKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y!, m! - 1, d!)
}

/** montagsbasierter wochenstart */
export function startOfWeek(d: Date): Date {
  const copy = new Date(d)
  const dow = (copy.getDay() + 6) % 7
  copy.setDate(copy.getDate() - dow)
  copy.setHours(0, 0, 0, 0)
  return copy
}

export function addDays(d: Date, n: number): Date {
  const copy = new Date(d)
  copy.setDate(copy.getDate() + n)
  return copy
}

export function daysBetween(a: Date, b: Date): number {
  const da = new Date(a)
  da.setHours(0, 0, 0, 0)
  const db = new Date(b)
  db.setHours(0, 0, 0, 0)
  return Math.round((db.getTime() - da.getTime()) / MS_DAY)
}

/** die sieben tage der woche, in der `reference` liegt */
export function weekDays(reference: Date): string[] {
  const montag = startOfWeek(reference)
  return Array.from({ length: 7 }, (_, i) => toKey(addDays(montag, i)))
}

/** iso-kalenderwoche */
export function isoWeek(d: Date): number {
  const t = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  t.setDate(t.getDate() + 3 - ((t.getDay() + 6) % 7))
  const ersterDonnerstag = new Date(t.getFullYear(), 0, 4)
  ersterDonnerstag.setDate(
    ersterDonnerstag.getDate() + 3 - ((ersterDonnerstag.getDay() + 6) % 7)
  )
  return 1 + Math.round((t.getTime() - ersterDonnerstag.getTime()) / (7 * MS_DAY))
}

/** sonntag ab 18 uhr bis montag 00:00 */
export function istBilanzzeit(d: Date): boolean {
  return d.getDay() === 0 && d.getHours() >= 18
}

const WOCHENTAG = new Intl.DateTimeFormat('de-DE', { weekday: 'long' })
const DATUM = new Intl.DateTimeFormat('de-DE', { day: 'numeric', month: 'long' })

export function langesDatum(d: Date): string {
  return `${WOCHENTAG.format(d)}, ${DATUM.format(d)}`.toLowerCase()
}

export const TAGKUERZEL = ['mo', 'di', 'mi', 'do', 'fr', 'sa', 'so']

/**
 * Die Bauzeit klein und lesbar: `02.09. 09:22`.
 *
 * Jahr und Sekunden fehlen mit Absicht. Die Frage, die diese Zeile beantwortet,
 * lautet "ist das die Fassung von eben oder die von gestern" — dafuer reichen
 * Tag und Minute, und laenger darf die Zeile in der Fusszeile nicht werden.
 */
export function bauKurz(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const zwei = (n: number) => String(n).padStart(2, '0')
  const tag = `${zwei(d.getDate())}.${zwei(d.getMonth() + 1)}.`
  return `${tag} ${zwei(d.getHours())}:${zwei(d.getMinutes())}`
}
