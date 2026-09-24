import { addDays, fromKey, startOfWeek, toKey } from './dates'
import { einheitenAn, istGesetzt, quelle } from './tracker'
import { messungen, tagVon } from './training'
import type { UserId, Zustand } from './types'

/**
 * ansagen: die herausforderungen zwischen den beiden. wer ansagt, fordert die
 * andere person in einem feld heraus und wählt eine stufe. das ziel rechnet
 * die app aus deren eigener form, knapp bis weit über ihrem schnitt der
 * letzten vier wochen und nie unter einem mindestwert je feld.
 *
 * schafft die herausgeforderte person das ziel bis sonntag 18 uhr, bekommt
 * sie den einsatz. verfehlt sie, bekommt ihn, wer angesagt hat. eine ansage
 * kostet also etwas, wenn der andere liefert — und der andere hat einen grund
 * zu liefern.
 *
 * die herausgeforderte person darf einmal reagieren, innerhalb von 24
 * stunden: **kontern** verdoppelt den einsatz (nur solange bei ihr noch
 * nichts gezählt hat), **du auch** verlangt dasselbe ziel von der ansagenden
 * person. das ist eine eigene zeile mit `bezug` und derselben wertung in die
 * andere richtung.
 *
 * gezählt wird wie im duell ein tag je feld, getippt oder gemessen — aber nur,
 * was nach der ansage passiert und am selben tag eingetragen wurde. regeln und
 * begründungen: `docs/ansagen.md`. die serverseitige wahrheit steht in der
 * migration `*_ansagen_stufen.sql`, beide rechnen dasselbe.
 *
 * version 1 war die erste fassung (wette, dass der andere es nicht schafft,
 * −1 einsatz sofort, frist samstag). solche zeilen werden weiter nach ihren
 * alten regeln gewertet, neu angelegt wird nur noch version 2.
 */

// gym und boxen bleiben fuer bereits laufende und abgeschlossene ansagen lesbar.
export const ANSAGE_FELDER = ['training', 'gym', 'boxen', 'lesen', 'lernen', 'gewicht'] as const
export type AnsageFeld = (typeof ANSAGE_FELDER)[number]
export const NEUE_ANSAGE_FELDER = ['training', 'lesen', 'lernen', 'gewicht'] as const

export const ANSAGE_STUFEN = ['sicher', 'mutig', 'allin'] as const
export type AnsageStufe = (typeof ANSAGE_STUFEN)[number]

/** so viel steht je stufe auf dem spiel. kontern verdoppelt */
export const STUFEN_EINSATZ: Record<AnsageStufe, number> = { sicher: 1, mutig: 2, allin: 3 }

/** so weit über dem eigenen wochenschnitt liegt das ziel */
export const STUFEN_FAKTOR: Record<AnsageStufe, number> = { sicher: 1.3, mutig: 1.6, allin: 2 }

/**
 * darunter gibt es kein ziel, egal wie schwach die form ist. wiegen ist
 * leicht, deshalb liegt es höher: 4× wiegen ist so viel wie 2× lesen. lernen
 * machen beide selten, beginnt aber trotzdem bei 2 — ein einzelner lerntag
 * wäre wieder der geschenkte punkt.
 */
export const MINDESTZIEL: Record<AnsageFeld, Record<AnsageStufe, number>> = {
  training: { sicher: 2, mutig: 3, allin: 4 },
  gym: { sicher: 2, mutig: 3, allin: 4 },
  boxen: { sicher: 2, mutig: 3, allin: 4 },
  lesen: { sicher: 2, mutig: 3, allin: 4 },
  lernen: { sicher: 2, mutig: 3, allin: 4 },
  gewicht: { sicher: 4, mutig: 5, allin: 6 },
}

export const STUFEN_TEXT: Record<AnsageStufe, string> = { sicher: 'sicher', mutig: 'mutig', allin: 'all-in' }

/** so viele ansagen hat jede person je woche, davon höchstens eine all-in */
export const ANSAGEN_JE_WOCHE = 2

/** so viele abgeschlossene wochen bestimmen form und ziel */
export const RUECKBLICK_WOCHEN = 4

/**
 * so viele tage muss die herausgeforderte person in den letzten vier wochen
 * in einem feld gehabt haben. wer kein gym-abo hat, kann dort nicht
 * herausgefordert werden — das wäre ein geschenkter punkt.
 */
export const AKTIV_MINDESTENS = 2

/** frist jeder ansage: sonntag, 18 uhr — dann beginnt das finale */
export const FRIST_STUNDE = 18

/** so lange muss eine ansage mindestens laufen. ansagen gehen bis freitag 18 uhr */
export const MINDESTLAUFZEIT_STUNDEN = 48

