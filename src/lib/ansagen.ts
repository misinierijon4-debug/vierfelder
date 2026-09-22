import { addDays, fromKey, startOfWeek, toKey } from './dates'
import { istGesetzt, quelle } from './tracker'
import { tagVon } from './training'
import type { UserId, Zustand } from './types'

/**
 * ansagen: die herausforderungen zwischen den beiden. wer ansagt, wettet, dass
 * die andere person ein ziel bis sonntag *nicht* schafft, und setzt dafür
 * einen punkt. scheitert die andere person, kommt der einsatz zurück und ein
 * punkt obendrauf. schafft sie es, ist er weg. so hat jede ansage ein risiko,
 * und niemand drückt zwei im vorbeigehen raus.
 *
 * das ziel wählt niemand frei: es kommt aus den letzten wochen der anderen
 * person in diesem feld, knapp über ihrem üblichen stand. damit ist jede
 * ansage ungefähr eine 50:50-wette — egal ob boxen, das man selten macht, oder
 * gym, das man oft macht. eni wählt später aus diesen kandidaten aus und
 * schreibt den spruch, rechnet aber nie selbst.
 *
 * noch nicht in der oberfläche und noch nicht im wochenstand — siehe
 * `docs/ansagen.md`.
 */

/**
 * lernen ist absichtlich nicht dabei: das macht man ohnehin selten, und ein
 * ziel von „einmal mehr" wäre dort eher lotterie als training
 */
export const ANSAGE_FELDER = ['gym', 'boxen', 'lesen', 'gewicht'] as const
export type AnsageFeld = (typeof ANSAGE_FELDER)[number]

/** so viele ansagen hat jede person je woche. was übrig bleibt, verfällt */
export const ANSAGEN_JE_WOCHE = 2

/** so viel setzt, wer ansagt */
export const EINSATZ = 1

/** so viele abgeschlossene wochen bestimmen das ziel */
export const RUECKBLICK_WOCHEN = 4

/**
 * so lange nach mitternacht wartet das einfrieren auf eine sitzung, die am
 * letzten tag begonnen hat und noch läuft. wer um 23:45 den fokus einschaltet,
 * hat den tag nicht verpasst — ein vergessener fokus hält die ansage aber auch
 * nicht ewig offen
 */
export const NACHLAUF_STUNDEN = 3

export type AnsageErgebnis = 'geschafft' | 'verfehlt'
export type AnsageStatus = 'laeuft' | AnsageErgebnis

export type Ansage = {
  id: string
  /** wer ansagt und den einsatz bringt */
  von: UserId
  /** wer liefern muss */
  an: UserId
  feld: AnsageFeld
  /** erster tag des zeitraums, immer der tag nach der ansage */
  ab: string
  /** letzter tag des zeitraums, immer der sonntag derselben woche */
  bis: string
  /** an so vielen tagen im zeitraum muss das feld zählen */
  ziel: number
  /** zeitpunkt der ansage, iso. in der datenbank setzt ihn der server */
  erstelltAm: string
  /**
   * das festgeschriebene ergebnis. ist es gesetzt, wird nie wieder gerechnet —
   * ein nachgetragener haken kippt keine entschiedene ansage mehr
   */
  entschieden?: { ergebnis: AnsageErgebnis; am: string }
}

/**
 * ob ein feld an einem tag für eine ansage zählt. die vier bereiche zählen nur
 * gemessen (standort oder fokus), ein getippter haken ist eine behauptung.
 * beim gewicht zählt jeder eintrag — dass er am selben tag gemacht wurde,
 * prüft der server über `gewicht.erstellt`, der client kennt die spalte nicht.
 */
export type Zaehlt = (u: UserId, feld: AnsageFeld, tag: string) => boolean

export function zaehltAusZustand(z: Zustand): Zaehlt {
  return (u, feld, tag) => {
    if (feld === 'gewicht') return istGesetzt(z, u, 'gewicht', tag)
    const q = quelle(z, u, feld, tag)
    return q === 'gemessen' || q === 'gemischt'
  }
}

export type AnsageStand = {
  status: AnsageStatus
  /** tage im zeitraum bis einschließlich heute, an denen das feld gezählt hat */
  erreicht: number
  ziel: number
  /** tage, die noch kommen können — heute eingeschlossen, solange er im zeitraum liegt */
  offeneTage: number
}

export type AnsagePunkte = Record<UserId, number>

export type AnsageFehler = 'selbst' | 'keineAnsagenMehr' | 'zuSpaet' | 'schonAngesagt' | 'keinZiel'

export type AnsageVorschlag = {
  an: UserId
  feld: AnsageFeld
  ziel: number
  ab: string
  bis: string
  /** gezählte tage der letzten wochen, älteste zuerst — für eni und die anzeige */
  verlauf: number[]
}

function montagVon(tag: string): string {
  return toKey(startOfWeek(fromKey(tag)))
}

