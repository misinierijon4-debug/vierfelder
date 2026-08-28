import { fromKey, toKey } from './dates'

export type KalenderMonat = {
  key: string
  jahr: number
  monat: number
  tage: Array<string | null>
}

function monatsanfang(datum: Date): Date {
  return new Date(datum.getFullYear(), datum.getMonth(), 1)
}

function addMonate(datum: Date, anzahl: number): Date {
  return new Date(datum.getFullYear(), datum.getMonth() + anzahl, 1)
}

function frueher(a: Date, b: Date): Date {
  return a.getTime() <= b.getTime() ? a : b
}

/**
 * Monatsraster von Montag bis Sonntag. Leere Felder halten den ersten Tag an
 * derselben Stelle wie in der Wochenleiste.
 */
export function tageImMonat(jahr: number, monat: number): Array<string | null> {
  const erster = new Date(jahr, monat, 1)
  const letzter = new Date(jahr, monat + 1, 0)
  const vorlauf = (erster.getDay() + 6) % 7
  const tage: Array<string | null> = Array.from({ length: vorlauf }, () => null)

  for (let tag = 1; tag <= letzter.getDate(); tag += 1) {
    tage.push(toKey(new Date(jahr, monat, tag)))
  }

  while (tage.length % 7 !== 0) tage.push(null)
  return tage
}

/**
 * Zeigt die gesamte vorhandene Historie, mindestens aber den aktuellen und den
 * vorigen Monat. Der ausgewaehlte Tag bleibt auch dann erreichbar, wenn fuer
 * ihn keine Nacht gespeichert ist.
 */
export function kalenderMonate(
  datenTage: string[],
  heuteKey: string,
  gewaehlterTag: string
): KalenderMonat[] {
  const heute = monatsanfang(fromKey(heuteKey))
  let start = addMonate(heute, -1)

  for (const key of [...datenTage, gewaehlterTag]) {
    const datum = fromKey(key)
    if (!Number.isNaN(datum.getTime())) start = frueher(start, monatsanfang(datum))
  }

  const monate: KalenderMonat[] = []
  for (let cursor = start; cursor.getTime() <= heute.getTime(); cursor = addMonate(cursor, 1)) {
    monate.push({
      key: `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`,
      jahr: cursor.getFullYear(),
      monat: cursor.getMonth(),
      tage: tageImMonat(cursor.getFullYear(), cursor.getMonth()),
    })
  }

  return monate
}

export function istSelbeWoche(a: string[], b: string[]): boolean {
  return a.length === 7 && b.length === 7 && a[0] === b[0]
}

export function wochenZeitraum(woche: string[]): string {
  const von = fromKey(woche[0]!)
  const bis = fromKey(woche[6]!)
  const gleicherMonat = von.getMonth() === bis.getMonth() && von.getFullYear() === bis.getFullYear()
  const monat = new Intl.DateTimeFormat('de-DE', { month: 'long' })

  if (gleicherMonat) return `${von.getDate()}.–${bis.getDate()}. ${monat.format(von).toLowerCase()}`
  return `${von.getDate()}. ${monat.format(von).toLowerCase()} – ${bis.getDate()}. ${monat.format(bis).toLowerCase()}`
}