/** so lange darf die herausgeforderte person reagieren */
export const REAKTION_STUNDEN = 24

/** version 1: einsatz −1 sofort, frist samstag */
export const EINSATZ_V1 = 1

/**
 * version 1: so lange nach mitternacht wartete das einfrieren auf eine
 * sitzung vom letzten tag, die noch lief
 */
export const NACHLAUF_STUNDEN = 3

export type AnsageErgebnis = 'geschafft' | 'verfehlt'
export type AnsageStatus = 'laeuft' | AnsageErgebnis
export type AnsageReaktion = 'kontern' | 'duAuch'

export type Ansage = {
  id: string
  /** fehlt bei zeilen der ersten fassung */
  version?: 1 | 2
  /** wer ansagt */
  von: UserId
  /** wer liefern muss */
  an: UserId
  feld: AnsageFeld
  /** version 2 */
  stufe?: AnsageStufe
  /** version 2: der einsatz der stufe, ohne kontern */
  einsatz?: number
  /** erster tag, an dem gezählt wird: der tag der ansage (v1: der tag danach) */
  ab: string
  /** letzter tag: sonntag, frist 18 uhr (v1: samstag, 24 uhr) */
  bis: string
  /** an so vielen tagen muss das feld zählen */
  ziel: number
  /** ab diesem zeitpunkt zählt, was passiert. in der datenbank setzt ihn der server */
  erstelltAm: string
  /** die antwort der herausgeforderten person, höchstens eine */
  reaktion?: { art: AnsageReaktion; am: string }
  /** gesetzt bei „du auch“: die ansage, auf die geantwortet wurde */
  bezug?: string
  /**
   * das festgeschriebene ergebnis. ist es gesetzt, wird nie wieder gerechnet —
   * ein nachgetragener haken kippt keine entschiedene ansage mehr
   */
  entschieden?: { ergebnis: AnsageErgebnis; am: string }
}

/**
 * wie gezählt wird, einmal je zustand gebaut. die fragen gehen über den
 * sitzungsindex und die einheiten eines tages, nie über die ganze historie.
 */
export type Zaehlt = {
  /** zählt das feld an dem tag wie im duell, getippt oder gemessen — für die form */
  gesetzt: (u: UserId, feld: AnsageFeld, tag: string) => boolean
  /**
   * zählt der tag für eine ansage: etwas, das nach `ab` begonnen hat, vor der
   * frist fertig war und am selben tag eingetragen wurde
   */
  ehrlich: (u: UserId, feld: AnsageFeld, tag: string, ab: Date, frist: Date) => boolean
  /** version 1: die bereiche nur gemessen, das gewicht immer */
  gemessen: (u: UserId, feld: AnsageFeld, tag: string) => boolean
}

export function zaehltAusZustand(z: Zustand): Zaehlt {
  const bereiche = (feld: AnsageFeld) => feld === 'training' ? ['gym', 'boxen'] as const : [feld] as const
  return {
    gesetzt: (u, feld, tag) => bereiche(feld).some((bereich) => istGesetzt(z, u, bereich, tag)),
    ehrlich: (u, feld, tag, ab, frist) => {
      if (tag < toKey(ab)) return false
      // beim gewicht kennt der browser den zeitpunkt der eintragung nicht.
      // die datenbank prüft `gewicht.erstellt`; bis zum einfrieren zählt hier
      // jeder wert ab dem tag der ansage
      if (feld === 'gewicht') return istGesetzt(z, u, 'gewicht', tag)
      const abMs = ab.getTime()
      const fristMs = frist.getTime()
      for (const bereich of bereiche(feld)) {
        for (const m of messungen(z.aufenthalte, u, bereich, tag)) {
          const beginn = new Date(m.ankunft).getTime()
          const ende = m.abgang ? new Date(m.abgang).getTime() : Infinity
          if (beginn >= abMs && ende <= fristMs) return true
        }
        for (const e of einheitenAn(z, u, bereich, tag)) {
          if (!e.erfasst) continue
          const am = new Date(e.erfasst)
          if (am.getTime() >= abMs && am.getTime() <= fristMs && toKey(am) === tag) return true
        }
      }
      return false
    },
    gemessen: (u, feld, tag) => {
      if (feld === 'gewicht') return istGesetzt(z, u, 'gewicht', tag)
      return bereiche(feld).some((bereich) => {
        const q = quelle(z, u, bereich, tag)
        return q === 'gemessen' || q === 'gemischt'
      })
    },
  }
}

export type AnsageStand = {
  status: AnsageStatus
  /** gezählte tage bis jetzt */
  erreicht: number
  ziel: number
  /** tage, an denen noch etwas zählen kann — heute eingeschlossen, solange die frist nicht vorbei ist */
  offeneTage: number
}

