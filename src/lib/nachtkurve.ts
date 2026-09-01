import type { PhasenArt } from './types'

/**
 * Der Verlauf einer Nacht als eine einzige, lueckenlose Kurve.
 *
 * Vorher entstand aus jeder Phase ein eigener SVG-Pfad, und ob zwei Pfade
 * aneinander stiessen, entschied ein Vergleich zweier Fliesskommazahlen in
 * Pixeln. Health liefert seine Grenzen aber sekundengenau: eine Sekunde Naht
 * zwischen zwei Segmenten ist bei 320 Einheiten fuer eine Nacht rund 0,011
 * Einheiten breit — knapp ueber der Toleranz von 0,01. Ab der ersten solchen
 * Naht galt jede Phase als alleinstehend, verlor ihre Uebergaenge und blieb
 * als waagerechter Strich stehen. Aus der Kurve wurde ein Lattenzaun.
 *
 * Dieses Modul kennt keine Nahtstellen mehr. Aus den rohen Intervallen wird
 * zuerst eine Zeitreihe mit fester Schrittweite gebaut — fuer jede Minute der
 * Nacht genau ein Wert, ohne Luecke und ohne `null`. Aus dieser Reihe wird
 * dann ein einziger Pfad. Der kann gar nicht reissen: er hat nur ein `M`.
 */

/**
 * Die vier Ebenen der Nacht als Anteil der Kurvenhoehe. 0 ist ganz oben,
 * 1 ganz unten — wach oben, darunter der Traum, dann der Kernschlaf,
 * zuunterst der Tiefschlaf.
 *
 * `unspez` teilt sich die Hoehe mit `kern`: dort hat Health nur "geschlafen"
 * gemeldet, ohne das Stadium zu nennen.
 */
export const EBENE: Record<PhasenArt, number> = {
  wach: 0.1,
  rem: 0.35,
  kern: 0.65,
  unspez: 0.65,
  tief: 0.9,
}

/** ein stueck nacht in nachtminuten, so wie `verlauf` es liefert */
export type Abschnitt = {
  art: PhasenArt
  von: number
  bis: number
}

/** schrittweite der zeitreihe in minuten — eine minute sind sechzig sekunden */
export const SCHRITT = 1

/**
 * Halbe Laenge eines Phasenuebergangs in Minuten — eine Flanke reicht also
 * dreizehn Minuten vor die Phasengrenze und dreizehn dahinter.
 *
 * In Minuten statt in Pixeln, damit dieselbe Nacht auf jeder Breite gleich
 * aussieht und eine kurze Nacht keine steileren Flanken bekommt als eine lange.
 * Mit der Schwelle aus `PHASEN_SCHWELLE` ist Platz dafuer: die Kurve fliesst
 * zwischen den Phasen, statt zu springen, und liest sich als Nacht statt als
 * Treppe. An kurzen Phasen bleibt die Flanke automatisch steil, weil sie nie
 * laenger wird als die halbe Nachbarphase.
 */
const UEBERGANG_MINUTEN = 13

/**
 * Und nie mehr als dieser Anteil der ganzen Nacht, damit eine kurze Nacht
 * nicht zu einer einzigen weichen Welle verlaeuft.
 */
const UEBERGANG_ANTEIL = 0.025

/**
 * Bis hierhin ist ein Abstand zwischen zwei Segmenten eine Rundungsnaht und
 * keine Messluecke. Die Ansicht fasst bereits zusammen, was hoechstens zwei
 * Minuten auseinanderliegt; was danach uebrig bleibt, sind die Sekunden, mit
 * denen Health seine Grenzen setzt.
 */
export const NAHT = 1

function klemme(wert: number, min: number, max: number): number {
  return wert < min ? min : wert > max ? max : wert
}

function rund(wert: number): number {
  return Math.round(wert * 100) / 100
}

/** weiche flanke: startet und endet waagerecht, dazwischen gleichmaessig */
function glatt(p: number): number {
  const t = klemme(p, 0, 1)
  return t * t * (3 - 2 * t)
}

/** eine ebene der nacht, aufgeraeumt: ohne ueberlappung, ohne naht, ohne dublette */
type Ebenenstueck = {
  art: PhasenArt
  von: number
  bis: number
  /** hoehe als anteil, 0 oben bis 1 unten */
  y: number
}

/**
 * Der Uebergang zwischen zwei Ebenen.
 *
 * `linear` unterscheidet die beiden Faelle: eine echte Messluecke wird als
 * Gerade zum naechsten bekannten Punkt ueberbrueckt — sie ist geraten und
 * sieht auch so aus. Ein gemessener Phasenwechsel bekommt eine weiche Flanke.
 */
