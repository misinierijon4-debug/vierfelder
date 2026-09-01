import { EBENE, NAHT } from './nachtkurve'
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

/**
 * Saettigung und Kruemmung der Qualitaetskurve. Beides ist gemessen, nicht
 * gewaehlt: siehe `qualitaet`.
 */
const QUALITAET_SAETTIGUNG = 530
const QUALITAET_EXPONENT = 0.7

/**
 * Ersatzkurve fuer den Nachtwert, nachempfunden dem Prozentwert von Sleep Cycle.
 *
 * Gerechnet wird der Nachtwert seit Score v2 in der Datenbank: ein Trigger auf
 * `schlafnaechte` setzt ihn bei jedem Schreibweg gleich, aus Dauer, Effizienz,
 * Phasen, Regelmaessigkeit und Unterbrechungen, normiert auf die Komponenten,
 * die diese Nacht wirklich hergibt. Kommt eine Nacht von dort, steht der Wert
 * schon in `Schlafnacht.nachtwert`, und diese Kurve wird nicht gebraucht.
 *
 * Sie bleibt fuer den Prototyp-Modus ohne Supabase: dort gibt es keinen Server,
 * der rechnet, und ein leerer Ring waere schlechter als eine grobe Schaetzung.
 *
 * Sleep Cycle rechnet mit Zeit im Bett, Tiefschlaf, Haeufigkeit und Intensitaet
 * der Bewegungen und der Anzahl vollstaendiger Aufwachvorgaenge, und kalibriert
 * das Ergebnis ueber die Zeit persoenlich. Die Bewegungsdaten kommen aus
 * Beschleunigungssensor und Mikrofon und stehen in Health nicht zur Verfuegung;
 * die Formel ist nicht veroeffentlicht. Nachgebaut ist darum nicht die Rechnung,
 * sondern ihr Ergebnis.
 *
 * Angepasst an vier gemessene Naechte (Schlafminuten -> Sleep Cycle):
 *
 *   274 -> 65    391 -> 81    467 -> 89    479 -> 96
 *
 * Aus einer Rastersuche ueber gedeckelte, richtig herum monotone Modelle bleibt
 * diese Potenzkurve als beste uebrig: hoechster Fehler 2,8 Prozentpunkte.
 *
 * Zwei Befunde aus derselben Suche, die gegen das Naheliegende sprechen:
 *
 *  - Effizienz (Schlaf durch Bettzeit) scheidet aus. Der Dienstag hat die beste
 *    Effizienz und nur die zweitbeste Qualitaet, der Sonntag die schlechtere
 *    Effizienz und die beste Qualitaet. Qualitaet kann keine Funktion davon
 *    sein, und sie mit hineinzunehmen verschlechtert die Anpassung auf 4,0.
 *  - Modelle mit Bettzeit *und* Schlafzeit sehen besser aus (1,4), sind aber
 *    wertlos: weil Bettzeit gleich Schlafzeit plus Wachzeit ist, sagen sie in
 *    Wahrheit "mehr Wachliegen ist besser".
 *
 * Was die Kurve nicht kann: sie sieht nur die Dauer. Eine lange, aber stark
 * zerrissene Nacht bewertet sie zu gut. Mehr gemessene Naechte wuerden das
 * zeigen — und die Kurve laesst sich dann nachziehen.
 */
export function qualitaet(schlafMinuten: number): number {
  const anteil = Math.max(0, schlafMinuten) / QUALITAET_SAETTIGUNG
  return Math.round(Math.min(100, 100 * anteil ** QUALITAET_EXPONENT))
}