export type AnsagePunkte = Record<UserId, number>

export type AnsageFehler =
  | 'selbst'
  | 'keineAnsagenMehr'
  | 'allinVerbraucht'
  | 'zuSpaet'
  | 'schonAngesagt'
  | 'feldInaktiv'
  | 'keinZiel'
  | 'nichtDeine'
  | 'schonReagiert'
  | 'reaktionZuSpaet'
  | 'kontraZuSpaet'
  | 'veraltet'

/** ein feld, wie es im ansagen-sheet steht: mit zielen je stufe oder dem grund, warum nicht */
export type AnsageKandidat = {
  an: UserId
  feld: AnsageFeld
  /** tage je woche der herausgeforderten person, älteste zuerst */
  verlauf: number[]
  /** ihr wochenschnitt daraus */
  schnitt: number
  /** tage je woche der ansagenden person — für „du auch“ */
  meinVerlauf: number[]
  /** ziel je stufe, null wenn es nicht mehr in die woche passt */
  ziele: Record<AnsageStufe, number | null>
  /** die stufe, die fordert, ohne dass ein „du auch“ weh tut */
  empfohlen: AnsageStufe | null
  gesperrt: null | 'inaktiv' | 'schonAngesagt' | 'keinZiel'
}

/** ein ansagbares feld mit empfohlener stufe — das, was eni zu sehen bekommt */
export type AnsageVorschlag = {
  an: UserId
  feld: AnsageFeld
  stufe: AnsageStufe
  ziel: number
  verlauf: number[]
  meinVerlauf: number[]
}

function montagVon(tag: string): string {
  return toKey(startOfWeek(fromKey(tag)))
}

function tage(ab: string, bis: string): string[] {
  const liste: string[] = []
  for (let d = fromKey(ab); toKey(d) <= bis; d = addDays(d, 1)) liste.push(toKey(d))
  return liste
}

export function istV2(a: Ansage): boolean {
  return a.version === 2
}

/** die frist als zeitpunkt: v2 sonntag 18 uhr, v1 die mitternacht nach dem samstag */
export function ansageFrist(a: Pick<Ansage, 'bis' | 'version'>): Date {
  const tag = fromKey(a.bis)
  if (a.version === 2) return new Date(tag.getFullYear(), tag.getMonth(), tag.getDate(), FRIST_STUNDE)
  return addDays(tag, 1)
}

/** der einsatz, der wirklich gilt: gekontert doppelt */
export function wirksamerEinsatz(a: Ansage): number {
  if (!istV2(a)) return EINSATZ_V1
  const grund = a.einsatz ?? STUFEN_EINSATZ[a.stufe ?? 'sicher']
  return a.reaktion?.art === 'kontern' ? grund * 2 : grund
}

/** die woche, in der die ansage gemacht wurde — sie kostet deren kontingent */
export function ansageWoche(a: Ansage): string {
  return montagVon(toKey(new Date(a.erstelltAm)))
}

/** die eigenen ansagen einer woche, ohne die „du auch“-zeilen */
function eigeneDerWoche(ansagen: Ansage[], u: UserId, montag: string): Ansage[] {
  return ansagen.filter((a) => a.von === u && !a.bezug && ansageWoche(a) === montag)
}

export function verbleibendeAnsagen(ansagen: Ansage[], u: UserId, jetzt: Date): number {
  const woche = toKey(startOfWeek(jetzt))
  return Math.max(0, ANSAGEN_JE_WOCHE - eigeneDerWoche(ansagen, u, woche).length)
}

export function allinFrei(ansagen: Ansage[], u: UserId, jetzt: Date): boolean {
  const woche = toKey(startOfWeek(jetzt))
  return !eigeneDerWoche(ansagen, u, woche).some((a) => a.stufe === 'allin')
}

export type AnsageFenster = {
  ab: string
  bis: string
  frist: Date
  /** kalendertage von heute bis sonntag, heute eingeschlossen */
  verfuegbar: number
}

/**
 * wann eine ansage, die jetzt gemacht würde, läuft: ab jetzt bis sonntag
 * 18 uhr. null, wenn bis dahin keine 48 stunden mehr sind — freitagabend
 * ansagen, was man schon erledigt hat, geht nicht.
 */
export function ansageFenster(jetzt: Date): AnsageFenster | null {
  const montag = startOfWeek(jetzt)
  const sonntag = addDays(montag, 6)
  const bis = toKey(sonntag)
  const frist = ansageFrist({ bis, version: 2 })
  if (frist.getTime() - jetzt.getTime() < MINDESTLAUFZEIT_STUNDEN * 3_600_000) return null
  const ab = toKey(jetzt)
  return { ab, bis, frist, verfuegbar: tage(ab, bis).length }
}

