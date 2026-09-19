import { addDays, fromKey, toKey, weekDays } from './dates'
import { AREAS, FELDER, USERS, area, gewichtKey } from './types'
import type { FeldId, Gewichte, Schlafnacht, UserId, Zustand } from './types'
import { istGesetzt, tageseinheiten } from './tracker'
import { abendDatum } from './schlafPhasen'

/**
 * Der Wochenbericht: alle Zahlen einer abgelaufenen Woche an einer Stelle.
 *
 * Er rechnet ausschliesslich aus dem Zustand, der ohnehin geladen ist — keine
 * eigene Abfrage, kein Warten, kein zweiter Weg zur Wahrheit. Wer den Bericht
 * oeffnet, sieht sofort etwas; ENI liefert spaeter nur noch die Saetze dazu
 * (`WochenberichtTexte`), nie eine Zahl. Genau daran ist der erste Versuch
 * gescheitert: ein Modell, das Punkte selbst zaehlt, zaehlt sie irgendwann
 * falsch.
 *
 * Die Punkteregel ist die der App: ein Punkt je Person, Feld und Tag, wenn das
 * Feld an dem Tag steht (`istGesetzt`). Dieselbe Regel wie in `wocheGesamt`
 * und in `duellPunkte.ts` auf dem Server — hier wird sie nicht neu erfunden,
 * nur zusammengetragen.
 */

/** Montag bis Sonntag, in der Reihenfolge der App */
export const BERICHT_FELDER = FELDER.map((f) => f.id)

export type WochenTrend = {
  wert: number | null
  vorwoche: number | null
  /** wert minus vorwoche; null, sobald eine der beiden Seiten fehlt */
  delta: number | null
}

export type BerichtFeldzeile = {
  feld: FeldId
  punkte: Record<UserId, number>
  /** erfasste minuten der woche; beim lesen sind das die gemessenen fokusminuten */
  minuten: Record<UserId, number>
  /** nur beim lesen gefuellt, sonst null — seiten und minuten mischen sich nicht */
  seiten: Record<UserId, number> | null
  /** welche tage der woche standen, montag zuerst */
  tage: Record<UserId, boolean[]>
}

export type BerichtNacht = {
  /** abend, an dem die nacht begann */
  tag: string
  minuten: Record<UserId, number | null>
  /** nachtwert 0..100 aus der datenbank; null ohne messung oder ohne wert */
  wert: Record<UserId, number | null>
}

export type BerichtSchlafPerson = {
  naechte: number
  /** schnitt der schlafdauer in minuten */
  minuten: WochenTrend
  /** schnitt des nachtwerts */
  wert: WochenTrend
}

export type BerichtGewichtPerson = {
  punkte: Array<{ tag: string; kg: number }>
  /** schnitt der woche */
  schnitt: number | null
  /** letzte messung minus erste messung der woche */
  delta: number | null
}

export type BerichtVerlaufPunkt = {
  tag: string
  /** punkte bis einschliesslich dieses tages, aufaddiert */
  summe: Record<UserId, number>
  /** ob dieser tag schon vorbei ist — die laufende woche hoert vorher auf */
  gezaehlt: boolean
}

export type Wochenbericht = {
  /** montag der woche als tagesschluessel */
  woche: string
  /** die sieben tage, montag zuerst */
  tage: string[]
  /**
   * ob die woche abgeschlossen ist. der bericht friert am montag ein: solange
   * der sonntag noch laeuft, ist er ein stand und kein zeugnis.
   */
  endgueltig: boolean
  /** bis zu welchem tag daten vorliegen koennen — bei der laufenden woche heute */
  standTag: string
  punkte: Record<UserId, number>
  /** tage, an denen mindestens ein feld stand */
  punktTage: Record<UserId, number>
  /** dieselben zahlen der vorwoche, fuer die pfeile */
  vorwoche: {
    punkte: Record<UserId, number>
    punktTage: Record<UserId, number>
  }
  sieger: UserId | 'unentschieden'
  verlauf: BerichtVerlaufPunkt[]
  /** eine zeile je feld, das staerkste zuerst */
  felder: BerichtFeldzeile[]
  schlaf: {
    naechte: BerichtNacht[]
    person: Record<UserId, BerichtSchlafPerson>
  }
  gewicht: Record<UserId, BerichtGewichtPerson>
}

