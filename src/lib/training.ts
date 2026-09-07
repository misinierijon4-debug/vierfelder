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

/**
 * Der Importvertrag ersetzt beim naechsten Start offene Sitzungen, die aelter
 * als zwoelf Stunden sind. Bis dahin ist `abgang = null` ein Laufstatus; danach
 * ist es ein unvollstaendiger Datensatz, aus dem keine Dauer geraten wird.
 */
export const MAXIMALE_OFFENE_MINUTEN = 12 * 60

export type OffeneMessungWarnung =
  | 'start_ungueltig'
  | 'start_in_zukunft'
  | 'verwaist'

export type OffeneMessungStatus =
  | {
      art: 'laeuft'
      ankunft: string
      mindestdauerErreicht: boolean
    }
  | {
      art: 'warnung'
      ankunft: string
      grund: OffeneMessungWarnung
    }

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
 * Deduplizierte offene Automationen einer Person und eines Bereichs. Sie sind
 * absichtlich keine `sitzungen`: Ohne bestaetigten Abgang gibt es weder eine
 * fertige Dauer noch einen Messpunkt. Ungueltige, zukuenftige und ueberlange
 * Starts bleiben als Warnstatus sichtbar, statt still als Null Minuten zu
 * verschwinden.
 */
export function offeneMessungen(
  aufenthalte: Aufenthalt[],
  u: UserId,
  f: FeldId,
  jetzt: Date = new Date()
): OffeneMessungStatus[] {
  if (!istMessbar(f)) return []
  const jetztMs = jetzt.getTime()
  if (!Number.isFinite(jetztMs)) return []

  const gesehenIds = new Set<string>()
  const gesehenInhalte = new Set<string>()
  const ergebnis: OffeneMessungStatus[] = []

  for (const a of aufenthalte) {
    if (a.user !== u || a.bereich !== f || a.abgang !== null) continue
    const inhalt = `${a.user}\u0000${a.bereich}\u0000${a.ort}\u0000${a.ankunft}`
    if ((a.id !== undefined && gesehenIds.has(a.id)) || gesehenInhalte.has(inhalt)) continue
    if (a.id !== undefined) gesehenIds.add(a.id)
    gesehenInhalte.add(inhalt)

    const ankunftMs = new Date(a.ankunft).getTime()
    if (!Number.isFinite(ankunftMs)) {
      ergebnis.push({ art: 'warnung', ankunft: a.ankunft, grund: 'start_ungueltig' })
      continue
    }
    const vergangeneMinuten = (jetztMs - ankunftMs) / 60_000
    if (vergangeneMinuten < 0) {
      ergebnis.push({ art: 'warnung', ankunft: a.ankunft, grund: 'start_in_zukunft' })
      continue
    }
    if (vergangeneMinuten > MAXIMALE_OFFENE_MINUTEN) {
      ergebnis.push({ art: 'warnung', ankunft: a.ankunft, grund: 'verwaist' })
      continue
    }
    ergebnis.push({
      art: 'laeuft',
      ankunft: a.ankunft,
      mindestdauerErreicht: vergangeneMinuten >= mindestMinuten(a.bereich),
    })
  }

  return ergebnis.sort((a, b) => {
    const aZeit = new Date(a.ankunft).getTime()
    const bZeit = new Date(b.ankunft).getTime()
    if (!Number.isFinite(aZeit)) return Number.isFinite(bZeit) ? 1 : 0
    if (!Number.isFinite(bZeit)) return -1
    return aZeit - bZeit
  })
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
 * alle abgeschlossenen sitzungen dieses tages, auch wenn sie die schwelle fuer
 * einen punkt noch nicht erreichen. eine kurze automation ist echte messung
 * und soll deshalb sichtbar bleiben; nur `messungen` entscheidet, was zaehlt.
 */
export function sitzungen(
  aufenthalte: Aufenthalt[],
  u: UserId,
  f: FeldId,
  tag: string
): Aufenthalt[] {
  if (!istMessbar(f)) return []
  return ohneUeberschneidung(
    aufenthalte
      .filter(
        (a) =>
          a.user === u &&
          a.bereich === f &&
          dauerMinuten(a) !== null &&
          tagVon(a) === tag
      )
      .sort((x, y) => (x.ankunft < y.ankunft ? -1 : x.ankunft > y.ankunft ? 1 : 0))
  )
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
  return sitzungen(aufenthalte, u, f, tag).filter(zaehlt)
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