/**
 * die gesetzten tage je woche in den `RUECKBLICK_WOCHEN` wochen vor der woche
 * von `montag`, älteste zuerst — getippt oder gemessen, wie im duell
 */
export function wochenVerlauf(zaehlt: Zaehlt, u: UserId, feld: AnsageFeld, montag: string): number[] {
  const start = fromKey(montag)
  return Array.from({ length: RUECKBLICK_WOCHEN }, (_, i) => {
    const wochenStart = addDays(start, -7 * (RUECKBLICK_WOCHEN - i))
    const woche = tage(toKey(wochenStart), toKey(addDays(wochenStart, 6)))
    return woche.filter((tag) => zaehlt.gesetzt(u, feld, tag)).length
  })
}

export function formSchnitt(verlauf: number[]): number {
  if (verlauf.length === 0) return 0
  return verlauf.reduce((s, n) => s + n, 0) / verlauf.length
}

export function istAktiv(verlauf: number[]): boolean {
  return verlauf.reduce((s, n) => s + n, 0) >= AKTIV_MINDESTENS
}

/**
 * das ziel je stufe: über dem schnitt mal faktor (aufgerundet) und nie unter
 * dem mindestwert, jede stufe mindestens eins über der vorigen. es muss in
 * die restliche woche passen — sicher und mutig mit einem tag spielraum,
 * all-in ohne. ein ziel, das nicht passt, ist null.
 */
export function ansageZiele(
  feld: AnsageFeld,
  verlauf: number[],
  verfuegbar: number
): Record<AnsageStufe, number | null> {
  const schnitt = formSchnitt(verlauf)
  const ziele = {} as Record<AnsageStufe, number | null>
  let vorher = 0
  for (const stufe of ANSAGE_STUFEN) {
    // gegen fließkomma: 2 × 1,6 soll 4 bleiben und nicht 4,000…1 → 5 werden
    const ausForm = Math.ceil(Math.round(schnitt * STUFEN_FAKTOR[stufe] * 1000) / 1000)
    const ziel = Math.max(MINDESTZIEL[feld][stufe], ausForm, vorher + 1)
    vorher = ziel
    const platz = stufe === 'allin' ? verfuegbar : verfuegbar - 1
    ziele[stufe] = ziel <= Math.min(7, platz) ? ziel : null
  }
  return ziele
}

/**
 * die stufe, die fordert, ohne dass „du auch“ weh tut: die höchste, deren
 * ziel die ansagende person selbst üblicherweise schafft. sonst sicher, wenn
 * es das gibt.
 */
function empfohleneStufe(ziele: Record<AnsageStufe, number | null>, meinVerlauf: number[]): AnsageStufe | null {
  const meinKoennen = Math.max(...meinVerlauf, Math.ceil(formSchnitt(meinVerlauf) * STUFEN_FAKTOR.sicher))
  let beste: AnsageStufe | null = null
  for (const stufe of ANSAGE_STUFEN) {
    const ziel = ziele[stufe]
    if (ziel !== null && ziel <= meinKoennen) beste = stufe
  }
  if (beste) return beste
  return ANSAGE_STUFEN.find((s) => ziele[s] !== null) ?? null
}

/**
 * alle felder mit zielen je stufe für eine ansage, die `von` jetzt an `an`
 * machen könnte — auch die gesperrten, damit das sheet sagen kann, warum.
 * leer, wenn gerade gar nicht angesagt werden darf.
 */
export function ansageKandidaten(
  zaehlt: Zaehlt,
  ansagen: Ansage[],
  von: UserId,
  an: UserId,
  jetzt: Date
): AnsageKandidat[] {
  if (von === an || verbleibendeAnsagen(ansagen, von, jetzt) === 0) return []
  const fenster = ansageFenster(jetzt)
  if (!fenster) return []
  const montag = toKey(startOfWeek(jetzt))
  const eigene = eigeneDerWoche(ansagen, von, montag)
  const allin = !eigene.some((a) => a.stufe === 'allin')

  return NEUE_ANSAGE_FELDER.map((feld) => {
    const verlauf = wochenVerlauf(zaehlt, an, feld, montag)
    const meinVerlauf = wochenVerlauf(zaehlt, von, feld, montag)
    const ziele = ansageZiele(feld, verlauf, fenster.verfuegbar)
    if (!allin) ziele.allin = null
    const gesperrt = eigene.some((a) => a.feld === feld)
      ? 'schonAngesagt'
      : !istAktiv(verlauf)
        ? 'inaktiv'
        : ANSAGE_STUFEN.every((s) => ziele[s] === null)
          ? 'keinZiel'
          : null
    return {
      an,
      feld,
      verlauf,
      schnitt: formSchnitt(verlauf),
      meinVerlauf,
      ziele,
      empfohlen: gesperrt ? null : empfohleneStufe(ziele, meinVerlauf),
      gesperrt,
    }
  })
}