function leerJePerson<T>(bauer: (u: UserId) => T): Record<UserId, T> {
  return { erijon: bauer('erijon'), koray: bauer('koray') }
}

function trend(wert: number | null, vorwoche: number | null): WochenTrend {
  return {
    wert,
    vorwoche,
    delta: wert === null || vorwoche === null ? null : wert - vorwoche,
  }
}

/** punkte einer person in einem zeitraum, feld fuer feld und tag fuer tag */
function punkteDerWoche(z: Zustand, u: UserId, tage: string[]): number {
  let summe = 0
  for (const feld of BERICHT_FELDER) {
    for (const tag of tage) if (istGesetzt(z, u, feld, tag)) summe += 1
  }
  return summe
}

function punktTageDerWoche(z: Zustand, u: UserId, tage: string[]): number {
  return tage.reduce(
    (n, tag) => n + (BERICHT_FELDER.some((feld) => istGesetzt(z, u, feld, tag)) ? 1 : 0),
    0
  )
}

/**
 * Minuten und Seiten eines Bereichs in der Woche.
 *
 * Gemessene Sitzungen zaehlen mit, auch beim Lesen — dort aber getrennt: eine
 * Lesestunde im Fokus ist eine Minutenangabe und keine Seitenzahl, und beides
 * zu addieren ergaebe eine Zahl, die nichts bedeutet.
 */
function mengeDerWoche(
  z: Zustand,
  u: UserId,
  feld: FeldId,
  tage: string[]
): { minuten: number; seiten: number } {
  if (feld === 'gewicht') return { minuten: 0, seiten: 0 }
  let minuten = 0
  let seiten = 0
  for (const tag of tage) {
    for (const e of tageseinheiten(z, u, feld, tag)) {
      if (e.gedeckt || e.wert === null) continue
      if (e.einheit === 'min') minuten += e.wert
      else seiten += e.wert
    }
  }
  return { minuten, seiten }
}

function naechteDerWoche(naechte: Schlafnacht[], tage: string[]): BerichtNacht[] {
  const proTag = new Map<string, BerichtNacht>()
  for (const tag of tage) {
    proTag.set(tag, {
      tag,
      minuten: { erijon: null, koray: null },
      wert: { erijon: null, koray: null },
    })
  }

  for (const nacht of naechte) {
    if (nacht.schlafMinuten <= 0) continue
    const eintrag = proTag.get(abendDatum(nacht.einschlafzeit))
    if (!eintrag) continue
    eintrag.minuten[nacht.user] = nacht.schlafMinuten
    eintrag.wert[nacht.user] = nacht.nachtwert
  }

  return tage.map((tag) => proTag.get(tag)!)
}

function schlafSchnitt(
  naechte: Schlafnacht[],
  u: UserId,
  tage: string[]
): { anzahl: number; minuten: number | null; wert: number | null } {
  const eigene = naechte.filter(
    (n) => n.user === u && n.schlafMinuten > 0 && tage.includes(abendDatum(n.einschlafzeit))
  )
  if (eigene.length === 0) return { anzahl: 0, minuten: null, wert: null }

  const mitWert = eigene.filter((n) => n.nachtwert !== null)
  return {
    anzahl: eigene.length,
    minuten: eigene.reduce((s, n) => s + n.schlafMinuten, 0) / eigene.length,
    wert: mitWert.length
      ? mitWert.reduce((s, n) => s + n.nachtwert!, 0) / mitWert.length
      : null,
  }
}