function tage(ab: string, bis: string): string[] {
  const liste: string[] = []
  for (let d = fromKey(ab); toKey(d) <= bis; d = addDays(d, 1)) liste.push(toKey(d))
  return liste
}

/** die woche, in der die ansage gemacht wurde — sie kostet deren kontingent */
export function ansageWoche(a: Ansage): string {
  return montagVon(toKey(new Date(a.erstelltAm)))
}

export function verbleibendeAnsagen(ansagen: Ansage[], u: UserId, jetzt: Date): number {
  const woche = toKey(startOfWeek(jetzt))
  const verbraucht = ansagen.filter((a) => a.von === u && ansageWoche(a) === woche).length
  return Math.max(0, ANSAGEN_JE_WOCHE - verbraucht)
}

/**
 * der zeitraum einer ansage, die jetzt gemacht würde: morgen bis sonntag.
 * null ab samstag — ein einziger tag lässt keinen ausrutscher mehr zu.
 */
export function ansageZeitraum(jetzt: Date): { ab: string; bis: string } | null {
  const ab = toKey(addDays(jetzt, 1))
  const bis = toKey(addDays(startOfWeek(jetzt), 6))
  return tage(ab, bis).length >= 2 ? { ab, bis } : null
}

/**
 * die gezählten tage je woche in den `RUECKBLICK_WOCHEN` wochen vor der woche
 * von `montag`, älteste zuerst
 */
export function wochenVerlauf(zaehlt: Zaehlt, u: UserId, feld: AnsageFeld, montag: string): number[] {
  const start = fromKey(montag)
  return Array.from({ length: RUECKBLICK_WOCHEN }, (_, i) => {
    const wochenStart = addDays(start, -7 * (RUECKBLICK_WOCHEN - i))
    const woche = tage(toKey(wochenStart), toKey(addDays(wochenStart, 6)))
    return woche.filter((tag) => zaehlt(u, feld, tag)).length
  })
}

/**
 * das ziel für einen zeitraum: der übliche wochenstand (median der letzten
 * wochen) plus eins, auf die länge des zeitraums heruntergerechnet und aufgerundet —
 * sonst läge das ziel am montag unter dem, was die person sonst schafft. es bleibt
 * immer ein tag spielraum — ohne den ist eine ansage nach dem ersten
 * verpassten tag schon verloren, und der rest der woche bringt kein training
 * mehr. passt das ziel nicht hinein, gibt es für dieses feld keine ansage:
 * wer sich jeden tag wiegt, kann darin nicht mehr herausgefordert werden.
 */
export function ansageZiel(verlauf: number[], laenge: number): number | null {
  const sortiert = [...verlauf].sort((a, b) => a - b)
  const mitte = sortiert.length / 2
  const median =
    sortiert.length === 0
      ? 0
      : sortiert.length % 2
        ? sortiert[Math.floor(mitte)]!
        : (sortiert[mitte - 1]! + sortiert[mitte]!) / 2
  const woche = Math.floor(median) + 1
  const ziel = Math.max(1, Math.ceil((woche * laenge) / 7))
  return ziel <= laenge - 1 ? ziel : null
}

/**
 * alle ansagen, die `von` jetzt machen könnte. eni sucht daraus die
 * spannendsten aus; die zahlen hier sind die einzigen, die gelten.
 */
export function ansageVorschlaege(
  zaehlt: Zaehlt,
  ansagen: Ansage[],
  von: UserId,
  an: UserId,
  jetzt: Date
): AnsageVorschlag[] {
  if (von === an || verbleibendeAnsagen(ansagen, von, jetzt) === 0) return []
  const zeitraum = ansageZeitraum(jetzt)
  if (!zeitraum) return []
  const montag = toKey(startOfWeek(jetzt))
  const laenge = tage(zeitraum.ab, zeitraum.bis).length

  const vorschlaege: AnsageVorschlag[] = []
  for (const feld of ANSAGE_FELDER) {
    const schon = ansagen.some(
      (a) => a.von === von && a.an === an && a.feld === feld && ansageWoche(a) === montag
    )
    if (schon) continue
    const verlauf = wochenVerlauf(zaehlt, an, feld, montag)
    const ziel = ansageZiel(verlauf, laenge)
    if (ziel !== null) vorschlaege.push({ an, feld, ziel, verlauf, ...zeitraum })
  }
  return vorschlaege
}

/**
 * baut eine neue ansage oder sagt, warum es nicht geht. ziel und zeitraum
 * kommen immer aus `ansageVorschlaege` — frei wählbar ist nur das feld.
 */
