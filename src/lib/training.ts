import { toKey } from './dates'
import type { Aufenthalt, FeldId, MessbarerBereich, UserId } from './types'
import { istMessbar } from './types'

/**
 * kürzer war kein training, sondern ein blick in die tür — und kein lernen,
 * sondern ein fokus, der eine minute lang an war. die schwelle sitzt bewusst
 * niedrig: sie soll die vorbeifahrt aussortieren, nicht den kurzen tag.
 */
export const MINDESTMINUTEN = 20

/**
 * lesen zählt ab zehn minuten. ein kapitel ist kürzer als eine trainingseinheit,
 * und der weg dorthin ist kürzer: zum gym fährt man versehentlich vorbei, den
 * fokus lesen schaltet man nicht versehentlich ein. eine schwelle, die den
 * ehrlichen kurzen abend aussortiert, misst nicht strenger, sondern schlechter.
 */
export const MINDESTMINUTEN_LESEN = 10

export function mindestMinuten(bereich: MessbarerBereich): number {
  return bereich === 'lesen' ? MINDESTMINUTEN_LESEN : MINDESTMINUTEN
}

/** minuten zwischen ankunft und abgang. `null`, solange der abgang fehlt */
export function dauerMinuten(a: Aufenthalt): number | null {
  if (!a.abgang) return null
  const von = new Date(a.ankunft).getTime()
  const bis = new Date(a.abgang).getTime()
  if (!Number.isFinite(von) || !Number.isFinite(bis) || bis <= von) return null
  return (bis - von) / 60000
}

/**
 * die sitzung gehört zu dem tag, an dem sie begonnen hat. wer um 23:40 in die
 * halle geht, hat am mittwoch trainiert, auch wenn er um 00:30 rauskommt.
 */
export function tagVon(a: Aufenthalt): string {
  return toKey(new Date(a.ankunft))
}

export function zaehlt(a: Aufenthalt): boolean {
  const dauer = dauerMinuten(a)
  return dauer !== null && dauer >= mindestMinuten(a.bereich)
}

/**
 * zwei quellen für dieselbe stunde sind nicht zwei einheiten. wer im gym den
 * fokus einschaltet, während die standort-automation ohnehin läuft, hat einmal
 * trainiert — überschneiden sich zwei sitzungen, bleibt die längere. ohne diese
 * regel würde ausgerechnet der doppelt belegte tag doppelt gezählt.
 */
function ohneUeberschneidung(sortiert: Aufenthalt[]): Aufenthalt[] {
  const behalten: Aufenthalt[] = []
  for (const a of sortiert) {
    const letzte = behalten[behalten.length - 1]
    // als zeitstempel vergleichen, nicht als text: die zeiten kommen aus zwei
    // quellen und müssen dafür nicht gleich geschrieben sein.
    if (letzte && new Date(a.ankunft).getTime() < new Date(letzte.abgang!).getTime()) {
      if (dauerMinuten(a)! > dauerMinuten(letzte)!) behalten[behalten.length - 1] = a
      continue
    }
    behalten.push(a)
  }
  return behalten
}

/**
 * alle zählenden sitzungen dieser person in diesem bereich an diesem tag, nach
 * beginn sortiert. zwei besuche sind zwei einheiten — am tick ändert das
 * nichts, der zählt weiter tage.
 */
export function messungen(
  aufenthalte: Aufenthalt[],
  u: UserId,
  f: FeldId,
  tag: string
): Aufenthalt[] {
  if (!istMessbar(f)) return []
  return ohneUeberschneidung(
    aufenthalte
      .filter((a) => a.user === u && a.bereich === f && zaehlt(a) && tagVon(a) === tag)
      .sort((x, y) => (x.ankunft < y.ankunft ? -1 : x.ankunft > y.ankunft ? 1 : 0))
  )
}

/**
 * die längste zählende sitzung dieser person in diesem bereich an diesem tag.
 * mehrere bleiben ein tick — die längste ist die, die die zeile anzeigt.
 */
export function messung(
  aufenthalte: Aufenthalt[],
  u: UserId,
  f: FeldId,
  tag: string
): Aufenthalt | null {
  let beste: Aufenthalt | null = null
  let besteDauer = -1
  for (const a of messungen(aufenthalte, u, f, tag)) {
    const dauer = dauerMinuten(a)!
    if (dauer > besteDauer) {
      beste = a
      besteDauer = dauer
    }
  }
  return beste
}

export function gemessen(
  aufenthalte: Aufenthalt[],
  u: UserId,
  f: FeldId,
  tag: string
): boolean {
  return messung(aufenthalte, u, f, tag) !== null
}

/** auf minuten gerundet, für die anzeige in der bereichszeile */
export function gemesseneMinuten(
  aufenthalte: Aufenthalt[],
  u: UserId,
  f: FeldId,
  tag: string
): number | null {
  const treffer = messung(aufenthalte, u, f, tag)
  return treffer ? Math.round(dauerMinuten(treffer)!) : null
}