type Uebergang = {
  von: number
  bis: number
  linear: boolean
}

/**
 * Aus rohen Intervallen wird eine saubere Folge von Ebenen.
 *
 * Ueberlappungen werden abgeschnitten, Nahtstellen geschlossen, direkt
 * aneinander grenzende Stuecke gleicher Hoehe zu einem vereint. Was hier
 * herauskommt, ist streng aufsteigend und ueberschneidungsfrei.
 */
function ebenen(stuecke: readonly Abschnitt[]): Ebenenstueck[] {
  const roh = stuecke
    .filter(
      (s) =>
        Number.isFinite(s.von) &&
        Number.isFinite(s.bis) &&
        s.bis > s.von &&
        EBENE[s.art] !== undefined
    )
    .map((s) => ({ art: s.art, von: s.von, bis: s.bis, y: EBENE[s.art] }))
    .sort((a, b) => a.von - b.von || a.bis - b.bis)

  const raus: Ebenenstueck[] = []
  for (const s of roh) {
    const letzte = raus[raus.length - 1]
    if (!letzte) {
      raus.push({ ...s })
      continue
    }

    // ueberlappung: das spaetere stueck beginnt erst, wo das fruehere endet
    const von = Math.max(s.von, letzte.bis)
    if (s.bis <= von) continue

    const luecke = von - letzte.bis
    if (luecke > 0 && luecke <= NAHT) {
      // eine sekunde naht ist keine luecke: beide treffen sich in ihrer mitte
      const mitte = letzte.bis + luecke / 2
      letzte.bis = mitte
      if (letzte.y === s.y) {
        letzte.bis = s.bis
        continue
      }
      raus.push({ ...s, von: mitte })
      continue
    }

    if (luecke === 0 && letzte.y === s.y) {
      // gleiche hoehe, direkt aneinander: eine naht mittendrin waere nur
      // dieselbe waagerechte linie zweimal gezeichnet
      letzte.bis = s.bis
      continue
    }

    raus.push({ ...s, von })
  }

  return raus
}

/** je ein uebergang zwischen zwei benachbarten ebenen */
function uebergaenge(eb: readonly Ebenenstueck[], spanne: number): Uebergang[] {
  const halb = Math.max(0, Math.min(UEBERGANG_MINUTEN, spanne * UEBERGANG_ANTEIL))

  return eb.slice(0, -1).map((stueck, i) => {
    const naechste = eb[i + 1]!
    const luecke = naechste.von - stueck.bis

    // ueber eine echte messluecke wird geradlinig zum naechsten bekannten
    // punkt interpoliert, statt die kurve abreissen zu lassen
    if (luecke > 0) return { von: stueck.bis, bis: naechste.von, linear: true }

    // sonst eine weiche flanke, die nie mehr als die haelfte einer der beiden
    // nachbarphasen frisst — sonst ueberrennt sie die phase, aus der sie kommt
    const r = Math.max(
      0,
      Math.min(halb, (stueck.bis - stueck.von) / 2, (naechste.bis - naechste.von) / 2)
    )
    return { von: stueck.bis - r, bis: stueck.bis + r, linear: false }
  })
}

/**
 * Die Hoehe der Nacht zu einem beliebigen Zeitpunkt — fuer jedes `t` genau ein
 * endlicher Wert zwischen 0 und 1. Vor der ersten und nach der letzten Ebene
 * bleibt die Kurve auf ihrer Hoehe stehen, statt ins Leere zu laufen.
 */
function tiefeBei(eb: readonly Ebenenstueck[], ueb: readonly Uebergang[], t: number): number {
  const erste = eb[0]!
  const letzte = eb[eb.length - 1]!
  if (t <= erste.von) return erste.y
  if (t >= letzte.bis) return letzte.y

  for (let i = 0; i < eb.length; i++) {
    const u = ueb[i]
    if (!u || t < u.von) return eb[i]!.y
    if (t <= u.bis) {
      const breite = u.bis - u.von
      // ein uebergang ohne breite ist ein sprung: dahinter gilt schon die
      // naechste hoehe. eine division durch null gibt es hier nicht
      if (breite <= 0) return eb[i + 1]!.y
      const p = (t - u.von) / breite
      const anteil = u.linear ? klemme(p, 0, 1) : glatt(p)
      return eb[i]!.y + (eb[i + 1]!.y - eb[i]!.y) * anteil
    }
  }

  return letzte.y
}

/** ein punkt der zeitreihe: nachtminute und hoehe als anteil */
export type Reihenpunkt = {
  t: number
  tiefe: number
}

