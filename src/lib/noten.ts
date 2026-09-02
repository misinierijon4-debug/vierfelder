import type { Einheit, Fach, Note, UserId } from './types'
import { GEWICHT_STANDARD, neueNotenId } from './types'
import { addDays, fromKey, toKey } from './dates'

/**
 * Offizielle MSS-Regeln fuer den Abiturjahrgang 2027. Die Zahlen sind gegen
 * die MSS-Fassung Rheinland-Pfalz vom Februar 2025 fuer das Abitur 2027
 * geprueft — wer sie aendert, prueft dort nach.
 */
export const EINGEBRACHTE_KURSE = 36
export const LK_KURSE = 12
export const GK_KURSE = 24
export const DOPPELT_GEWERTETE_LK_KURSE = 8
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
  unterkurse: { lk: number; gk: number }
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

/** feste schulische gewichtung: lk 50/50, gk 33/67. */
export function klausurAnteil(kursart: Fach['kursart']): number {
  return kursart === 'lk' ? 50 : 33
}

/** epo zählt im mündlichen topf doppelt, eine hü einfach. */
export function notenGewicht(art: Note['art']): number {
  return art === 'epo' ? 20 : GEWICHT_STANDARD
}

export function fachSchnitt(noten: Note[], fach: Fach): Fachschnitt {
  const imFach = noten.filter((note) => note.fachId === fach.id)
  const klausur = gewichteterSchnitt(imFach.filter((note) => note.art === 'klausur'))
  const muendlich = gewichteterSchnitt(imFach.filter((note) => note.art === 'epo' || note.art === 'hue'))
  const anteil = klausurAnteil(fach.kursart)
  const gesamt = klausur !== null && muendlich !== null
    ? (klausur * anteil + muendlich * (100 - anteil)) / 100
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

/** beobachtungswert, keine mss-formel: lk zaehlt doppelt so schwer wie gk. */
export function kursGewichteterSchnitt(faecher: Fach[], noten: Note[], user: UserId): number | null {
  const gewichtet = faecher
    .filter((fach) => fach.user === user)
    .map((fach) => ({ fach, schnitt: fachSchnitt(noten, fach).gesamt }))
    .filter((x): x is { fach: Fach; schnitt: number } => x.schnitt !== null)
  if (gewichtet.length === 0) return null
  const faktor = (kursart: Fach['kursart']) => (kursart === 'lk' ? 2 : 1)
  const summe = gewichtet.reduce((s, x) => s + x.schnitt * faktor(x.fach.kursart), 0)
  const nenner = gewichtet.reduce((s, x) => s + faktor(x.fach.kursart), 0)
  return summe / nenner
}

/**
 * beobachtung: wie viel in den letzten `fensterTage` tagen vor der note gelernt
 * wurde — eine summe, keine aussage ueber ursache und wirkung.
 */
export function lernMinutenVorNoten(
  einheiten: Einheit[],
  noten: Note[],
  user: UserId,
  fensterTage = 14
): Array<{ note: Note; lernMinuten: number }> {
  return noten
    .filter((note) => note.user === user)
    .map((note) => {
      const start = toKey(addDays(fromKey(note.datum), -(fensterTage - 1)))
      const lernMinuten = einheiten
        .filter((einheit) => einheit.user === user && einheit.area === 'lernen' && einheit.tag >= start && einheit.tag <= note.datum)
        .reduce((summe, einheit) => summe + (einheit.wert ?? 0), 0)
      return { note, lernMinuten }
    })
    .sort((a, b) => a.note.datum.localeCompare(b.note.datum))
}

/**
 * wer mit wem verglichen wird. die beiden haben nicht dieselben kurse: einen
 * lk gegen einen gk zu stellen waere kein vergleich, und `bio` hat auf der
 * anderen seite gar keinen namensvetter. deshalb steht hier von hand, welches
 * fach des einen dem fach des anderen entspricht — leistungskurse zuerst.
 */
export const VERGLEICHSPAARE: Array<{ erijon: string; koray: string }> = [
  { erijon: 'geschichte', koray: 'geschichte' },
  { erijon: 'bio', koray: 'physik' },
  { erijon: 'englisch', koray: 'deutsch' },
  { erijon: 'mathe', koray: 'mathe' },
  { erijon: 'deutsch', koray: 'englisch' },
  { erijon: 'sozialkunde', koray: 'sozialkunde' },
  { erijon: 'ethik', koray: 'katholische religion' },
  { erijon: 'sport', koray: 'sport' },
  { erijon: 'bildende kunst', koray: 'bildende kunst' },
]

export type Vergleichszeile = { erijon: Fach; koray: Fach }
export type Vergleich = { zeilen: Vergleichszeile[]; ohnePaar: Fach[] }

/**
 * die paare, die es wirklich gibt, und alles, was ohne gegenstueck bleibt. ein
 * fach ohne partner faellt nicht unter den tisch, aber es steht auch nicht als
 * vergleich da — informatik gegen franzoesisch waere eine erfundene zahl.
 */
export function vergleich(faecher: Fach[]): Vergleich {
  const finde = (user: UserId, name: string) =>
    faecher.find((fach) => fach.user === user && fach.name === name) ?? null
  const zeilen: Vergleichszeile[] = []
  const gepaart = new Set<string>()
  for (const paar of VERGLEICHSPAARE) {
    const erijon = finde('erijon', paar.erijon)
    const koray = finde('koray', paar.koray)
    if (!erijon || !koray) continue
    zeilen.push({ erijon, koray })
    gepaart.add(erijon.id)
    gepaart.add(koray.id)
  }
  const ohnePaar = faecher
    .filter((fach) => !gepaart.has(fach.id))
    .sort((a, b) => a.user.localeCompare(b.user) || a.sortierung - b.sortierung)
  return { zeilen, ohnePaar }
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
 * zwei staerkeren der drei LK doppelt gewertet.
 */
export function abiPrognose(faecher: Fach[], noten: Note[], user: UserId): Abiprognose | null {
  const eigene = faecher.filter((fach) => fach.user === user)
  const mitSchnitt = eigene.map((fach) => ({ fach, schnitt: fachSchnitt(noten, fach).gesamt }))
  const belegte = mitSchnitt.filter((x): x is { fach: Fach; schnitt: number } => x.schnitt !== null)
  if (belegte.length === 0) return null

  const fallback = mittel(belegte.map((x) => x.schnitt))!
  const lk = mitSchnitt
    .filter((x) => x.fach.kursart === 'lk')
    .map((x) => x.schnitt ?? fallback)
    .slice(0, 3)
  while (lk.length < 3) lk.push(fallback)
  const gkBelegt = belegte.filter((x) => x.fach.kursart === 'gk')
  const gkSchnitt = mittel(gkBelegt.map((x) => x.schnitt)) ?? fallback
  const lkAbsteigend = [...lk].sort((a, b) => b - a)

  const p = lk.reduce((summe, wert) => summe + wert * 4, 0)
    + lkAbsteigend.slice(0, 2).reduce((summe, wert) => summe + wert * 4, 0)
    + gkSchnitt * GK_KURSE
  const blockI = Math.min(600, Math.max(0, Math.round(p * BLOCK_I_FAKTOR)))

  // Vier Pruefungen: die drei LK schriftlich, dazu der eine muendliche GK.
  // Solange dieser noch nicht gewaehlt ist, steht der GK-Schnitt dafuer ein.
  // Jede Pruefung zaehlt fuenffach, zusammen also hoechstens 300 Punkte.
  const gkPruefung = mitSchnitt.find((x) => x.fach.kursart === 'gk' && x.fach.pruefungsfach !== null)
  const pruefungen = [...lk, gkPruefung ? gkPruefung.schnitt ?? gkSchnitt : gkSchnitt]
  const blockII = Math.min(300, Math.max(0, Math.round(pruefungen.reduce((s, p) => s + p, 0) * 5)))

  const unter = defizite(eigene, noten, user)
  const lkUnter = Math.min(LK_KURSE, unter.filter((f) => f.kursart === 'lk').length * 4)
  const gkUnter = Math.min(GK_KURSE, unter.filter((f) => f.kursart === 'gk').length * 4)
  const huerden: string[] = []
  if (blockI < BLOCK_I_MINIMUM) huerden.push('block i unter 200 punkten')
  if (blockII < BLOCK_II_MINIMUM) huerden.push('block ii unter 100 punkten')
  if (lkUnter + gkUnter > UNTERKURSE_MAXIMUM) huerden.push('mehr als 7 unterkurse')
  if (belegte.some((x) => x.schnitt === 0)) huerden.push('ein kurs mit 0 punkten ist nicht einbringbar')
  // von vier pruefungen muessen zwei mit mindestens 5 punkten bestehen
  const bestandenePruefungen = pruefungen.filter((punkte) => punkte >= 5).length
  if (bestandenePruefungen < 2) {
    huerden.push('weniger als 2 prüfungsfächer mit mindestens 5 punkten')
  }

  const gesamt = Math.min(900, blockI + blockII)
  return {
    blockI,
    blockII,
    gesamt,
    note: gesamtpunkteZuAbinote(gesamt),
    unterkurse: { lk: lkUnter, gk: gkUnter },
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

/** kleinste klausur-punktzahl, die den fachschnitt haelt. */
export function brauchtFuerSchnitt(noten: Note[], fach: Fach): number | null {
  const ziel = fachSchnitt(noten, fach).gesamt ?? 5
  return brauchtInKlausur(noten, fach, ziel)
}
