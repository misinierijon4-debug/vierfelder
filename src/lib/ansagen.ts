import { addDays, daysBetween, fromKey, startOfWeek, toKey } from './dates'
import { istGesetzt, quelle } from './tracker'
import type { AreaId, UserId, Zustand } from './types'

/**
 * ansagen: die herausforderungen zwischen den beiden. wer eine ansage macht,
 * wettet, dass die andere person in einem zeitraum einen bereich *nicht*
 * schafft — „du liest die nächsten zwei tage nicht", „du gehst diese woche
 * keine drei mal ins gym". die andere person kann nicht ablehnen, sie kann
 * nur liefern.
 *
 * entschieden wird nie von hand, sondern aus denselben ticks, die auch das
 * duell zählen. damit gibt es keinen streit darüber, wer recht hat.
 *
 * noch nicht in der oberfläche und noch nicht im wochenstand — siehe
 * `docs/ansagen.md`.
 */

/** so viele ansagen hat jede person je woche. was übrig bleibt, verfällt */
export const ANSAGEN_JE_WOCHE = 2

/** länger als eine woche geht nicht: zeitraum und wertung bleiben in einer woche */
export const LAENGSTER_ZEITRAUM = 7

export type Ansage = {
  id: string
  /** wer herausfordert */
  von: UserId
  /** wer liefern muss */
  an: UserId
  bereich: AreaId
  /** erster tag des zeitraums, lokaler tagschlüssel aus `toKey` */
  ab: string
  /** letzter tag des zeitraums, einschließlich */
  bis: string
  /** an so vielen tagen im zeitraum muss der bereich erledigt sein */
  mindestTage: number
  /**
   * nur gemessene tage zählen (standort oder fokus). ein getippter haken ist
   * eine behauptung — wo punkte auf dem spiel stehen, reicht das nicht
   */
  nurGemessen: boolean
  /** scheitert die person, verliert sie zusätzlich einen punkt */
  einsatz: boolean
  /** zeitpunkt der ansage, iso */
  erstelltAm: string
}

export type AnsageStatus = 'laeuft' | 'geschafft' | 'verfehlt'

export type AnsageStand = {
  status: AnsageStatus
  /** tage im zeitraum bis einschließlich heute, an denen es gezählt hat */
  erreicht: number
  mindestTage: number
  /** tage, die noch kommen können — heute eingeschlossen, solange er im zeitraum liegt */
  offeneTage: number
}

export type AnsagePunkte = Record<UserId, number>

function montagVon(tag: string): string {
  return toKey(startOfWeek(fromKey(tag)))
}

function tageImZeitraum(ab: string, bis: string): string[] {
  const start = fromKey(ab)
  const laenge = daysBetween(start, fromKey(bis)) + 1
  return Array.from({ length: Math.max(0, laenge) }, (_, i) => toKey(addDays(start, i)))
}

/** die woche, in der die ansage gemacht wurde — sie kostet deren kontingent */
export function ansageWoche(a: Ansage): string {
  return montagVon(toKey(new Date(a.erstelltAm)))
}

export function verbleibendeAnsagen(ansagen: Ansage[], u: UserId, jetzt: Date): number {
  const woche = toKey(startOfWeek(jetzt))
  const verbraucht = ansagen.filter((a) => a.von === u && ansageWoche(a) === woche).length
  return Math.max(0, ANSAGEN_JE_WOCHE - verbraucht)
}

/** ob ein tag für diese ansage zählt */
function tagZaehlt(z: Zustand, a: Ansage, tag: string): boolean {
  if (!a.nurGemessen) return istGesetzt(z, a.an, a.bereich, tag)
  const q = quelle(z, a.an, a.bereich, tag)
  return q === 'gemessen' || q === 'gemischt'
}

/**
 * der stand einer ansage zum zeitpunkt `jetzt`. sie ist entschieden, sobald
 * es feststeht — geschafft mit dem letzten nötigen tag, verfehlt, sobald die
 * übrigen tage nicht mehr reichen. heute zählt dabei noch als möglich.
 */
