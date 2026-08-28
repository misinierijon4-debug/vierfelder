import type { Phase, PhasenArt, Schlafnacht, UserId } from './types'

/**
 * Die Phasen kommen fertig aus `schlafnaechte_ansicht`; die Ansicht loest die
 * Ueberlappungen der Health-Segmente serverseitig auf. Hier wird nur noch
 * formatiert und verglichen — nichts geschaetzt und nichts ergaenzt.
 */

/** 15 uhr trennt zwei naechte: 00:15 liegt damit neben 23:45, nicht 23 stunden davor */
const PIVOT = 15 * 60
export const TAG = 1440

function zwei(n: number): string {
  return String(n).padStart(2, '0')
}

export function formatDauer(minuten: number): string {
  const m = Math.max(0, Math.round(minuten))
  const h = Math.floor(m / 60)
  const rest = m % 60
  if (h === 0) return `${rest}m`
  if (rest === 0) return `${h}h`
  return `${h}h ${rest}m`
}

export function formatUhrzeit(iso: string | null): string {
  if (!iso) return '--:--'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '--:--'
  return `${zwei(d.getHours())}:${zwei(d.getMinutes())}`
}

/** stunden mit deutschem komma, fuer die enge wochenspalte */
export function formatStunden(minuten: number): string {
  return `${(minuten / 60).toFixed(1).replace('.', ',')}h`
}

export function formatProzent(anteil: number): string {
  return `${Math.round(anteil * 100)}%`
}

/** lokale uhrzeit als nachtminute: 21:00 → 1260, 06:30 → 1830 */
export function nachtMinute(iso: string): number {
  const d = new Date(iso)
  const m = d.getHours() * 60 + d.getMinutes()
  return m < PIVOT ? m + TAG : m
}

/**
 * Der Tag, an dessen Abend die Nacht begonnen hat — als yyyy-mm-dd.
 *
 * Die Datenbank benennt eine Nacht nach dem Morgen (das Aufwachen am 26.),
 * Sleep Cycle und das Gefuehl nach dem Abend (ins Bett am 25.). Angezeigt
 * wird der Abend; gespeichert bleibt der Morgen.
 */