/**
 * Die Nacht als lueckenlose Zeitreihe mit fester Schrittweite.
 *
 * Genau hier verschwindet die alte Fehlerquelle: ab dieser Stelle gibt es
 * keine Intervalle mehr, deren Enden zueinander passen muessten, sondern nur
 * noch eine Folge von Werten in gleichem Abstand.
 */
export function zeitreihe(
  stuecke: readonly Abschnitt[],
  von: number,
  bis: number,
  schritt = SCHRITT
): Reihenpunkt[] {
  const eb = ebenen(stuecke)
  if (eb.length === 0 || !(bis > von) || !(schritt > 0)) return []

  const ueb = uebergaenge(eb, bis - von)
  const anzahl = Math.max(1, Math.ceil((bis - von) / schritt))
  const reihe: Reihenpunkt[] = []

  for (let k = 0; k <= anzahl; k++) {
    // aus dem index gerechnet statt aufaddiert: so laeuft der letzte schritt
    // auch nach tausend minuten noch genau auf `bis`
    const t = Math.min(von + k * schritt, bis)
    if (k > 0 && t <= reihe[reihe.length - 1]!.t) continue
    reihe.push({ t, tiefe: tiefeBei(eb, ueb, t) })
  }

  return reihe
}

/** ein punkt der kurve in svg-einheiten */
type Punkt = { x: number; y: number }

/**
 * Punkte, die genau auf der Verbindung ihrer Nachbarn liegen, tragen nichts
 * bei: eine Plateauminute mitten im Tiefschlaf ergibt dieselbe Gerade wie
 * keine. Sie fallen raus, damit aus einer langen Nacht kein Pfad mit
 * tausend Stuetzpunkten wird. Die Kurve aendert sich dadurch nicht — die
 * Abweichung bleibt unter einem hundertstel Pixel.
 */
const GERADE_TOLERANZ = 0.005

function ohneGeradenpunkte(punkte: readonly Punkt[]): Punkt[] {
  if (punkte.length <= 2) return [...punkte]

  const raus: Punkt[] = [punkte[0]!]
  for (let i = 1; i < punkte.length - 1; i++) {
    const a = raus[raus.length - 1]!
    const b = punkte[i]!
    const c = punkte[i + 1]!
    const spanne = c.x - a.x
    if (spanne <= 0) continue
    const aufLinie = a.y + ((c.y - a.y) * (b.x - a.x)) / spanne
    if (Math.abs(aufLinie - b.y) > GERADE_TOLERANZ) raus.push(b)
  }
  raus.push(punkte[punkte.length - 1]!)
  return raus
}

/**
 * Steigungen nach Fritsch–Carlson, dieselbe Formel wie `curveMonotoneX` in
 * d3: das gewichtete harmonische Mittel der beiden Nachbarsteigungen, auf
 * null gesetzt, wo die Kurve ihre Richtung wechselt.
 *
 * Das ist die Eigenschaft, auf die es hier ankommt: die Kurve schwingt
 * zwischen zwei Stuetzpunkten nie ueber sie hinaus. Eine Nacht bekaeme sonst
 * an jedem Phasenwechsel einen Ausschlag, den niemand geschlafen hat — eine
 * Delle unter den Tiefschlaf, eine Spitze ueber das Wachsein.
 */
function steigungen(punkte: readonly Punkt[]): number[] {
  const n = punkte.length
  const h: number[] = []
  const d: number[] = []
  for (let i = 0; i < n - 1; i++) {
    h[i] = punkte[i + 1]!.x - punkte[i]!.x
    d[i] = h[i]! > 0 ? (punkte[i + 1]!.y - punkte[i]!.y) / h[i]! : 0
  }

  const m: number[] = new Array(n).fill(0)
  for (let i = 1; i < n - 1; i++) {
    const d0 = d[i - 1]!
    const d1 = d[i]!
    if (d0 * d1 <= 0) {
      m[i] = 0
      continue
    }
    const h0 = h[i - 1]!
    const h1 = h[i]!
    const gewichtet = (d0 * h1 + d1 * h0) / (h0 + h1)
    m[i] =
      (Math.sign(d0) + Math.sign(d1)) *
      Math.min(Math.abs(d0), Math.abs(d1), Math.abs(gewichtet) / 2)
  }

  // die enden bekommen die einseitige drei-punkt-steigung, wie in d3
  if (n === 2) {
    m[0] = d[0]!
    m[1] = d[0]!
  } else if (n > 2) {
    m[0] = (3 * d[0]! - m[1]!) / 2
    m[n - 1] = (3 * d[n - 2]! - m[n - 2]!) / 2
  }

  return m
}