export function ansageStand(z: Zustand, a: Ansage, jetzt: Date): AnsageStand {
  const heute = toKey(jetzt)
  let erreicht = 0
  let offeneTage = 0
  for (const tag of tageImZeitraum(a.ab, a.bis)) {
    if (tag > heute) {
      offeneTage += 1
      continue
    }
    if (tagZaehlt(z, a, tag)) erreicht += 1
    else if (tag === heute) offeneTage += 1
  }

  let status: AnsageStatus = 'laeuft'
  if (erreicht >= a.mindestTage) status = 'geschafft'
  else if (erreicht + offeneTage < a.mindestTage) status = 'verfehlt'
  return { status, erreicht, mindestTage: a.mindestTage, offeneTage }
}

/**
 * was eine entschiedene ansage bringt. geschafft: die herausgeforderte person
 * bekommt einen punkt, die herausfordernde verliert nichts. verfehlt: die
 * herausfordernde person bekommt einen punkt, mit einsatz verliert die andere
 * einen.
 */
export function ansagePunkte(status: AnsageStatus, a: Ansage): AnsagePunkte {
  const punkte = { erijon: 0, koray: 0 } as AnsagePunkte
  if (status === 'geschafft') punkte[a.an] += 1
  if (status === 'verfehlt') {
    punkte[a.von] += 1
    if (a.einsatz) punkte[a.an] -= 1
  }
  return punkte
}

/**
 * die ansage-punkte einer woche. gewertet wird in der woche, in der der
 * zeitraum endet — das ist wegen `pruefeAnsage` dieselbe, in der sie gemacht
 * wurde.
 */
export function wochenAnsagePunkte(
  z: Zustand,
  ansagen: Ansage[],
  montag: string,
  jetzt: Date
): AnsagePunkte {
  const summe = { erijon: 0, koray: 0 } as AnsagePunkte
  for (const a of ansagen) {
    if (montagVon(a.bis) !== montag) continue
    const { status } = ansageStand(z, a, jetzt)
    const p = ansagePunkte(status, a)
    summe.erijon += p.erijon
    summe.koray += p.koray
  }
  return summe
}

export type AnsageFehler =
  | 'selbst'
  | 'keineAnsagenMehr'
  | 'zuFrueh'
  | 'zeitraum'
  | 'andereWoche'
  | 'mindestTage'
  | 'schonOffen'

export type AnsageEntwurf = Omit<Ansage, 'id' | 'erstelltAm'>

/**
 * prüft eine neue ansage. null heißt: darf so gemacht werden.
 *
 * der zeitraum beginnt frühestens morgen, sonst wettet man auf einen tag, an
 * dem man schon sieht, ob die andere person geliefert hat. er endet
 * spätestens am sonntag derselben woche, damit ansage, kontingent und wertung
 * zur selben woche gehören. je person und bereich läuft höchstens eine ansage
 * gleichzeitig — sonst stapelt man drei auf dasselbe schwache feld.
 */
export function pruefeAnsage(
  z: Zustand,
  ansagen: Ansage[],
  entwurf: AnsageEntwurf,
  jetzt: Date
): AnsageFehler | null {
  if (entwurf.von === entwurf.an) return 'selbst'
  if (verbleibendeAnsagen(ansagen, entwurf.von, jetzt) === 0) return 'keineAnsagenMehr'

  const morgen = toKey(addDays(jetzt, 1))
  if (entwurf.ab < morgen) return 'zuFrueh'

  const laenge = tageImZeitraum(entwurf.ab, entwurf.bis).length
  if (laenge < 1 || laenge > LAENGSTER_ZEITRAUM) return 'zeitraum'

  const woche = toKey(startOfWeek(jetzt))
  if (montagVon(entwurf.ab) !== woche || montagVon(entwurf.bis) !== woche) return 'andereWoche'

  if (
    !Number.isInteger(entwurf.mindestTage) ||
    entwurf.mindestTage < 1 ||
    entwurf.mindestTage > laenge
  ) {
    return 'mindestTage'
  }

  const offen = ansagen.some(
    (a) =>
      a.an === entwurf.an &&
      a.bereich === entwurf.bereich &&
      ansageStand(z, a, jetzt).status === 'laeuft'
  )
  if (offen) return 'schonOffen'

  return null
}