export function neueAnsage(
  zaehlt: Zaehlt,
  ansagen: Ansage[],
  von: UserId,
  an: UserId,
  feld: AnsageFeld,
  jetzt: Date,
  id: string
): { ansage: Ansage } | { fehler: AnsageFehler } {
  if (von === an) return { fehler: 'selbst' }
  if (verbleibendeAnsagen(ansagen, von, jetzt) === 0) return { fehler: 'keineAnsagenMehr' }
  if (!ansageZeitraum(jetzt)) return { fehler: 'zuSpaet' }
  const montag = toKey(startOfWeek(jetzt))
  if (ansagen.some((a) => a.von === von && a.an === an && a.feld === feld && ansageWoche(a) === montag)) {
    return { fehler: 'schonAngesagt' }
  }
  const vorschlag = ansageVorschlaege(zaehlt, ansagen, von, an, jetzt).find((v) => v.feld === feld)
  if (!vorschlag) return { fehler: 'keinZiel' }
  return {
    ansage: {
      id,
      von,
      an,
      feld,
      ab: vorschlag.ab,
      bis: vorschlag.bis,
      ziel: vorschlag.ziel,
      erstelltAm: jetzt.toISOString(),
    },
  }
}

/**
 * der stand einer ansage zum zeitpunkt `jetzt`. ein festgeschriebenes ergebnis
 * gilt immer. sonst ist sie geschafft mit dem letzten nötigen tag und verfehlt,
 * sobald die übrigen tage nicht mehr reichen; heute zählt dabei noch als
 * möglich.
 */
export function ansageStand(zaehlt: Zaehlt, a: Ansage, jetzt: Date): AnsageStand {
  const heute = toKey(jetzt)
  let erreicht = 0
  let offeneTage = 0
  for (const tag of tage(a.ab, a.bis)) {
    if (tag > heute) {
      offeneTage += 1
      continue
    }
    if (zaehlt(a.an, a.feld, tag)) erreicht += 1
    else if (tag === heute) offeneTage += 1
  }

  let status: AnsageStatus = 'laeuft'
  if (a.entschieden) status = a.entschieden.ergebnis
  else if (erreicht >= a.ziel) status = 'geschafft'
  else if (erreicht + offeneTage < a.ziel) status = 'verfehlt'
  return { status, erreicht, ziel: a.ziel, offeneTage }
}

/**
 * ob am letzten tag eine sitzung begonnen hat, die noch läuft. geht nur die
 * aufenthalte durch, wenn eine ansage ohne ergebnis vorbei ist — also selten
 * und nie je render.
 */
function sitzungLaeuftNoch(z: Zustand, a: Ansage): boolean {
  if (a.feld === 'gewicht') return false
  return z.aufenthalte.some(
    (s) => s.user === a.an && s.bereich === a.feld && s.abgang === null && tagVon(s) === a.bis
  )
}

/**
 * was jetzt festgeschrieben werden darf, oder null. geschafft sofort — das
 * kann nichts mehr ändern, was fair wäre. verfehlt erst nach dem letzten tag,
 * auch wenn es rechnerisch früher feststeht: eine laufende sitzung vom
 * sonntagabend bekommt bis `NACHLAUF_STUNDEN` nach mitternacht zeit.
 */
export function festzuschreiben(
  z: Zustand,
  zaehlt: Zaehlt,
  a: Ansage,
  jetzt: Date
): Ansage['entschieden'] | null {
  if (a.entschieden) return null
  const { status } = ansageStand(zaehlt, a, jetzt)
  if (status === 'geschafft') return { ergebnis: 'geschafft', am: jetzt.toISOString() }

  const mitternacht = addDays(fromKey(a.bis), 1)
  if (jetzt < mitternacht) return null
  const nachlaufEnde = new Date(mitternacht.getTime() + NACHLAUF_STUNDEN * 3_600_000)
  if (jetzt < nachlaufEnde && sitzungLaeuftNoch(z, a)) return null
  return { ergebnis: 'verfehlt', am: jetzt.toISOString() }
}

/**
 * was eine ansage der herausfordernden person bringt. der einsatz ist weg,
 * sobald die ansage gemacht ist, und kommt nur zurück, wenn die andere person
 * scheitert — dann mit einem punkt obendrauf. die herausgeforderte person
 * bekommt hier nichts: wer liefert, holt dafür die normalen duellpunkte.
 */
export function ansagePunkte(status: AnsageStatus, a: Ansage): AnsagePunkte {
  const punkte = { erijon: 0, koray: 0 } as AnsagePunkte
  punkte[a.von] = status === 'verfehlt' ? EINSATZ : -EINSATZ
  return punkte
}

/**
 * die ansage-punkte einer woche, laufende einsätze eingeschlossen. gewertet
 * wird in der woche des zeitraums — wegen `ansageZeitraum` dieselbe, in der
 * die ansage gemacht wurde.
 */
export function wochenAnsagePunkte(
  zaehlt: Zaehlt,
  ansagen: Ansage[],
  montag: string,
  jetzt: Date
): AnsagePunkte {
  const summe = { erijon: 0, koray: 0 } as AnsagePunkte
  for (const a of ansagen) {
    if (montagVon(a.bis) !== montag) continue
    const p = ansagePunkte(ansageStand(zaehlt, a, jetzt).status, a)
    summe.erijon += p.erijon
    summe.koray += p.koray
  }
  return summe
}

