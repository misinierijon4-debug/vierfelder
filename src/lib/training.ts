import { toKey } from './dates'
import type { Aufenthalt, FeldId, UserId } from './types'
import { istMessbar } from './types'

/**
 * kürzer war kein training, sondern ein blick in die tür. die schwelle sitzt
 * bewusst niedrig: sie soll die vorbeifahrt aussortieren, nicht den kurzen tag.
 */
export const MINDESTMINUTEN = 20

/** minuten zwischen ankunft und abgang. `null`, solange der abgang fehlt */
export function dauerMinuten(a: Aufenthalt): number | null {
  if (!a.abgang) return null
  const von = new Date(a.ankunft).getTime()
  const bis = new Date(a.abgang).getTime()
  if (!Number.isFinite(von) || !Number.isFinite(bis) || bis <= von) return null
  return (bis - von) / 60000
}

/**
 * der aufenthalt gehört zu dem tag, an dem er begonnen hat. wer um 23:40 in
 * die halle geht, hat am mittwoch trainiert, auch wenn er um 00:30 rauskommt.
 */
export function tagVon(a: Aufenthalt): string {
  return toKey(new Date(a.ankunft))
}

export function zaehlt(a: Aufenthalt): boolean {
  const dauer = dauerMinuten(a)
  return dauer !== null && dauer >= MINDESTMINUTEN
}

/**
 * alle zählenden aufenthalte dieser person in diesem bereich an diesem tag,
 * nach ankunft sortiert. zwei besuche sind zwei einheiten — am tick ändert das
 * nichts, der zählt weiter tage.
 */
export function messungen(
  aufenthalte: Aufenthalt[],
  u: UserId,
  f: FeldId,
  tag: string
): Aufenthalt[] {
  if (!istMessbar(f)) return []
  return aufenthalte
    .filter((a) => a.user === u && a.bereich === f && zaehlt(a) && tagVon(a) === tag)
    .sort((x, y) => (x.ankunft < y.ankunft ? -1 : x.ankunft > y.ankunft ? 1 : 0))
}

/**
 * der längste zählende aufenthalt dieser person in diesem bereich an diesem
 * tag. mehrere besuche bleiben ein tick — der längere ist der, den die zeile
 * anzeigt.
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