/**
 * die ansagbaren felder mit ihrer empfohlenen stufe, das forderndste zuerst:
 * wo das ziel am weitesten über der form liegt. ein ziel von einem tag
 * schlägt eni nie vor — das liefert der andere im vorbeigehen, und genau
 * das war der geschenkte punkt der ersten fassung. im blatt bleibt es
 * wählbar. eni wählt aus und schreibt den spruch; die zahlen hier sind die
 * einzigen, die gelten.
 */
export function ansageVorschlaege(
  zaehlt: Zaehlt,
  ansagen: Ansage[],
  von: UserId,
  an: UserId,
  jetzt: Date
): AnsageVorschlag[] {
  const liste: (AnsageVorschlag & { druck: number })[] = []
  for (const k of ansageKandidaten(zaehlt, ansagen, von, an, jetzt)) {
    if (k.gesperrt || !k.empfohlen) continue
    // ein tag ist keine forderung: dann die nächste stufe, die passt
    const stufe = k.ziele[k.empfohlen]! >= 2
      ? k.empfohlen
      : ANSAGE_STUFEN.find((s) => (k.ziele[s] ?? 0) >= 2)
    if (!stufe) continue
    const ziel = k.ziele[stufe]!
    liste.push({
      an,
      feld: k.feld,
      stufe,
      ziel,
      verlauf: k.verlauf,
      meinVerlauf: k.meinVerlauf,
      druck: ziel / Math.max(1, k.schnitt),
    })
  }
  return liste
    .sort((a, b) => b.druck - a.druck || NEUE_ANSAGE_FELDER.indexOf(a.feld as typeof NEUE_ANSAGE_FELDER[number]) - NEUE_ANSAGE_FELDER.indexOf(b.feld as typeof NEUE_ANSAGE_FELDER[number]))
    .map(({ druck: _druck, ...v }) => v)
}

/**
 * baut eine neue ansage oder sagt, warum es nicht geht. frei wählbar sind
 * feld und stufe, das ziel kommt immer aus `ansageKandidaten`.
 */
export function neueAnsage(
  zaehlt: Zaehlt,
  ansagen: Ansage[],
  von: UserId,
  an: UserId,
  feld: AnsageFeld,
  stufe: AnsageStufe,
  jetzt: Date,
  id: string
): { ansage: Ansage } | { fehler: AnsageFehler } {
  if (von === an) return { fehler: 'selbst' }
  if (verbleibendeAnsagen(ansagen, von, jetzt) === 0) return { fehler: 'keineAnsagenMehr' }
  const fenster = ansageFenster(jetzt)
  if (!fenster) return { fehler: 'zuSpaet' }
  if (stufe === 'allin' && !allinFrei(ansagen, von, jetzt)) return { fehler: 'allinVerbraucht' }
  const kandidat = ansageKandidaten(zaehlt, ansagen, von, an, jetzt).find((k) => k.feld === feld)
  if (!kandidat) return { fehler: 'keinZiel' }
  if (kandidat.gesperrt === 'schonAngesagt') return { fehler: 'schonAngesagt' }
  if (kandidat.gesperrt === 'inaktiv') return { fehler: 'feldInaktiv' }
  const ziel = kandidat.ziele[stufe]
  if (ziel === null) return { fehler: 'keinZiel' }
  return {
    ansage: {
      id,
      version: 2,
      von,
      an,
      feld,
      stufe,
      einsatz: STUFEN_EINSATZ[stufe],
      ab: fenster.ab,
      bis: fenster.bis,
      ziel,
      erstelltAm: jetzt.toISOString(),
    },
  }
}

/** der zeitpunkt, ab dem gezählt wird */
function zaehltAb(a: Ansage): Date {
  return new Date(a.erstelltAm)
}

/**
 * der stand einer ansage zum zeitpunkt `jetzt`. ein festgeschriebenes
 * ergebnis gilt immer. sonst ist sie geschafft mit dem letzten nötigen tag
 * und rechnerisch verfehlt, sobald die übrigen tage nicht mehr reichen.
 */