function gewichtDerWoche(g: Gewichte, u: UserId, tage: string[]): BerichtGewichtPerson {
  const punkte = tage
    .map((tag) => ({ tag, kg: g[gewichtKey(u, tag)] }))
    .filter((p): p is { tag: string; kg: number } => typeof p.kg === 'number')

  if (punkte.length === 0) return { punkte, schnitt: null, delta: null }
  const schnitt = punkte.reduce((s, p) => s + p.kg, 0) / punkte.length
  const delta = punkte.length > 1 ? punkte[punkte.length - 1]!.kg - punkte[0]!.kg : null
  return { punkte, schnitt, delta }
}

/**
 * Der kumulierte Punkteverlauf.
 *
 * Bei der laufenden Woche endet die Linie am heutigen Tag statt auf null
 * abzufallen: die kommenden Tage sind nicht null, sie sind offen. Genau das
 * markiert `gezaehlt`.
 */
function baueVerlauf(z: Zustand, tage: string[], standTag: string): BerichtVerlaufPunkt[] {
  const summe: Record<UserId, number> = { erijon: 0, koray: 0 }
  return tage.map((tag) => {
    const gezaehlt = tag <= standTag
    if (gezaehlt) {
      for (const u of USERS) {
        for (const feld of BERICHT_FELDER) {
          if (istGesetzt(z, u.id, feld, tag)) summe[u.id] += 1
        }
      }
    }
    return { tag, summe: { ...summe }, gezaehlt }
  })
}

/** ob der montagsschluessel ein gueltiger wochenanfang ist */
export function istWochenmontag(woche: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(woche)) return false
  const datum = fromKey(woche)
  return !Number.isNaN(datum.getTime()) && toKey(datum) === woche && datum.getDay() === 1
}

/** der montag der woche, in der dieser tag liegt */
export function wochenMontag(tag: string): string {
  return weekDays(fromKey(tag))[0]!
}

/**
 * Baut den Bericht einer Woche.
 *
 * `woche` ist der Montag. Alles andere kommt aus dem geladenen Zustand — der
 * Bericht ist damit in beiden Datenmodi derselbe und braucht keinen Server.
 */
export function baueWochenbericht(
  woche: string,
  z: Zustand,
  naechte: Schlafnacht[],
  heuteKey: string
): Wochenbericht {
  const tage = weekDays(fromKey(woche))
  const vorwocheTage = weekDays(addDays(fromKey(woche), -7))
  const endgueltig = tage[6]! < heuteKey
  const standTag = endgueltig ? tage[6]! : heuteKey
  const gezaehlteTage = tage.filter((tag) => tag <= standTag)

  const punkte = leerJePerson((u) => punkteDerWoche(z, u, gezaehlteTage))
  const punktTage = leerJePerson((u) => punktTageDerWoche(z, u, gezaehlteTage))

  const felder: BerichtFeldzeile[] = BERICHT_FELDER.map((feld) => {
    const mengen = leerJePerson((u) => mengeDerWoche(z, u, feld, gezaehlteTage))
    const istLesen = feld === 'lesen'
    return {
      feld,
      punkte: leerJePerson((u) => gezaehlteTage.filter((tag) => istGesetzt(z, u, feld, tag)).length),
      minuten: leerJePerson((u) => Math.round(mengen[u].minuten)),
      seiten: istLesen ? leerJePerson((u) => Math.round(mengen[u].seiten)) : null,
      tage: leerJePerson((u) => tage.map((tag) => tag <= standTag && istGesetzt(z, u, feld, tag))),
    }
  }).sort((a, b) => {
    const summeA = a.punkte.erijon + a.punkte.koray
    const summeB = b.punkte.erijon + b.punkte.koray
    if (summeA !== summeB) return summeB - summeA
    // gleichstand nach der reihenfolge der app, damit die liste nicht springt
    return BERICHT_FELDER.indexOf(a.feld) - BERICHT_FELDER.indexOf(b.feld)
  })

  const schlafJetzt = leerJePerson((u) => schlafSchnitt(naechte, u, gezaehlteTage))
  const schlafVor = leerJePerson((u) => schlafSchnitt(naechte, u, vorwocheTage))

  const differenz = punkte.erijon - punkte.koray

  return {
    woche,
    tage,
    endgueltig,
    standTag,
    punkte,
    punktTage,
    vorwoche: {
      punkte: leerJePerson((u) => punkteDerWoche(z, u, vorwocheTage)),
      punktTage: leerJePerson((u) => punktTageDerWoche(z, u, vorwocheTage)),
    },
    sieger: differenz === 0 ? 'unentschieden' : differenz > 0 ? 'erijon' : 'koray',
    verlauf: baueVerlauf(z, tage, standTag),
    felder,
    schlaf: {
      naechte: naechteDerWoche(naechte.filter(n => abendDatum(n.einschlafzeit) <= standTag), tage),
      person: leerJePerson((u) => ({
        naechte: schlafJetzt[u].anzahl,
        minuten: trend(schlafJetzt[u].minuten, schlafVor[u].minuten),
        wert: trend(schlafJetzt[u].wert, schlafVor[u].wert),
      })),
    },
    gewicht: leerJePerson((u) => gewichtDerWoche(z.gewichte, u, gezaehlteTage)),
  }
}

