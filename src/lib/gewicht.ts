import { addDays, daysBetween, fromKey, toKey } from './dates'
import { USERS, gewichtKey } from './types'
import type { Gewichte, UserId } from './types'

export type Gewichtsfenster = 30 | 90 | 'alles'

export type Rohwert = { tag: string; kg: number }

export type Gewichtspunkt = {
  tag: string
  /** roher tageswert */
  kg: number
  /** gleitender schnitt über [tag-6, tag] */
  trend: number
  /** trend minus basis — das ist die y-achse */
  delta: number
}

export type Gewichtsreihe = {
  user: UserId
  /** aufsteigend, nur tage mit eintrag */
  punkte: Gewichtspunkt[]
  /** trendwert am ersten punkt im fenster */
  basis: number
  /** jüngster roher eintrag im fenster */
  letzter: Rohwert | null
}

export type Achse = { min: number; max: number; schritt: number; marken: number[] }

const TREND_TAGE = 7
/** unter zwei kilo spannweite macht ein hundert-gramm-tag einen bergsturz */
const MIN_SPANNE = 2
const STUFEN = [0.5, 1, 2, 5, 10, 20]
const KG_MIN = 30
const KG_MAX = 300

const EINE_STELLE = new Intl.NumberFormat('de-DE', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
})
const TAGMONAT = new Intl.DateTimeFormat('de-DE', { day: 'numeric', month: 'numeric' })

/** volle historie einer person, aufsteigend */
export function reiheRoh(g: Gewichte, u: UserId): Rohwert[] {
  const praefix = `${u}|`
  return Object.entries(g)
    .filter(([key]) => key.startsWith(praefix))
    .map(([key, kg]) => ({ tag: key.slice(praefix.length), kg }))
    .sort((a, b) => (a.tag < b.tag ? -1 : a.tag > b.tag ? 1 : 0))
}

/**
 * nachlaufender schnitt über die kalendertage [tag-6, tag], nicht über die
 * letzten sieben einträge. sonst mittelt eine dreiwöchige lücke lautlos über
 * sich hinweg und erfindet einen verlauf, den es nie gab. index-gleich zu `roh`.
 */
export function trend(roh: Rohwert[], fensterTage: number = TREND_TAGE): number[] {
  return roh.map((punkt, i) => {
    const grenze = toKey(addDays(fromKey(punkt.tag), -(fensterTage - 1)))
    let summe = 0
    let anzahl = 0
    for (let j = i; j >= 0; j--) {
      if (roh[j]!.tag < grenze) break
      summe += roh[j]!.kg
      anzahl++
    }
    return summe / anzahl
  })
}

/** gemeinsame x-domain für beide personen */
export function fenster(
  g: Gewichte,
  heute: string,
  w: Gewichtsfenster
): { von: string; bis: string } {
  if (w !== 'alles') return { von: toKey(addDays(fromKey(heute), -(w - 1))), bis: heute }

  // 'alles' geht über beide personen: getrennte x-achsen zerstören den vergleich
  const fruehester = USERS.flatMap((u) => reiheRoh(g, u.id))
    .map((r) => r.tag)
    .sort()[0]
  return { von: fruehester && fruehester < heute ? fruehester : heute, bis: heute }
}

/**
 * der trend wird über die VOLLE historie gerechnet und erst danach aufs fenster
 * geschnitten — nur so hat der linke rand eines 30-tage-fensters schon sieben
 * messungen hinter sich und rauscht nicht.
 */
export function reihe(g: Gewichte, u: UserId, von: string, bis: string): Gewichtsreihe {
  const roh = reiheRoh(g, u)
  const trends = trend(roh)

  const imFenster: { roh: Rohwert; trend: number }[] = []
  for (let i = 0; i < roh.length; i++) {
    const r = roh[i]!
    if (r.tag >= von && r.tag <= bis) imFenster.push({ roh: r, trend: trends[i]! })
  }

  // basis ist der erste TREND-wert im fenster, nicht der erste rohwert
  const basis = imFenster[0]?.trend ?? 0
  const punkte = imFenster.map(({ roh: r, trend: t }) => ({
    tag: r.tag,
    kg: r.kg,
    trend: t,
    delta: t - basis,
  }))

  return { user: u, punkte, basis, letzter: imFenster[imFenster.length - 1]?.roh ?? null }
}

/**
 * y-domain über beide reihen. absichtlich nicht symmetrisch um null: symmetrie
 * verschenkt die halbe fläche in genau dem fall, der am häufigsten ist — beide
 * nehmen ab. die null ist trotzdem immer eine marke, weil beide grenzen auf ein
 * vielfaches der stufe schnappen.
 */
