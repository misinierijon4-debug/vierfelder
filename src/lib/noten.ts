import type { Fach, Note, UserId } from './types'
import { GEWICHT_STANDARD, neueNotenId } from './types'

/** Offizielle MSS-Regeln fuer den Abiturjahrgang 2027. */
export const ABI_FORMEL_GEPRUEFT = true
export const ABI_FORMEL_QUELLE = 'mss rheinland-pfalz, fassung februar 2025, abitur 2027'
export const EINGEBRACHTE_KURSE = 36
export const LF_KURSE = 12
export const GF_KURSE = 24
export const DOPPELT_GEWERTETE_LF_KURSE = 8
export const BLOCK_I_WERTUNGEN = 44
export const BLOCK_I_FAKTOR = 40 / BLOCK_I_WERTUNGEN
export const BLOCK_I_MINIMUM = 200
export const BLOCK_II_MINIMUM = 100
export const UNTERKURSE_MAXIMUM = 7

export type Fachschnitt = {
  klausur: number | null
  muendlich: number | null
  gesamt: number | null
  anzahl: number
}

export type Abiprognose = {
  blockI: number
  blockII: number
  gesamt: number
  note: number
  unterkurse: { lf: number; gf: number }
  huerden: string[]
  belegt: number
  hochgerechnet: boolean
}

const KURZ = ['6', '5−', '5', '5+', '4−', '4', '4+', '3−', '3', '3+', '2−', '2', '2+', '1−', '1', '1+']

export function punkteZuNote(punkte: number): number {
  const p = Math.min(15, Math.max(0, punkte))
  if (p === 0) return 6
  return Math.min(6, Math.max(1, 17 / 3 - p / 3))
}

export function punkteKurz(punkte: number): string {
  return KURZ[Math.round(Math.min(15, Math.max(0, punkte)))]!
}

function gewichteterSchnitt(noten: Note[]): number | null {
  if (noten.length === 0) return null
  const gewicht = noten.reduce((summe, note) => summe + note.gewicht, 0)
  if (gewicht <= 0) return null
  return noten.reduce((summe, note) => summe + note.punkte * note.gewicht, 0) / gewicht
}

export function fachSchnitt(noten: Note[], fach: Fach): Fachschnitt {
  const imFach = noten.filter((note) => note.fachId === fach.id)
  const klausur = gewichteterSchnitt(imFach.filter((note) => note.art === 'klausur'))
  const muendlich = gewichteterSchnitt(imFach.filter((note) => note.art === 'muendlich'))
  const gesamt = klausur !== null && muendlich !== null
    ? (klausur * fach.klausurAnteil + muendlich * (100 - fach.klausurAnteil)) / 100
    : klausur ?? muendlich
  return { klausur, muendlich, gesamt, anzahl: imFach.length }
}

export function gesamtSchnitt(faecher: Fach[], noten: Note[], user: UserId): number | null {
  const werte = faecher
    .filter((fach) => fach.user === user)
    .map((fach) => fachSchnitt(noten, fach).gesamt)
    .filter((wert): wert is number => wert !== null)
  return werte.length === 0 ? null : werte.reduce((summe, wert) => summe + wert, 0) / werte.length
}

export function defizite(faecher: Fach[], noten: Note[], user: UserId): Fach[] {
  return faecher.filter((fach) => {
    if (fach.user !== user) return false
    const schnitt = fachSchnitt(noten, fach).gesamt
    return schnitt !== null && schnitt < 5
  })
}

export function trend(noten: Note[], fachId: string, n = 6): number[] {
  return noten
    .map((note, index) => ({ note, index }))
    .filter(({ note }) => note.fachId === fachId)
    .sort((a, b) => a.note.datum.localeCompare(b.note.datum) || a.index - b.index)
    .slice(-Math.max(0, n))
    .map(({ note }) => note.punkte)
}

/** Offizielle Punktetabelle statt normal gerundeter linearer Formel. */
const ABI_NOTEN: Array<[minimum: number, note: number]> = [
  [823, 1.0], [805, 1.1], [787, 1.2], [769, 1.3], [751, 1.4], [733, 1.5],
  [715, 1.6], [697, 1.7], [679, 1.8], [661, 1.9], [643, 2.0], [625, 2.1],
  [607, 2.2], [589, 2.3], [571, 2.4], [553, 2.5], [535, 2.6], [517, 2.7],
  [499, 2.8], [481, 2.9], [463, 3.0], [445, 3.1], [427, 3.2], [409, 3.3],
  [391, 3.4], [373, 3.5], [355, 3.6], [337, 3.7], [319, 3.8], [301, 3.9],
  [300, 4.0],
]

export function gesamtpunkteZuAbinote(gesamt: number): number {
  const punkte = Math.min(900, Math.max(300, Math.round(gesamt)))
  return ABI_NOTEN.find(([minimum]) => punkte >= minimum)?.[1] ?? 4
}

function mittel(werte: number[]): number | null {
  return werte.length === 0 ? null : werte.reduce((summe, wert) => summe + wert, 0) / werte.length
}

/**
 * Nur das laufende Halbjahr ist vorhanden. Jeder aktuelle Fachschnitt wird
 * deshalb auf vier Kurshalbjahre hochgerechnet. Ab Abitur 2027 werden nur die
 * zwei staerkeren der drei LF doppelt gewertet.
 */