/**
 * Die Wochen, fuer die ein Bericht Sinn ergibt: jede Woche ab der ersten, in
 * der ueberhaupt etwas steht, bis zur laufenden. Der Kalender braucht das, um
 * zu wissen, wo ein Berichtszeichen hingehoert und wo nicht.
 */
export function berichtsWochen(
  z: Zustand,
  naechte: Schlafnacht[],
  heuteKey: string
): Set<string> {
  const wochen = new Set<string>()

  const merke = (tag: string) => {
    if (tag <= heuteKey) wochen.add(wochenMontag(tag))
  }

  for (const [key, liste] of Object.entries(z.einheiten)) {
    if (liste.length > 0) merke(key.slice(key.lastIndexOf('|') + 1))
  }
  for (const key of Object.keys(z.gewichte)) merke(key.slice(key.indexOf('|') + 1))
  for (const a of z.aufenthalte) merke(toKey(new Date(a.ankunft)))
  for (const n of naechte) if (n.schlafMinuten > 0) merke(abendDatum(n.einschlafzeit))

  return wochen
}

/** `8:40` — stunden und minuten, wie im schlaftab */
export function alsDauer(minuten: number | null): string {
  if (minuten === null) return '—'
  const gerundet = Math.round(minuten)
  return `${Math.floor(gerundet / 60)}:${String(gerundet % 60).padStart(2, '0')}`
}

/**
 * Ein Pfeil mit Vorzeichen: `+57m`, `−6`, `±0`.
 *
 * Das Minus ist ein echtes Minuszeichen (U+2212), kein Bindestrich — in der
 * Zahlenschrift der App steht es auf derselben Hoehe wie das Plus.
 */
export function alsDelta(delta: number | null, einheit: '' | 'm' = ''): string {
  if (delta === null) return ''
  const gerundet = Math.round(delta)
  if (gerundet === 0) return `±0${einheit}`
  return `${gerundet > 0 ? '+' : '−'}${Math.abs(gerundet)}${einheit}`
}

/** die einheit eines feldes als wort, fuer beschriftungen */
export function feldEinheit(feld: FeldId): 'min' | 'seiten' | null {
  if (feld === 'gewicht') return null
  return area(feld).unit
}

/** die vier bereiche ohne das gewicht — fuer alles, was minuten zeigt */
export const BERICHT_BEREICHE = AREAS.map((a) => a.id)