export function ansageStand(zaehlt: Zaehlt, a: Ansage, jetzt: Date): AnsageStand {
  const heute = toKey(jetzt)
  const v2 = istV2(a)
  const frist = ansageFrist(a)
  const vorbei = jetzt >= frist
  const ab = zaehltAb(a)
  let erreicht = 0
  let offeneTage = 0
  for (const tag of tage(a.ab, a.bis)) {
    if (tag > heute) {
      offeneTage += 1
      continue
    }
    const gezaehlt = v2 ? zaehlt.ehrlich(a.an, a.feld, tag, ab, frist) : zaehlt.gemessen(a.an, a.feld, tag)
    if (gezaehlt) erreicht += 1
    else if (tag === heute && !vorbei) offeneTage += 1
  }

  let status: AnsageStatus = 'laeuft'
  if (a.entschieden) status = a.entschieden.ergebnis
  else if (erreicht >= a.ziel) status = 'geschafft'
  else if (erreicht + offeneTage < a.ziel) status = 'verfehlt'
  return { status, erreicht, ziel: a.ziel, offeneTage }
}

/** version 1: ob am letzten tag eine sitzung begonnen hat, die noch läuft */
function sitzungLaeuftNoch(z: Zustand, a: Ansage): boolean {
  if (a.feld === 'gewicht') return false
  return z.aufenthalte.some(
    (s) => s.user === a.an && s.bereich === a.feld && s.abgang === null && tagVon(s) === a.bis
  )
}

/**
 * was jetzt festgeschrieben werden darf, oder null. geschafft sofort — das
 * kann nichts mehr ändern, was fair wäre. verfehlt erst mit der frist, auch
 * wenn es rechnerisch früher feststeht.
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

  const frist = ansageFrist(a)
  if (jetzt < frist) return null
  if (!istV2(a)) {
    const nachlaufEnde = new Date(frist.getTime() + NACHLAUF_STUNDEN * 3_600_000)
    if (jetzt < nachlaufEnde && sitzungLaeuftNoch(z, a)) return null
  }
  return { ergebnis: 'verfehlt', am: jetzt.toISOString() }
}

/**
 * was eine ansage wem bringt. version 2: geschafft → der einsatz an die
 * herausgeforderte person, verfehlt → an die ansagende. solange sie läuft,
 * zählt sie nicht. version 1: der einsatz war sofort weg (−1) und kam nur
 * zurück, wenn die andere person scheiterte (+1).
 */
export function ansagePunkte(status: AnsageStatus, a: Ansage): AnsagePunkte {
  const punkte = { erijon: 0, koray: 0 } as AnsagePunkte
  if (!istV2(a)) {
    punkte[a.von] = status === 'verfehlt' ? EINSATZ_V1 : -EINSATZ_V1
    return punkte
  }
  if (status === 'geschafft') punkte[a.an] = wirksamerEinsatz(a)
  else if (status === 'verfehlt') punkte[a.von] = wirksamerEinsatz(a)
  return punkte
}

/**
 * die ansage-punkte einer woche. gezählt wird nur, was festgeschrieben ist
 * oder schon feststeht: geschafft sofort, verfehlt erst mit der frist — vorher
 * ist ein rechnerisch verlorener stand noch keine punkte wert (ein eintrag
 * kann verspätet ankommen). version 1 zählt wie früher.
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
    const p = ansagePunkte(gewerteterStatus(zaehlt, a, jetzt), a)
    summe.erijon += p.erijon
    summe.koray += p.koray
  }
  return summe
}

/** was in die wertung geht: v2 verfehlt erst mit der frist */
export function gewerteterStatus(zaehlt: Zaehlt, a: Ansage, jetzt: Date): AnsageStatus {
  const { status } = ansageStand(zaehlt, a, jetzt)
  if (istV2(a) && status === 'verfehlt' && !a.entschieden && jetzt < ansageFrist(a)) return 'laeuft'
  return status
}

/**
 * wie viel punkte die laufenden ansagen einer woche noch bringen können, je
 * person. version 2: beide können den einsatz noch bekommen. version 1: aus
 * −1 konnte +1 werden. der rechner braucht das, sonst nennt er einen
 * vorsprung sicher, den eine offene ansage noch kippt.
 */
export function offeneAnsageWende(
  zaehlt: Zaehlt,
  ansagen: Ansage[],
  montag: string,
  jetzt: Date
): AnsagePunkte {
  const wende = { erijon: 0, koray: 0 } as AnsagePunkte
  for (const a of ansagen) {
    if (montagVon(a.bis) !== montag) continue
    if (gewerteterStatus(zaehlt, a, jetzt) !== 'laeuft') continue
    if (!istV2(a)) {
      wende[a.von] += 2 * EINSATZ_V1
      continue
    }
    const { status } = ansageStand(zaehlt, a, jetzt)
    const e = wirksamerEinsatz(a)
    // rechnerisch schon verloren: nur noch die ansagende person kann gewinnen
    if (status !== 'verfehlt') wende[a.an] += e
    wende[a.von] += e
  }
  return wende
}