/**
 * Ab wann ein Stueck Nacht eine eigene Phase ist, in Minuten.
 *
 * Health zerlegt eine Nacht in bis zu achtzig Stuecke, viele davon ein oder
 * zwei Minuten lang: einmal umdrehen, ein kurzes Absacken, die Decke richten.
 * Die Ansicht fasst schon zusammen, was hoechstens zwei Minuten auseinander
 * liegt — was danach noch kuerzer als diese Schwelle ist, ist kein Abschnitt
 * der Nacht, sondern ihr Rauschen.
 *
 * Fuer die Kurve heisst das: Wach darunter wird ein Strich statt eines
 * Ausschlags, ein Stadium darunter geht in seinen Nachbarn auf. Fuer die
 * Zahlen heisst es nichts — die Minuten je Stadium kommen aus den Summen der
 * Ansicht, nicht aus der gezeichneten Linie. Nur die Anzahl neben `wach`
 * zaehlt ab hier.
 */
export const PHASEN_SCHWELLE = 5

export type NachtPhasenAnalyse = {
  nacht: string
  user: UserId
  schlafMinuten: number
  /** zeit im bett aus den InBed-segmenten, sonst die schlafspanne */
  inBedMinuten: number
  inBedBasis: 'bett' | 'fenster'
  effizienz: number | null
  /** nachtwert v2 aus der datenbank; ohne datenbank die kurve aus `qualitaet` */
  qualitaet: number
  /** belegdichte des nachtwerts, 1 bis 100. null, wenn er geschaetzt ist */
  qualitaetKonfidenz: number | null
  hatPhasenDaten: boolean
  /**
   * ob der verlauf schon da ist. false heisst nicht "ohne stadien", sondern
   * "noch nicht geladen" — die kurve zeigt dann keinen erfundenen block
   */
  verlaufGeladen: boolean
  hatZeitfensterDaten: boolean
  einschlafUhrzeit: string
  aufwachUhrzeit: string
  /** hingelegt und wieder aufgestanden — null ohne InBed-segmente */
  imBettVonUhrzeit: string | null
  imBettBisUhrzeit: string | null
  /** vom hinlegen bis zum einschlafen. null ohne InBed-segmente */
  einschlafdauerMinuten: number | null
  /** alles in nachtminuten, fuer den zeitstrahl */
  einschlafMinute: number
  aufwachMinute: number
  bettVon: number | null
  bettBis: number | null
  tiefMinuten: number
  remMinuten: number
  coreMinuten: number
  /** wie in sleep cycle: alles im bett, was nicht schlaf war — das
   *  wachliegen vor dem einschlafen zaehlt mit */
  wachMinuten: number
  /** wach am stueck, mindestens `PHASEN_SCHWELLE` lang — kurzes drehen zaehlt nicht */
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

  const schlafMinuten = Math.round(nacht.schlafMinuten)

  const hatBett = nacht.bettMinuten !== null && nacht.bettMinuten > 0
  // die bettzeit kann nie kuerzer sein als der schlaf darin. stimmen die
  // beiden zahlen nicht zusammen, ist die laengere die einzige, die sicher
  // gemessen wurde — sonst stuende hier "12h 59m schlaf in 8h 45m bett"
  const inBedMinuten = Math.max(schlafMinuten, Math.round(hatBett ? nacht.bettMinuten! : fenster))
  const erfasst = nacht.tiefMinuten + nacht.remMinuten + nacht.kernMinuten
  const hatPhasenDaten = erfasst > 0

  const anteil = (teil: number) => (erfasst > 0 ? Math.round((teil / erfasst) * 100) : 0)
  const tiefProzent = anteil(nacht.tiefMinuten)
  const remProzent = anteil(nacht.remMinuten)

  const aufwachMinute = einschlafMinute + fenster
  const bettVon = nacht.bettStart === null ? null : nachtMinute(nacht.bettStart)
  const bettBis = nacht.bettEnde === null ? null : nachtMinute(nacht.bettEnde)

  // das wachliegen vor dem einschlafen und das noch-liegenbleiben danach
  const einschlafdauerMinuten =
    bettVon === null ? null : Math.max(0, Math.round(einschlafMinute - bettVon))
  const nachliegenMinuten = bettBis === null ? 0 : Math.max(0, Math.round(bettBis - aufwachMinute))

  // wach wie in sleep cycle: die bettzeit ohne den schlaf darin. gemessene
  // wachsegmente sind darin enthalten, das einschlafen kommt dazu.
  //
  // ohne InBed bleibt es bei den gemessenen wachsegmenten: das schlaffenster
  // gegen den schlaf zu rechnen wuerde luecken ohne jede health-messung zu
  // wachliegen erklaeren, und das waere geraten
  const wachMinuten = hatBett
    ? Math.max(Math.round(nacht.wachMinuten), inBedMinuten - schlafMinuten)
    : Math.round(nacht.wachMinuten)

  // `null` heisst nicht geladen, `[]` heisst ohne stadien gemessen. beides
  // ergibt hier denselben block — aber nur eines davon darf als aussage ueber
  // die nacht gelesen werden, deshalb steht der unterschied in der analyse
  const phasen = nacht.phasen ?? []

  // der verlauf zeigt die ganze bettzeit, nicht erst ab dem einschlafen
  const stuecke: Phase[] = phasen.length
    ? [...phasen]
    : [{ art: 'unspez' as PhasenArt, start: 0, dauer: schlafMinuten }]
  if (einschlafdauerMinuten !== null && einschlafdauerMinuten >= 1) {
    stuecke.unshift({ art: 'wach', start: -einschlafdauerMinuten, dauer: einschlafdauerMinuten })
  }
  if (nachliegenMinuten >= 1) {
    stuecke.push({ art: 'wach', start: fenster, dauer: nachliegenMinuten })
  }

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
    // der gerechnete wert hat vorrang: er sieht mehr als die dauer
    qualitaet: nacht.nachtwert ?? qualitaet(schlafMinuten),
    qualitaetKonfidenz: nacht.nachtwert === null ? null : nacht.scoreKonfidenz,
    hatPhasenDaten,
    verlaufGeladen: nacht.phasen !== null,
    hatZeitfensterDaten: gemessenesEnde,
    einschlafUhrzeit: formatUhrzeit(nacht.einschlafzeit),
    aufwachUhrzeit: formatUhrzeit(nacht.aufwachzeit),
    imBettVonUhrzeit: nacht.bettStart === null ? null : formatUhrzeit(nacht.bettStart),
    imBettBisUhrzeit: nacht.bettEnde === null ? null : formatUhrzeit(nacht.bettEnde),
    einschlafdauerMinuten,
    einschlafMinute,
    aufwachMinute,
    bettVon,
    bettBis,
    tiefMinuten: Math.round(nacht.tiefMinuten),
    remMinuten: Math.round(nacht.remMinuten),
    coreMinuten: Math.round(nacht.kernMinuten + nacht.unspezMinuten),
    wachMinuten,
    wachphasenAnzahl: phasen.filter((p) => p.art === 'wach' && p.dauer >= PHASEN_SCHWELLE)
      .length,
    tiefProzent,
    remProzent,
    coreProzent: erfasst > 0 ? Math.max(0, 100 - tiefProzent - remProzent) : 0,
    // anteil an der bettzeit: schlaf plus wach ergibt genau sie
    wachProzent:
      schlafMinuten + wachMinuten > 0
        ? Math.round((wachMinuten / (schlafMinuten + wachMinuten)) * 100)
        : 0,
    // ohne stadien bleibt ein durchgehender block: die dauer ist trotzdem echt
    stuecke,
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

/* ---------------------------------------------------------- nachtverlauf */

/** eine phase der nacht in nachtminuten, absolut statt ab dem einschlafen */
export type Verlaufsstueck = {
  art: PhasenArt
  von: number
  bis: number
}

export type Nachtverlauf = {
  /** die durchgehende linie: alles, was lang genug fuer eine eigene phase ist */
  linie: Verlaufsstueck[]
  /** kurzes wachwerden unter `PHASEN_SCHWELLE` — striche statt ausschlag */
  unruhen: Verlaufsstueck[]
}

/**
 * Die Phasen einer Nacht als durchgehende Folge in Nachtminuten.
 *
 * Alles unter `PHASEN_SCHWELLE` faellt aus der Linie: kurzes Wachwerden wird
 * zu einem Strich auf der Wachhoehe, ein kurzes Stadium geht wortlos in seinen
 * Nachbarn auf. Sonst ist eine Minute Umdrehen im Bild genauso laut wie eine
 * halbe Stunde Wachliegen, und aus einer ruhigen Nacht wird ein Lattenzaun.
 *
 * Die Zeit eines herausgenommenen Stuecks faellt nicht weg: sie geht je zur
 * Haelfte an die beiden Nachbarn, damit die Linie nicht reisst und die Uhr
 * weiterhin stimmt.
 *
 * Zwei direkt aneinander grenzende Stuecke gleicher Hoehe werden zu einem
 * zusammengefasst — sie waeren dieselbe waagerechte Linie, und eine Naht
 * mittendrin wuerde nur die Farbe doppelt zeichnen. Eine echte Luecke ohne
 * Messung bleibt eine Luecke.
 */
export function verlauf(analyse: NachtPhasenAnalyse): Nachtverlauf {
  const roh = analyse.stuecke
    .map((p) => ({
      art: p.art,
      von: analyse.einschlafMinute + p.start,
      bis: analyse.einschlafMinute + p.start + p.dauer,
      kurz: p.dauer < PHASEN_SCHWELLE,
    }))
    .filter((s) => s.bis > s.von)
    .sort((a, b) => a.von - b.von)

  // eine nacht ganz ohne langes stueck gibt es: dann traegt das laengste die
  // linie. ein leeres bild waere schlimmer als eine grobe kurve
  if (roh.length > 0 && roh.every((s) => s.kurz)) {
    roh.reduce((a, b) => (b.bis - b.von > a.bis - a.von ? b : a)).kurz = false
  }

  const gerade: Verlaufsstueck[] = []
  const unruhen: Verlaufsstueck[] = []

  roh.forEach((stueck, i) => {
    if (!stueck.kurz) {
      gerade.push({ art: stueck.art, von: stueck.von, bis: stueck.bis })
      return
    }
    // nur wach hinterlaesst eine spur: ein kurzes stadium ist nicht sichtbar,
    // ein kurzes wachwerden schon
    if (stueck.art === 'wach') unruhen.push({ art: 'wach', von: stueck.von, bis: stueck.bis })

    const davor = gerade[gerade.length - 1]
    const danach = roh.slice(i + 1).find((n) => !n.kurz)
    // `NAHT` statt eines Epsilons: Health setzt seine Grenzen sekundengenau,
    // zwei Segmente stossen darum fast nie auf die Nachkommastelle genau
    // aneinander. Mit einer Toleranz von Tausendsteln galt jedes Stueck als
    // alleinstehend, und die kurzen Stuecke verschwanden samt ihrer Zeit,
    // statt in den Nachbarn aufzugehen — es blieb ein Loch in der Linie.
    const linksDran = davor !== undefined && Math.abs(davor.bis - stueck.von) <= NAHT
    const rechtsDran = danach !== undefined && Math.abs(danach.von - stueck.bis) <= NAHT

    if (linksDran && rechtsDran) {
      const mitte = (stueck.von + stueck.bis) / 2
      davor.bis = mitte
      danach.von = mitte
    } else if (linksDran) {
      davor.bis = stueck.bis
    } else if (rechtsDran) {
      danach.von = stueck.von
    }
  })

  const linie: Verlaufsstueck[] = []
  for (const stueck of gerade) {
    const letztes = linie[linie.length - 1]
    if (letztes && EBENE[letztes.art] === EBENE[stueck.art] && stueck.von <= letztes.bis + NAHT) {
      letztes.bis = Math.max(letztes.bis, stueck.bis)
      continue
    }
    linie.push({ ...stueck })
  }

  return { linie, unruhen }
}