export function abiPrognose(faecher: Fach[], noten: Note[], user: UserId): Abiprognose | null {
  const eigene = faecher.filter((fach) => fach.user === user)
  const mitSchnitt = eigene.map((fach) => ({ fach, schnitt: fachSchnitt(noten, fach).gesamt }))
  const belegte = mitSchnitt.filter((x): x is { fach: Fach; schnitt: number } => x.schnitt !== null)
  if (belegte.length === 0) return null

  const fallback = mittel(belegte.map((x) => x.schnitt))!
  const lf = mitSchnitt
    .filter((x) => x.fach.kursart === 'lf')
    .map((x) => x.schnitt ?? fallback)
    .slice(0, 3)
  while (lf.length < 3) lf.push(fallback)
  const gfBelegt = belegte.filter((x) => x.fach.kursart === 'gf')
  const gfSchnitt = mittel(gfBelegt.map((x) => x.schnitt)) ?? fallback
  const lfAbsteigend = [...lf].sort((a, b) => b - a)

  const p = lf.reduce((summe, wert) => summe + wert * 4, 0)
    + lfAbsteigend.slice(0, 2).reduce((summe, wert) => summe + wert * 4, 0)
    + gfSchnitt * GF_KURSE
  const blockI = Math.min(600, Math.max(0, Math.round(p * BLOCK_I_FAKTOR)))

  // Drei LF schriftlich, dazu mindestens ein muendliches GF. Solange dieses
  // noch nicht gewaehlt ist, steht der aktuelle GF-Schnitt dafuer ein.
  const gfPruefungen = mitSchnitt
    .filter((x) => x.fach.kursart === 'gf' && x.fach.pruefungsfach !== null)
    .sort((a, b) => (a.fach.pruefungsfach ?? 9) - (b.fach.pruefungsfach ?? 9))
    .map((x) => x.schnitt ?? gfSchnitt)
  const hatFuenftes = eigene.some((fach) => fach.pruefungsfach === 5)
  const pruefungen = [...lf, gfPruefungen[0] ?? gfSchnitt]
  if (hatFuenftes) pruefungen.push(gfPruefungen[1] ?? gfSchnitt)
  const faktor = hatFuenftes ? 4 : 5
  const blockII = Math.min(300, Math.max(0, Math.round(pruefungen.reduce((s, p) => s + p, 0) * faktor)))

  const unter = defizite(eigene, noten, user)
  const lfUnter = Math.min(LF_KURSE, unter.filter((f) => f.kursart === 'lf').length * 4)
  const gfUnter = Math.min(GF_KURSE, unter.filter((f) => f.kursart === 'gf').length * 4)
  const huerden: string[] = []
  if (blockI < BLOCK_I_MINIMUM) huerden.push('block i unter 200 punkten')
  if (blockII < BLOCK_II_MINIMUM) huerden.push('block ii unter 100 punkten')
  if (lfUnter + gfUnter > UNTERKURSE_MAXIMUM) huerden.push('mehr als 7 unterkurse')
  if (belegte.some((x) => x.schnitt === 0)) huerden.push('ein kurs mit 0 punkten ist nicht einbringbar')
  const bestandenePruefungen = pruefungen.filter((punkte) => punkte >= 5).length
  const benoetigt = hatFuenftes ? 3 : 2
  if (bestandenePruefungen < benoetigt) {
    huerden.push(`weniger als ${benoetigt} prüfungsfächer mit mindestens 5 punkten`)
  }

  const gesamt = Math.min(900, blockI + blockII)
  return {
    blockI,
    blockII,
    gesamt,
    note: gesamtpunkteZuAbinote(gesamt),
    unterkurse: { lf: lfUnter, gf: gfUnter },
    huerden,
    belegt: belegte.length,
    hochgerechnet: true,
  }
}

/** welchen Punkteschnitt die Hochrechnung mindestens fuer die Zielnote braucht */
export function brauchtFuerZiel(
  faecher: Fach[],
  noten: Note[],
  user: UserId,
  ziel: number
): number | null {
  const prognose = abiPrognose(faecher, noten, user)
  if (!prognose || prognose.note <= ziel) return null
  const minimum = ABI_NOTEN.filter(([, note]) => note <= ziel).at(-1)?.[0]
  if (minimum === undefined) return null
  const benoetigt = minimum / 60
  return benoetigt <= 15 ? benoetigt : null
}

/** kleinste ganze Punktzahl der naechsten normalen Klausur fuer den Zielschnitt */
export function brauchtInKlausur(noten: Note[], fach: Fach, ziel: number): number | null {
  const aktuell = fachSchnitt(noten, fach).gesamt
  if (aktuell !== null && aktuell >= ziel) return null
  for (let punkte = 0; punkte <= 15; punkte++) {
    const probe: Note = {
      id: neueNotenId(), user: fach.user, fachId: fach.id, art: 'klausur',
      punkte, gewicht: GEWICHT_STANDARD, datum: '9999-12-31', titel: '',
    }
    const schnitt = fachSchnitt([...noten, probe], fach).gesamt
    if (schnitt !== null && schnitt >= ziel) return punkte
  }
  return null
}