/** was am rand einer kalenderzeile steht: wer die woche geholt hat, wie klar */
export type WochenMarke = {
  woche: string
  punkte: Record<UserId, number>
  sieger: UserId | 'unentschieden'
  /** ob die woche noch laeuft — dann ist es ein stand und kein ergebnis */
  laeuft: boolean
}

/**
 * Eine Marke je Woche mit Daten, fuer den Rand des Kalenders.
 *
 * Absichtlich viel kleiner als der ganze Bericht: der Kalender zeigt Monate
 * am Stueck, und fuer jede sichtbare Zeile den vollen Bericht zu rechnen
 * waere Arbeit fuer Zahlen, die niemand sieht. Hier zaehlen nur die Punkte.
 */
export function wochenMarken(
  z: Zustand,
  naechte: Schlafnacht[],
  heuteKey: string
): Map<string, WochenMarke> {
  const marken = new Map<string, WochenMarke>()
  const laufende = wochenMontag(heuteKey)

  for (const woche of berichtsWochen(z, naechte, heuteKey)) {
    const tage = weekDays(fromKey(woche)).filter(tag => tag <= heuteKey)
    const punkte = leerJePerson((u) => punkteDerWoche(z, u, tage))
    const differenz = punkte.erijon - punkte.koray
    marken.set(woche, {
      woche,
      punkte,
      sieger: differenz === 0 ? 'unentschieden' : differenz > 0 ? 'erijon' : 'koray',
      laeuft: woche >= laufende,
    })
  }

  return marken
}

/** Ermittelt ein praegnantes Wochen-Highlight oder einen Schwerpunkt je Person. */
export function ermittleHighlight(
  bericht: Wochenbericht,
  u: UserId
): { titel: string; text: string } {
  for (const f of bericht.felder) {
    const tage = f.tage[u]
    let maxFolge = 0
    let aktFolge = 0
    for (const an of tage) {
      if (an) {
        aktFolge++
        if (aktFolge > maxFolge) maxFolge = aktFolge
      } else {
        aktFolge = 0
      }
    }
    if (maxFolge >= 3) {
      const label = FELDER.find((x) => x.id === f.feld)?.label ?? f.feld
      return { titel: `${label}-serie`, text: `${maxFolge} tage in folge aktiv` }
    }
  }

  const sortierteFelder = [...bericht.felder].sort((a, b) => b.punkte[u] - a.punkte[u])
  const staerkstes = sortierteFelder[0]
  if (staerkstes && staerkstes.punkte[u] >= 2) {
    const label = FELDER.find((x) => x.id === staerkstes.feld)?.label ?? staerkstes.feld
    return { titel: `schwerpunkt ${label}`, text: `an ${staerkstes.punkte[u]} tagen gepunktet` }
  }

  const pkteDelta = bericht.punkte[u] - bericht.vorwoche.punkte[u]
  if (pkteDelta > 0) {
    return { titel: 'aufwärtstrend', text: `+${pkteDelta} punkte mehr als vorwoche` }
  }

  const schlafDelta = bericht.schlaf.person[u].minuten.delta
  if (schlafDelta !== null && schlafDelta >= 30) {
    return { titel: 'mehr schlaf', text: `+${schlafDelta} min. im schnitt zur vorwoche` }
  }
  const qualitaetDelta = bericht.schlaf.person[u].wert.delta
  if (qualitaetDelta !== null && qualitaetDelta >= 5) {
    return { titel: 'bessere erholung', text: `+${qualitaetDelta} punkte schlafqualität` }
  }

  if (bericht.gewicht[u].punkte.length >= 3) {
    return {
      titel: 'gewichtskonstanz',
      text: `${bericht.gewicht[u].punkte.length} messungen eingetragen`,
    }
  }

  if (bericht.punktTage[u] > 0) {
    return { titel: 'aktivität', text: `an ${bericht.punktTage[u]} tagen der woche aktiv` }
  }

  return { titel: 'ruhewoche', text: 'nächste woche neu angreifen' }
}