export function abendDatum(einschlafzeit: string): string {
  const d = new Date(einschlafzeit)
  // nach mitternacht eingeschlafen? dann gehoert die nacht zum tag davor
  if (d.getHours() * 60 + d.getMinutes() < PIVOT) d.setDate(d.getDate() - 1)
  const monat = String(d.getMonth() + 1).padStart(2, '0')
  const tag = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${monat}-${tag}`
}

/** nachtminute zurueck in eine uhrzeit, fuer achsen und mediane */
export function nachtUhrzeit(m: number): string {
  const rest = ((Math.round(m) % TAG) + TAG) % TAG
  return `${zwei(Math.floor(rest / 60))}:${zwei(rest % 60)}`
}

export type NachtPhasenAnalyse = {
  nacht: string
  user: UserId
  schlafMinuten: number
  /** zeit im bett aus den InBed-segmenten, sonst die schlafspanne */
  inBedMinuten: number
  inBedBasis: 'bett' | 'fenster'
  effizienz: number | null
  hatPhasenDaten: boolean
  hatZeitfensterDaten: boolean
  einschlafUhrzeit: string
  aufwachUhrzeit: string
  /** alles in nachtminuten, fuer den zeitstrahl */
  einschlafMinute: number
  aufwachMinute: number
  bettVon: number | null
  bettBis: number | null
  tiefMinuten: number
  remMinuten: number
  coreMinuten: number
  wachMinuten: number
  wachphasenAnzahl: number
  tiefProzent: number
  remProzent: number
  coreProzent: number
  wachProzent: number
  /** der verlauf der nacht, minuten ab dem einschlafen */
  stuecke: Phase[]
}

export function analysiereSchlafnacht(nacht: Schlafnacht): NachtPhasenAnalyse {
  const einschlafMinute = nachtMinute(nacht.einschlafzeit)
  const gemessenesEnde = nacht.aufwachzeit !== null
  const fenster = gemessenesEnde
    ? Math.max(1, nachtMinute(nacht.aufwachzeit!) - einschlafMinute)
    : Math.max(1, Math.round(nacht.schlafMinuten + nacht.wachMinuten))

  const hatBett = nacht.bettMinuten !== null && nacht.bettMinuten > 0
  const inBedMinuten = Math.round(hatBett ? nacht.bettMinuten! : fenster)

  const schlafMinuten = Math.round(nacht.schlafMinuten)
  const erfasst = nacht.tiefMinuten + nacht.remMinuten + nacht.kernMinuten
  const hatPhasenDaten = erfasst > 0

  const anteil = (teil: number) => (erfasst > 0 ? Math.round((teil / erfasst) * 100) : 0)
  const tiefProzent = anteil(nacht.tiefMinuten)
  const remProzent = anteil(nacht.remMinuten)

  return {
    nacht: nacht.nacht,
    user: nacht.user,
    schlafMinuten,
    inBedMinuten,
    inBedBasis: hatBett ? 'bett' : 'fenster',
    // ohne gemessenes ende gibt es kein ehrliches verhaeltnis
    effizienz:
      gemessenesEnde && inBedMinuten > 0
        ? Math.min(100, Math.round((schlafMinuten / inBedMinuten) * 100))
        : null,
    hatPhasenDaten,
    hatZeitfensterDaten: gemessenesEnde,
    einschlafUhrzeit: formatUhrzeit(nacht.einschlafzeit),
    aufwachUhrzeit: formatUhrzeit(nacht.aufwachzeit),
    einschlafMinute,
    aufwachMinute: einschlafMinute + fenster,
    bettVon: nacht.bettStart === null ? null : nachtMinute(nacht.bettStart),
    bettBis: nacht.bettEnde === null ? null : nachtMinute(nacht.bettEnde),
    tiefMinuten: Math.round(nacht.tiefMinuten),
    remMinuten: Math.round(nacht.remMinuten),
    coreMinuten: Math.round(nacht.kernMinuten + nacht.unspezMinuten),
    wachMinuten: Math.round(nacht.wachMinuten),
    wachphasenAnzahl: nacht.phasen.filter((p) => p.art === 'wach').length,
    tiefProzent,
    remProzent,
    coreProzent: erfasst > 0 ? Math.max(0, 100 - tiefProzent - remProzent) : 0,
    wachProzent: inBedMinuten > 0 ? Math.round((nacht.wachMinuten / inBedMinuten) * 100) : 0,
    // ohne stadien bleibt ein durchgehender block: die dauer ist trotzdem echt
    stuecke: nacht.phasen.length
      ? nacht.phasen
      : [{ art: 'unspez' as PhasenArt, start: 0, dauer: schlafMinuten }],
  }
}

/* ---------------------------------------------------------------- zeitstrahl */

/** 21 bis 09 uhr, waechst mit den daten, damit nie ein balken abgeschnitten wird */
export function achse(analysen: NachtPhasenAnalyse[]): { von: number; bis: number } {
  let von = 21 * 60
  let bis = 9 * 60 + TAG
  for (const a of analysen) {
    von = Math.min(von, Math.floor(Math.min(a.einschlafMinute, a.bettVon ?? a.einschlafMinute) / 60) * 60)
    bis = Math.max(bis, Math.ceil(Math.max(a.aufwachMinute, a.bettBis ?? a.aufwachMinute) / 60) * 60)
  }
  return { von, bis }
}

/** senkrechte marken alle drei stunden, auf volle drei-stunden-schritte gelegt */
export function stundenmarken(von: number, bis: number, schritt = 180): number[] {
  const marken: number[] = []
  for (let m = Math.ceil(von / schritt) * schritt; m <= bis; m += schritt) marken.push(m)
  return marken
}

export function position(m: number, von: number, bis: number): number {
  return (m - von) / (bis - von)
}

/* -------------------------------------------------------------------- duell */

export function median(werte: number[]): number {
  const s = [...werte].sort((a, b) => a - b)
  const mitte = Math.floor(s.length / 2)
  return s.length % 2 ? s[mitte]! : (s[mitte - 1]! + s[mitte]!) / 2
}

export type Wochenwerte = {
  user: UserId
  naechte: number
  schlafSchnitt: number | null
  gesamt: number
  /** median der einschlafzeit als nachtminute */
  einschlafMedian: number | null
  /** mittlere abweichung vom eigenen median, in minuten */
  streuung: number | null
  tiefAnteil: number | null
  wachSchnitt: number | null
}

export function wochenwerte(user: UserId, naechte: Schlafnacht[]): Wochenwerte {
  const eigene = naechte.filter((n) => n.user === user && n.schlafMinuten > 0)
  if (eigene.length === 0) {
    return {
      user,
      naechte: 0,
      schlafSchnitt: null,
      gesamt: 0,
      einschlafMedian: null,
      streuung: null,
      tiefAnteil: null,
      wachSchnitt: null,
    }
  }

  const einschlaf = eigene.map((n) => nachtMinute(n.einschlafzeit))
  const referenz = median(einschlaf)
  const gesamt = eigene.reduce((s, n) => s + n.schlafMinuten, 0)
  const mitStadien = eigene.filter((n) => n.tiefMinuten + n.remMinuten + n.kernMinuten > 0)
  const stadienSchlaf = mitStadien.reduce((s, n) => s + n.schlafMinuten, 0)

  return {
    user,
    naechte: eigene.length,
    schlafSchnitt: gesamt / eigene.length,
    gesamt,
    einschlafMedian: referenz,
    // eine einzelne nacht hat keine streuung, erst ab zwei ist der wert echt
    streuung:
      eigene.length > 1
        ? einschlaf.reduce((s, m) => s + Math.abs(m - referenz), 0) / eigene.length
        : null,
    tiefAnteil: stadienSchlaf
      ? mitStadien.reduce((s, n) => s + n.tiefMinuten, 0) / stadienSchlaf
      : null,
    wachSchnitt: eigene.reduce((s, n) => s + n.wachMinuten, 0) / eigene.length,
  }
}

export type Duellzeile = {
  id: string
  label: string
  text: Record<UserId, string>
  /** null heisst gleichstand oder zu wenig daten. dann bleibt beides grau */
  sieger: UserId | null
}

type Disziplin = {
  id: string
  label: string
  wert: (w: Wochenwerte) => number | null
  text: (w: Wochenwerte) => string
  /** 'hoch' heisst: mehr gewinnt */
  richtung: 'hoch' | 'tief'
  /** ein kleiner unterschied ist kein sieg */
  mindest: number
}

const OHNE = '—'

/**
 * Eine Person gilt in der Schlaf-Funktion als verbunden, sobald mindestens
 * eine Nacht erfolgreich importiert wurde. So bleibt "noch nicht verbunden"
 * klar von "für diese Nacht fehlen Daten" getrennt.
 */
export function registrierteSchlafNutzer(naechte: Schlafnacht[]): Set<UserId> {
  return new Set(naechte.map((nacht) => nacht.user))
}

const DISZIPLINEN: Disziplin[] = [
  {
    id: 'schnitt',
    label: 'schnitt pro nacht',
    wert: (w) => w.schlafSchnitt,
    text: (w) => (w.schlafSchnitt === null ? OHNE : formatDauer(w.schlafSchnitt)),
    richtung: 'hoch',
    mindest: 5,
  },
  {
    id: 'imbett',
    label: 'im bett ab',
    wert: (w) => w.einschlafMedian,
    text: (w) => (w.einschlafMedian === null ? OHNE : nachtUhrzeit(w.einschlafMedian)),
    richtung: 'tief',
    mindest: 5,
  },
  {
    id: 'konstanz',
    label: 'konstanz',
    wert: (w) => w.streuung,
    text: (w) => (w.streuung === null ? OHNE : `±${Math.round(w.streuung)}m`),
    richtung: 'tief',
    mindest: 5,
  },
  {
    id: 'wach',
    label: 'wach in der nacht',
    wert: (w) => w.wachSchnitt,
    text: (w) => (w.wachSchnitt === null ? OHNE : formatDauer(w.wachSchnitt)),
    richtung: 'tief',
    mindest: 3,
  },
  {
    id: 'tief',
    label: 'tiefschlaf',
    wert: (w) => w.tiefAnteil,
    text: (w) => (w.tiefAnteil === null ? OHNE : formatProzent(w.tiefAnteil)),
    richtung: 'hoch',
    mindest: 0.01,
  },
]

export function duell(a: Wochenwerte, b: Wochenwerte): Duellzeile[] {
  return DISZIPLINEN.map((d) => {
    const wa = d.wert(a)
    const wb = d.wert(b)
    let sieger: UserId | null = null
    if (wa !== null && wb !== null && Math.abs(wa - wb) >= d.mindest) {
      sieger = (d.richtung === 'hoch' ? wa > wb : wa < wb) ? a.user : b.user
    }
    return {
      id: d.id,
      label: d.label,
      text: { [a.user]: d.text(a), [b.user]: d.text(b) } as Record<UserId, string>,
      sieger,
    }
  })
}
