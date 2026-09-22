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
 * der tag je sitzung, einmal gerechnet. index, historie und bericht fragen ihn
 * bei jedem tap für jede sitzung, und eine datumsumrechnung je frage war mit
 * wachsender historie ein spürbarer teil davon. gemerkt wird mit `ankunft`,
 * damit eine veränderte sitzung nie einen alten tag behält.
 */
const gemerkteTage = new WeakMap<Aufenthalt, { ankunft: string; tag: string }>()

/**
 * die sitzung gehört zu dem tag, an dem sie begonnen hat. wer um 23:40 in die
 * halle geht, hat am mittwoch trainiert, auch wenn er um 00:30 rauskommt.
 */
export function tagVon(a: Aufenthalt): string {
  const gemerkt = gemerkteTage.get(a)
  if (gemerkt && gemerkt.ankunft === a.ankunft) return gemerkt.tag
  const tag = toKey(new Date(a.ankunft))
  gemerkteTage.set(a, { ankunft: a.ankunft, tag })
  return tag
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

function nachBeginn(x: Aufenthalt, y: Aufenthalt): number {
  return x.ankunft < y.ankunft ? -1 : x.ankunft > y.ankunft ? 1 : 0
}

/** was an einem tag gemessen wurde, für eine person und einen bereich */
type Tagessitzungen = {
  /** abgeschlossen, ohne überschneidung, nach beginn sortiert */
  sitzungen: Aufenthalt[]
  /** davon die, die die schwelle erreichen */
  messungen: Aufenthalt[]
  /** die längste zählende; bei gleicher dauer die frühere */
  messung: Aufenthalt | null
}

type Sitzungsindex = { laenge: number; tage: Map<string, Tagessitzungen> }

/**
 * die sitzungen, einmal nach person, bereich und tag sortiert und ausgewertet.
 * ohne diesen index lief jede frage „war an diesem tag eine messung?" einmal
 * durch alle aufenthalte, mit mehreren datumsumrechnungen je zeile — und die
 * frage kommt je bild tausendfach: wochenstand, streak, raster, kalender,
 * bericht. mit jeder woche historie wurde so jede berührung spürbar langsamer.
 *
 * der index hängt an der liste selbst. der zustand ersetzt sie bei jeder
 * änderung durch eine neue (`mitAufenthalt`, `ohneAufenthalt`), statt sie zu
 * verändern; die länge sichert nur listen ab, die doch an ort und stelle
 * wachsen, wie beim aufbau in den tests.
 */
const sitzungsindizes = new WeakMap<Aufenthalt[], Sitzungsindex>()

function sitzungsindex(aufenthalte: Aufenthalt[]): Map<string, Tagessitzungen> {
  const vorhanden = sitzungsindizes.get(aufenthalte)
  if (vorhanden && vorhanden.laenge === aufenthalte.length) return vorhanden.tage

  const roh = new Map<string, Aufenthalt[]>()
  for (const a of aufenthalte) {
    if (dauerMinuten(a) === null) continue
    const key = `${a.user}|${a.bereich}|${tagVon(a)}`
    const liste = roh.get(key)
    if (liste) liste.push(a)
    else roh.set(key, [a])
  }

  const tage = new Map<string, Tagessitzungen>()
  for (const [key, liste] of roh) {
    // sort ist stabil: gleiche beginne behalten die reihenfolge der liste,
    // genau wie beim filtern und sortieren je tag
    const sitzungen = ohneUeberschneidung(liste.sort(nachBeginn))
    const messungen = sitzungen.filter(zaehlt)
    let messung: Aufenthalt | null = null
    let besteDauer = -1
    for (const a of messungen) {
      const dauer = dauerMinuten(a)!
      if (dauer > besteDauer) {
        messung = a
        besteDauer = dauer
      }
    }
    tage.set(key, { sitzungen, messungen, messung })
  }

  sitzungsindizes.set(aufenthalte, { laenge: aufenthalte.length, tage })
  return tage
}

function tagessitzungen(
  aufenthalte: Aufenthalt[],
  u: UserId,
  f: MessbarerBereich,
  tag: string
): Tagessitzungen | undefined {
  return sitzungsindex(aufenthalte).get(`${u}|${f}|${tag}`)
}

/**
 * die tage, an denen diese person mindestens eine abgeschlossene sitzung hat,
 * in keiner festen reihenfolge und je bereich einmal
 */
export function tageMitSitzung(aufenthalte: Aufenthalt[], u: UserId): string[] {
  const praefix = `${u}|`
  const tage: string[] = []
  for (const key of sitzungsindex(aufenthalte).keys()) {
    if (key.startsWith(praefix)) tage.push(key.slice(key.lastIndexOf('|') + 1))
  }
  return tage
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
  // kopien: der index gehört allen aufrufern
  return [...(tagessitzungen(aufenthalte, u, f, tag)?.sitzungen ?? [])]
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
  return [...(tagessitzungen(aufenthalte, u, f, tag)?.messungen ?? [])]
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
  if (!istMessbar(f)) return null
  return tagessitzungen(aufenthalte, u, f, tag)?.messung ?? null
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