export type ReaktionsLage = {
  kontern: boolean
  duAuch: boolean
  /** bis wann reagiert werden darf */
  bis: Date
}

/**
 * ob `me` auf diese ansage noch reagieren darf, oder null. einmal, innerhalb
 * von 24 stunden und vor der frist. kontern nur, solange noch nichts gezählt
 * hat — sonst verdoppelt man, wenn man schon sieht, dass es klappt.
 */
export function reaktionsLage(zaehlt: Zaehlt, a: Ansage, me: UserId, jetzt: Date): ReaktionsLage | null {
  if (!istV2(a) || a.bezug || a.an !== me || a.reaktion || a.entschieden) return null
  const bis = new Date(
    Math.min(new Date(a.erstelltAm).getTime() + REAKTION_STUNDEN * 3_600_000, ansageFrist(a).getTime())
  )
  if (jetzt >= bis) return null
  const stand = ansageStand(zaehlt, a, jetzt)
  if (stand.status !== 'laeuft') return null
  return { kontern: stand.erreicht === 0, duAuch: true, bis }
}

/**
 * die reaktion der herausgeforderten person. kontern ändert die ansage selbst,
 * „du auch“ legt dazu die gegenrichtung an: dasselbe feld, dasselbe ziel,
 * derselbe einsatz, gezählt ab derselben ansage.
 */
export function reagiere(
  zaehlt: Zaehlt,
  a: Ansage,
  me: UserId,
  art: AnsageReaktion,
  jetzt: Date,
  id: string
): { ansage: Ansage; gegen?: Ansage } | { fehler: AnsageFehler } {
  if (!istV2(a) || a.bezug) return { fehler: 'veraltet' }
  if (a.an !== me) return { fehler: 'nichtDeine' }
  if (a.reaktion) return { fehler: 'schonReagiert' }
  const lage = reaktionsLage(zaehlt, a, me, jetzt)
  if (!lage) return { fehler: 'reaktionZuSpaet' }
  if (art === 'kontern' && !lage.kontern) return { fehler: 'kontraZuSpaet' }
  const ansage: Ansage = { ...a, reaktion: { art, am: jetzt.toISOString() } }
  if (art === 'kontern') return { ansage }
  return {
    ansage,
    gegen: {
      id,
      version: 2,
      von: a.an,
      an: a.von,
      feld: a.feld,
      stufe: a.stufe,
      einsatz: a.einsatz,
      ab: a.ab,
      bis: a.bis,
      ziel: a.ziel,
      erstelltAm: a.erstelltAm,
      bezug: a.id,
    },
  }
}

/** so heißt ein feld in einer ansage: „2× boxen“, „4× wiegen“ */
export const ANSAGE_WORT: Record<AnsageFeld, string> = {
  training: 'training',
  gym: 'gym',
  boxen: 'boxen',
  lesen: 'lesen',
  lernen: 'lernen',
  gewicht: 'wiegen',
}

export function ansageZielText(feld: AnsageFeld, ziel: number): string {
  return `${ziel}× ${ANSAGE_WORT[feld]}`
}

/**
 * der spruch, wenn eni gerade nicht antwortet — im prototyp immer. er nennt
 * nur zahlen aus dem vorschlag, genau wie eni, und redet dich an, nicht ihn.
 */
export function vorlageSpruch(
  v: Pick<AnsageVorschlag, 'feld' | 'ziel' | 'verlauf'>,
  name: string
): string {
  const schnitt = Math.round(formSchnitt(v.verlauf) * 10) / 10
  const bisher = schnitt < 1 ? 'nicht mal einmal die woche' : `${String(schnitt).replace('.', ',')}× die woche`
  switch (v.feld) {
    case 'training':
      return `${name} trainiert ${bisher}. ${v.ziel} trainingstage bis sonntag — gym oder boxen zählt.`
    case 'gym':
      return `${name} ist ${bisher} im gym. ${v.ziel}× bis sonntag — mal sehen, ob das abo lebt.`
    case 'boxen':
      return `${name} boxt ${bisher}. ${v.ziel}× bis sonntag, dann zeigt sich, wer nur redet.`
    case 'lesen':
      return `${name} liest ${bisher}. ${v.ziel} lesetage bis sonntag — das buch staubt schon.`
    case 'lernen':
      return `${name} lernt ${bisher}. ${v.ziel}× bis sonntag, abi wartet nicht.`
    case 'gewicht':
      return `${name} steigt ${bisher} auf die waage. ${v.ziel}× bis sonntag, jeden tag frisch eingetragen.`
  }
}