/**
 * Ein einziger SVG-Pfad durch alle Punkte, als monotone kubische Bezierkurve.
 *
 * Ein `M`, danach nur noch `C`. Der Pfad hat damit keine Stelle, an der er
 * reissen koennte — anders als eine Folge von Teilpfaden, die sich am Ende
 * treffen muessen.
 */
export function monotonerPfad(punkte: readonly Punkt[]): string {
  if (punkte.length === 0) return ''
  const erste = punkte[0]!
  if (punkte.length === 1) return `M ${rund(erste.x)} ${rund(erste.y)}`

  const m = steigungen(punkte)
  const teile = [`M ${rund(erste.x)} ${rund(erste.y)}`]

  for (let i = 0; i < punkte.length - 1; i++) {
    const a = punkte[i]!
    const b = punkte[i + 1]!
    const h = (b.x - a.x) / 3
    teile.push(
      `C ${rund(a.x + h)} ${rund(a.y + m[i]! * h)}` +
        ` ${rund(b.x - h)} ${rund(b.y - m[i + 1]! * h)}` +
        ` ${rund(b.x)} ${rund(b.y)}`
    )
  }

  return teile.join(' ')
}

/**
 * Eine Farbmarke des Verlaufsverlaufs: an welchem Anteil der Nacht welche
 * Phase die Farbe stellt. Aus ihnen werden die `<stop>` des Farbverlaufs.
 */
export type Farbmarke = {
  /** 0 bis 1, anteil der nacht */
  offset: number
  art: PhasenArt
}

function farbmarken(
  eb: readonly Ebenenstueck[],
  ueb: readonly Uebergang[],
  von: number,
  bis: number
): Farbmarke[] {
  const anteil = (t: number) => klemme((t - von) / (bis - von), 0, 1)

  const roh: Farbmarke[] = [{ offset: 0, art: eb[0]!.art }]
  for (let i = 0; i < eb.length - 1; i++) {
    const u = ueb[i]!
    // die farbe wechselt genau dort, wo die kurve ihre hoehe wechselt
    roh.push({ offset: anteil(u.von), art: eb[i]!.art })
    roh.push({ offset: anteil(u.bis), art: eb[i + 1]!.art })
  }
  roh.push({ offset: 1, art: eb[eb.length - 1]!.art })

  // svg verlangt aufsteigende offsets; rundung darf das nie kippen
  let letzter = 0
  return roh.map((marke) => {
    const offset = Math.max(letzter, marke.offset)
    letzter = offset
    return { offset, art: marke.art }
  })
}

export type Kurvenmasse = {
  breite: number
  /** hoehe des kurvenfeldes; die ebenen liegen als anteil darin */
  hoehe: number
}

export type Nachtkurve = {
  /** der eine pfad. leer, wenn die nacht keine zeichenbaren phasen hat */
  d: string
  /** die farbverlaufsmarken, aufsteigend nach offset */
  marken: Farbmarke[]
  /** die zeitreihe, aus der der pfad entstanden ist */
  reihe: Reihenpunkt[]
}

/**
 * Der ganze Weg in einem Aufruf: rohe Intervalle rein, ein Pfad und seine
 * Farbmarken raus.
 *
 * Die Zeitachse ist die dieser einen Nacht — `von` und `bis` kommen aus den
 * Daten, nicht aus einem festen Raster. Damit ist die Aufloesung fuer jede
 * Nacht so fein wie moeglich, und die Rechnung bleibt fuer eine Nacht von
 * drei Stunden dieselbe wie fuer eine von vierzehn.
 */
export function nachtkurve(
  stuecke: readonly Abschnitt[],
  von: number,
  bis: number,
  masse: Kurvenmasse
): Nachtkurve {
  const leer: Nachtkurve = { d: '', marken: [], reihe: [] }
  if (!Number.isFinite(von) || !Number.isFinite(bis) || bis <= von) return leer

  const eb = ebenen(stuecke)
  if (eb.length === 0) return leer

  const ueb = uebergaenge(eb, bis - von)
  const reihe = zeitreihe(stuecke, von, bis)
  if (reihe.length === 0) return leer

  const spanne = bis - von
  const punkte = reihe.map((p) => ({
    x: ((p.t - von) / spanne) * masse.breite,
    y: p.tiefe * masse.hoehe,
  }))

  return {
    d: monotonerPfad(ohneGeradenpunkte(punkte)),
    marken: farbmarken(eb, ueb, von, bis),
    reihe,
  }
}