export function achse(reihen: Gewichtsreihe[]): Achse {
  const werte: number[] = []
  for (const r of reihen) {
    for (const p of r.punkte) {
      werte.push(p.delta)
      // der rohpunkt liegt auf derselben achse, sonst clippt er
      werte.push(p.kg - r.basis)
    }
  }

  let min = Math.min(0, ...werte)
  let max = Math.max(0, ...werte)

  // die mindestspanne muss VOR der abbildung greifen: bei max === min wird
  // jedes y zu NaN und das svg rendert stumm nichts.
  if (max - min < MIN_SPANNE) {
    const mitte = (max + min) / 2
    min = mitte - MIN_SPANNE / 2
    max = mitte + MIN_SPANNE / 2
    if (min > 0) [min, max] = [0, MIN_SPANNE]
    if (max < 0) [min, max] = [-MIN_SPANNE, 0]
  }

  const schritt = STUFEN.find((s) => (max - min) / s <= 4) ?? STUFEN[STUFEN.length - 1]!
  const unten = Math.floor(min / schritt) * schritt
  const oben = Math.ceil(max / schritt) * schritt

  const marken: number[] = []
  for (let w = unten; w <= oben + schritt / 2; w += schritt) {
    marken.push(Math.round(w * 100) / 100)
  }

  return { min: unten, max: oben, schritt, marken }
}

/**
 * stücke, getrennt bei lücken über `maxLuecke` tagen. ab sieben tagen teilen
 * sich zwei nachlaufende fenster keine messung mehr — die stücke sind dann
 * wirklich nicht derselbe trend.
 */
export function teileBeiLuecke(
  punkte: Gewichtspunkt[],
  maxLuecke: number = TREND_TAGE
): Gewichtspunkt[][] {
  const teile: Gewichtspunkt[][] = []
  for (const punkt of punkte) {
    const aktuell = teile[teile.length - 1]
    const vorher = aktuell?.[aktuell.length - 1]
    if (!aktuell || !vorher || daysBetween(fromKey(vorher.tag), fromKey(punkt.tag)) > maxLuecke) {
      teile.push([punkt])
    } else {
      aktuell.push(punkt)
    }
  }
  return teile
}

/** vier datumsmarken für die x-achse, gleichmäßig über das fenster */
export function xMarken(von: string, bis: string): { tag: string; text: string }[] {
  const spanne = Math.max(1, daysBetween(fromKey(von), fromKey(bis)))
  const anzahl = 4
  const marken: { tag: string; text: string }[] = []
  const gesehen = new Set<string>()

  for (let i = 0; i < anzahl; i++) {
    const tag = toKey(addDays(fromKey(von), Math.round((i / (anzahl - 1)) * spanne)))
    if (gesehen.has(tag)) continue
    gesehen.add(tag)
    marken.push({ tag, text: TAGMONAT.format(fromKey(tag)) })
  }

  return marken
}

export function gewichtAn(g: Gewichte, u: UserId, tag: string): number | null {
  return g[gewichtKey(u, tag)] ?? null
}

export function letztesGewicht(g: Gewichte, u: UserId): Rohwert | null {
  const roh = reiheRoh(g, u)
  return roh[roh.length - 1] ?? null
}

/** nimmt komma und punkt. enger als der check in der datenbank, damit der server nie ablehnt */
export function parseKg(text: string): number | null {
  const sauber = text.trim().toLowerCase().replace(/kg$/, '').trim().replace(',', '.')
  if (!/^\d+(\.\d+)?$/.test(sauber)) return null
  const kg = Math.round(Number(sauber) * 10) / 10
  if (!Number.isFinite(kg) || kg < KG_MIN || kg > KG_MAX) return null
  return kg
}

export function formatKg(kg: number): string {
  return EINE_STELLE.format(kg)
}

/** erst runden, dann das vorzeichen wählen — sonst wird aus -0,04 ein „−0,0" */
export function formatDelta(kg: number): string {
  const gerundet = Math.round(kg * 10) / 10
  if (gerundet === 0) return `±${EINE_STELLE.format(0)}`
  // U+2212 wie in Kopf.tsx und Bereichszeile.tsx, nicht der ascii-bindestrich
  return gerundet > 0
    ? `+${EINE_STELLE.format(gerundet)}`
    : `−${EINE_STELLE.format(-gerundet)}`
}