/** was ein fehler von `neueAnsage`, `reagiere` oder vom server für die person heißt */
export const ANSAGE_FEHLERTEXT: Record<AnsageFehler, string> = {
  selbst: 'an dich selbst geht keine ansage.',
  keineAnsagenMehr: 'deine zwei ansagen dieser woche sind weg.',
  allinVerbraucht: 'dein all-in dieser woche ist schon raus.',
  zuSpaet: 'ab freitag 18 uhr gibt es keine ansagen mehr — montag wieder.',
  schonAngesagt: 'in diesem feld hast du diese woche schon angesagt.',
  feldInaktiv: 'das macht er gerade gar nicht — da gibt es keinen punkt geschenkt.',
  keinZiel: 'für dieses feld passt diese woche kein faires ziel mehr.',
  nichtDeine: 'diese ansage geht nicht an dich.',
  schonReagiert: 'darauf hast du schon reagiert.',
  reaktionZuSpaet: 'die 24 stunden zum reagieren sind vorbei.',
  kontraZuSpaet: 'kontern geht nur, bevor bei dir etwas zählt.',
  veraltet: 'die app ist veraltet. einmal neu laden.',
}

/**
 * eine ansage, die das backend abgelehnt hat — mit demselben grund wie die
 * vorprüfung. die datenbank schreibt ihn als `ansage:<grund>` in die meldung.
 */
export class AnsageAbgelehnt extends Error {
  readonly grund: AnsageFehler

  constructor(grund: AnsageFehler) {
    super(`ansage:${grund}`)
    this.name = 'AnsageAbgelehnt'
    this.grund = grund
  }
}

const ANSAGE_FEHLER = Object.keys(ANSAGE_FEHLERTEXT) as AnsageFehler[]

/** liest den grund aus einer abgelehnten ansage, lokal wie vom server */
export function ansageFehlerAus(fehler: unknown): AnsageFehler | null {
  if (fehler instanceof AnsageAbgelehnt) return fehler.grund
  const text = fehler && typeof fehler === 'object' ? (fehler as { message?: unknown }).message : null
  if (typeof text !== 'string') return null
  const treffer = /^ansage:(\w+)$/.exec(text.trim())
  const grund = treffer?.[1] as AnsageFehler | undefined
  return grund && ANSAGE_FEHLER.includes(grund) ? grund : null
}

const DATUM = /^\d{4}-\d{2}-\d{2}$/

function istZeitpunkt(x: unknown): x is string {
  return typeof x === 'string' && !Number.isNaN(Date.parse(x))
}

/** prüft eine gespeicherte oder empfangene ansage, bevor sie in den zustand kommt */
export function istAnsage(wert: unknown): wert is Ansage {
  if (!wert || typeof wert !== 'object' || Array.isArray(wert)) return false
  const a = wert as Record<string, unknown>
  const person = (x: unknown) => x === 'erijon' || x === 'koray'
  if (typeof a.id !== 'string' || !a.id) return false
  if (!person(a.von) || !person(a.an) || a.von === a.an) return false
  if (!(ANSAGE_FELDER as readonly unknown[]).includes(a.feld)) return false
  if (typeof a.ab !== 'string' || !DATUM.test(a.ab) || typeof a.bis !== 'string' || !DATUM.test(a.bis)) return false
  if (a.ab > a.bis) return false
  if (typeof a.ziel !== 'number' || !Number.isInteger(a.ziel) || a.ziel < 1 || a.ziel > 7) return false
  if (!istZeitpunkt(a.erstelltAm)) return false

  if (a.version === 2) {
    if (!(ANSAGE_STUFEN as readonly unknown[]).includes(a.stufe)) return false
    if (a.einsatz !== STUFEN_EINSATZ[a.stufe as AnsageStufe]) return false
    if (a.bezug !== undefined && (typeof a.bezug !== 'string' || !a.bezug)) return false
    if (a.reaktion !== undefined) {
      const r = a.reaktion as Record<string, unknown> | null
      if (!r || typeof r !== 'object') return false
      if (r.art !== 'kontern' && r.art !== 'duAuch') return false
      if (!istZeitpunkt(r.am)) return false
    }
  } else {
    if (a.version !== undefined && a.version !== 1) return false
    if (a.feld === 'lernen' || a.ziel > 6) return false
    if (a.stufe !== undefined || a.reaktion !== undefined || a.bezug !== undefined) return false
  }

  if (a.entschieden === undefined) return true
  const e = a.entschieden as Record<string, unknown> | null
  return Boolean(e)
    && typeof e === 'object'
    && (e!.ergebnis === 'geschafft' || e!.ergebnis === 'verfehlt')
    && istZeitpunkt(e!.am)
}
