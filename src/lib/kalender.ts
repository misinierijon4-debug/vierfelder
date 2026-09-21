import { addDays, fromKey, toKey } from './dates'

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

/**
 * Dieselbe Woche, kurz genug fuer die Berichtszeile im Raster.
 *
 * Der Monat steht als Ueberschrift ueber dem Raster und die Tage stehen
 * direkt ueber der Zeile — innerhalb eines Monats reichen die beiden Zahlen.
 * Nur die Woche ueber den Monatswechsel muss ihre Monate mitbringen, sonst
 * liest sich `31.–6.` wie ein Rueckwaertszaehler.
 */
export function wochenZeitraumKurz(woche: string[]): string {
  const von = fromKey(woche[0]!)
  const bis = fromKey(woche[6]!)
  const gleicherMonat = von.getMonth() === bis.getMonth() && von.getFullYear() === bis.getFullYear()

  if (gleicherMonat) return `${von.getDate()}.–${bis.getDate()}.`
  return `${von.getDate()}.${von.getMonth() + 1}.–${bis.getDate()}.${bis.getMonth() + 1}.`
}

export type KalenderWoche = {
  /** montag dieser zeile, auch wenn er im vormonat liegt */
  montag: string
  /** dieselben sieben felder wie im raster, leere tage bleiben null */
  tage: Array<string | null>
  /**
   * ob der Bericht dieser Woche an dieser Zeile haengt.
   *
   * Eine Woche ueber den Monatswechsel steht in zwei Monatsrastern — sonst
   * haette sie zwei Berichtszeichen, die dasselbe oeffnen. Sie gehoert dem
   * Monat, in dem ihr Donnerstag liegt; das ist dieselbe Regel, nach der die
   * ISO-Kalenderwoche ihrem Jahr zugeordnet wird, und praktisch immer der
   * Monat, in dem die meisten ihrer Tage liegen.
   */
  traegtBericht: boolean
}

/**
 * Das Monatsraster in Wochenzeilen, damit rechts neben jeder Zeile der
 * Wochenbericht stehen kann — so wie Sleep Cycle es macht.
 *
 * Der Montag einer Zeile steht auch dann fest, wenn das Feld leer ist: die
 * erste Zeile eines Monats beginnt meist im Vormonat, und der Bericht gehoert
 * trotzdem zu dieser Woche. Er wird deshalb aus dem ersten belegten Tag der
 * Zeile zurueckgerechnet, nie aus der Position im Raster.
 */
export function wochenImMonat(tage: Array<string | null>): KalenderWoche[] {
  const wochen: KalenderWoche[] = []

  for (let i = 0; i < tage.length; i += 7) {
    const zeile = tage.slice(i, i + 7)
    const ersterTag = zeile.find((tag): tag is string => tag !== null)
    if (!ersterTag) continue
    const versatz = zeile.indexOf(ersterTag)
    wochen.push({
      montag: toKey(addDays(fromKey(ersterTag), -versatz)),
      tage: zeile,
      traegtBericht: zeile[3] !== null && zeile[3] !== undefined,
    })
  }

  return wochen
}
