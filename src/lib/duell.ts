import { AREAS, FELDER, gewichtKey, other } from './types'
import type { Abrechnung, FeldId, TickQuelle, UserId, Zustand } from './types'
import { addDays, isoWeek, startOfWeek, toKey, weekDays } from './dates'
import { dauerMinuten, messungen, tagVon } from './training'
import { erledigteFelder, quelle, tagesWert, wocheBereich, wocheGesamt } from './tracker'

export type DruckStatus =
  | 'offen'
  | 'heuteFuehrung'
  | 'heuteRueckstand'
  | 'heuteGleichstand'
  | 'wocheFuehrung'
  | 'wocheRueckstand'
  | 'aufholen'
  | 'abstandGross'
  | 'uneinholbar'
  | 'matchball'
  | 'zugzwang'
  | 'entschieden'

export type FrontenHalter = 'ich' | 'er' | 'unentschieden' | 'offen'

export type FrontInfo = {
  id: FeldId
  label: string
  ichPunkte: number
  erPunkte: number
  halter: FrontenHalter
}

export type BelegInfo = {
  gemessen: number
  getippt: number
  gesamt: number
  quote: number | null
}

export type RestprogrammInfo = {
  restMaxIch: number
  restMaxEr: number
  uneinholbarIch: boolean
  uneinholbarEr: boolean
  matchballIch: boolean
  matchballEr: boolean
  zugzwangIch: boolean
}

export type DuellMatch = {
  heuteIch: number
  heuteEr: number

  wocheIch: number
  wocheEr: number
  wocheDiff: number

  dominanzVerhaeltnis: number
  statusText: string
  druck: DruckStatus
  restprogramm: RestprogrammInfo
  fronten: FrontInfo[]
  frontenScore: { ich: number; er: number; geteilt: number }
  belegIch: BelegInfo
  belegEr: BelegInfo
}

export type TickerEintrag = {
  id: string
  userId: UserId
  feld: FeldId
  zeitstempel: Date | null
  tag: string
  relativeZeit: string
  quelle: TickQuelle
  zusatz?: string
}

export type WochenBilanz = {
  kw: number
  wocheKey: string
  montag: string
  sonntag: string
  punkteIch: number
  punkteEr: number
  belegIch: number
  belegEr: number
  sieger: 'ich' | 'er' | 'unentschieden'
  differenz: number
}

export type DuellHistorie = {
  siegeIch: number
  siegeEr: number
  unentschieden: number
  aktuelleSerie: {
    halter: 'ich' | 'er' | 'keiner'
    anzahl: number
  }
  letzteWochen: WochenBilanz[]
}

export type DuellEntscheidung = {
  sieger: 'ich' | 'er' | 'unentschieden'
  grund: 'punkte' | 'beleg' | 'unentschieden'
}

/** Eine Siegerregel für Finale und Historie: Punkte, danach verifizierte Felder. */
export function entscheideDuell(
  punkteIch: number,
  punkteEr: number,
  belegIch: number,
  belegEr: number
): DuellEntscheidung {
  if (punkteIch !== punkteEr) {
    return { sieger: punkteIch > punkteEr ? 'ich' : 'er', grund: 'punkte' }
  }
  if (belegIch !== belegEr) {
    return { sieger: belegIch > belegEr ? 'ich' : 'er', grund: 'beleg' }
  }
  return { sieger: 'unentschieden', grund: 'unentschieden' }
}

export function belegQuote(z: Zustand, u: UserId, woche: string[]): BelegInfo {
  let gemessenAnzahl = 0
  let getipptAnzahl = 0

  for (const tag of woche) {
    for (const f of FELDER) {
      const q = quelle(z, u, f.id, tag)
      if (q === 'gemessen') gemessenAnzahl++
      else if (q === 'getippt') getipptAnzahl++
    }
  }

  const gesamt = gemessenAnzahl + getipptAnzahl
  const quote = gesamt > 0 ? Math.round((gemessenAnzahl / gesamt) * 100) : null

  return {
    gemessen: gemessenAnzahl,
    getippt: getipptAnzahl,
    gesamt,
    quote,
  }
}

/** summe der werte einer woche, in der einheit des bereichs */
export function wochenVolumen(z: Zustand, woche: string[], u: UserId, f: FeldId): number {
  return woche.reduce((summe, tag) => summe + tagesWert(z, u, f, tag), 0)
}

/**
 * die woche in zahlen je bereich und person. beim gewicht zählt nicht das
 * volumen, sondern die tage mit eintrag.
 */
export function wochenZahlen(
  z: Zustand,
  woche: string[],
  ich: UserId,
  er: UserId
): Array<{ id: FeldId; label: string; ich: number; er: number }> {
  return FELDER.map(({ id, label }) => {
    if (id === 'gewicht') {
      return {
        id,
        label,
        ich: woche.filter((tag) => z.gewichte[gewichtKey(ich, tag)] !== undefined).length,
        er: woche.filter((tag) => z.gewichte[gewichtKey(er, tag)] !== undefined).length,
      }
    }
    return { id, label, ich: wochenVolumen(z, woche, ich, id), er: wochenVolumen(z, woche, er, id) }
  })
}

/**
 * archiviert den sonntagsstand: dieselbe regel wie finale und historie —
 * punkte, bei gleichstand der beleg.
 */
export function abrechnungFuerWoche(
  z: Zustand,
  woche: string[],
  ich: UserId,
  er: UserId,
  wetteText: string | null
): Abrechnung {
  const punkteIch = wocheGesamt(z, ich, woche)
  const punkteEr = wocheGesamt(z, er, woche)
  const belegIch = belegQuote(z, ich, woche).gemessen
  const belegEr = belegQuote(z, er, woche).gemessen
  const entscheidung = entscheideDuell(punkteIch, punkteEr, belegIch, belegEr)
  const wette = wetteText && wetteText.trim() ? wetteText.trim().slice(0, 160) : null
  return {
    woche: woche[0]!,
    sieger: entscheidung.sieger === 'ich' ? ich : entscheidung.sieger === 'er' ? er : 'unentschieden',
    grund: entscheidung.grund,
    differenz: punkteIch - punkteEr,
    belegIch,
    belegEr,
    wette,
    abgeschlossen: new Date().toISOString(),
  }
}

export function duellFronten(z: Zustand, woche: string[], ichId: UserId, erId: UserId): FrontInfo[] {
  return FELDER.map(({ id, label }) => {
    const ichPunkte = wocheBereich(z, ichId, id, woche)
    const erPunkte = wocheBereich(z, erId, id, woche)
    const halter: FrontenHalter =
      ichPunkte === 0 && erPunkte === 0
        ? 'offen'
        : ichPunkte > erPunkte
          ? 'ich'
          : ichPunkte < erPunkte
            ? 'er'
            : 'unentschieden'

    return { id, label, ichPunkte, erPunkte, halter }
  })
}

export function berechneRestprogramm(
  woche: string[],
  heuteKey: string,
  punkteIch: number,
  punkteEr: number,
  heuteIch: number = 0,
  heuteEr: number = 0
): RestprogrammInfo {
  const heuteIdx = woche.indexOf(heuteKey)
  const nachHeute = heuteIdx >= 0 ? Math.max(0, 6 - heuteIdx) * 5 : 0
  const heuteRestIch = heuteIdx >= 0 ? Math.max(0, 5 - heuteIch) : 0
  const heuteRestEr = heuteIdx >= 0 ? Math.max(0, 5 - heuteEr) : 0
  const restMaxIch = nachHeute + heuteRestIch
  const restMaxEr = nachHeute + heuteRestEr

  const uneinholbarIch = punkteIch > punkteEr + restMaxEr
  const uneinholbarEr = punkteEr > punkteIch + restMaxIch
  const matchballIch = !uneinholbarIch && restMaxIch > 0 && punkteIch + 1 > punkteEr + restMaxEr
  const matchballEr = !uneinholbarEr && restMaxEr > 0 && punkteEr + 1 > punkteIch + restMaxIch
  const zugzwangIch = punkteIch < punkteEr && !uneinholbarEr

  return {
    restMaxIch,
    restMaxEr,
    uneinholbarIch,
    uneinholbarEr,
    matchballIch,
    matchballEr,
    zugzwangIch,
  }
}

export function duellStatusText(
  heuteIch: number,
  heuteEr: number,
  wocheIch: number,
  wocheEr: number,
  rest: RestprogrammInfo,
  erName: string,
  belegIch: number = 0,
  belegEr: number = 0
): { text: string; druck: DruckStatus } {
  const wocheDiff = wocheIch - wocheEr
  const heuteDiff = heuteIch - heuteEr

  if (wocheIch === 0 && wocheEr === 0 && heuteIch === 0 && heuteEr === 0) {
    return { text: 'woche eröffnet · wer holt den ersten punkt?', druck: 'offen' }
  }

  if (rest.restMaxIch === 0 && rest.restMaxEr === 0) {
    const ende = entscheideDuell(wocheIch, wocheEr, belegIch, belegEr)
    if (ende.sieger === 'ich') {
      return {
        text: ende.grund === 'beleg' ? 'gleichstand · du gewinnst den beleg-tiebreak' : 'wochensieg gesichert',
        druck: 'entschieden',
      }
    }
    if (ende.sieger === 'er') {
      return {
        text: ende.grund === 'beleg' ? `gleichstand · ${erName} gewinnt den beleg-tiebreak` : `${erName} gewinnt die woche`,
        druck: 'entschieden',
      }
    }
    return { text: 'woche endet unentschieden · auch der beleg ist gleich', druck: 'entschieden' }
  }

  if (rest.uneinholbarIch) {
    return { text: 'dir ist die woche rechnerisch nicht mehr zu nehmen', druck: 'uneinholbar' }
  }

  if (rest.uneinholbarEr) {
    return { text: erName + ' hat die woche rechnerisch für sich entschieden', druck: 'entschieden' }
  }

  if (rest.matchballIch) {
    return { text: 'matchball: noch 1 punkt bis zum sicheren wochensieg', druck: 'matchball' }
  }

  if (rest.matchballEr) {
    return { text: 'matchball für ' + erName + ' · du bist unter zugzwang', druck: 'zugzwang' }
  }

  if (heuteDiff > 0 && wocheDiff < 0) {
    return {
      text: 'du holst auf: heute ' + heuteIch + ':' + heuteEr + ' · rückstand nur noch ' + Math.abs(wocheDiff),
      druck: 'aufholen',
    }
  }

  if (heuteDiff > 0) {
    return {
      text: 'du führst heute ' + heuteIch + ':' + heuteEr + ' · woche ' + wocheIch + ':' + wocheEr,
      druck: 'heuteFuehrung',
    }
  }

  if (heuteDiff < 0) {
    return {
      text: erName + ' führt heute ' + heuteEr + ':' + heuteIch + ' · zeit nachzulegen',
      druck: 'heuteRueckstand',
    }
  }

  if (heuteIch > 0 && heuteDiff === 0) {
    return {
      text: 'heute gleichstand ' + heuteIch + ':' + heuteEr + ' · der nächste punkt entscheidet den tag',
      druck: 'heuteGleichstand',
    }
  }

  if (wocheDiff > 4) {
    return {
      text: 'starke führung: +' + wocheDiff + ' punkte vor ' + erName,
      druck: 'wocheFuehrung',
    }
  }

  if (wocheDiff > 0) {
    return {
      text: 'du führst die woche ' + wocheIch + ':' + wocheEr + ' (+' + wocheDiff + ')',
      druck: 'wocheFuehrung',
    }
  }

  if (wocheDiff < -4) {
    return {
      text: erName + ' zieht davon: ' + Math.abs(wocheDiff) + ' punkte rückstand',
      druck: 'abstandGross',
    }
  }

  if (wocheDiff < 0) {
    return {
      text: erName + ' führt die woche ' + wocheEr + ':' + wocheIch + ' · du unter zugzwang',
      druck: 'wocheRueckstand',
    }
  }

  return { text: 'woche unentschieden ' + wocheIch + ':' + wocheEr + ' · alles offen', druck: 'offen' }
}

export function berechneDuell(
  z: Zustand,
  woche: string[],
  heuteKey: string,
  ichId: UserId
): DuellMatch {
  const er = other(ichId)
  const heuteIch = erledigteFelder(z, ichId, heuteKey)
  const heuteEr = erledigteFelder(z, er.id, heuteKey)

  const wocheIch = wocheGesamt(z, ichId, woche)
  const wocheEr = wocheGesamt(z, er.id, woche)
  const wocheDiff = wocheIch - wocheEr

  const gesamtSumme = wocheIch + wocheEr
  const dominanzVerhaeltnis = gesamtSumme > 0 ? wocheIch / gesamtSumme : 0.5

  const restprogramm = berechneRestprogramm(
    woche,
    heuteKey,
    wocheIch,
    wocheEr,
    heuteIch,
    heuteEr
  )
  const fronten = duellFronten(z, woche, ichId, er.id)

  const frontenScore = {
    ich: fronten.filter((f) => f.halter === 'ich').length,
    er: fronten.filter((f) => f.halter === 'er').length,
    geteilt: fronten.filter((f) => f.halter === 'unentschieden').length,
  }

  const belegIch = belegQuote(z, ichId, woche)
  const belegEr = belegQuote(z, er.id, woche)

  const { text: statusText, druck } = duellStatusText(
    heuteIch,
    heuteEr,
    wocheIch,
    wocheEr,
    restprogramm,
    er.name,
    belegIch.gemessen,
    belegEr.gemessen
  )

  return {
    heuteIch,
    heuteEr,
    wocheIch,
    wocheEr,
    wocheDiff,
    dominanzVerhaeltnis,
    statusText,
    druck,
    restprogramm,
    fronten,
    frontenScore,
    belegIch,
    belegEr,
  }
}

export function duellTickerEintraege(
  z: Zustand,
  woche: string[],
  referenzZeit: Date = new Date(),
  limit: number = 6
): TickerEintrag[] {
  const eintraege: TickerEintrag[] = []

  for (const einheitenListe of Object.values(z.einheiten)) {
    for (const einheit of einheitenListe) {
      if (!woche.includes(einheit.tag)) continue
      const dt = einheit.erfasst ? new Date(einheit.erfasst) : null
      eintraege.push({
        id: 'einheit-' + einheit.id,
        userId: einheit.user,
        feld: einheit.area,
        zeitstempel: dt,
        tag: einheit.tag,
        relativeZeit: formatiereRelativeZeit(dt, einheit.tag, referenzZeit),
        quelle: 'getippt',
        zusatz: (einheit.wert !== null && einheit.wert > 0) ? '+' + einheit.wert : undefined,
      })
    }
  }

  for (const tag of woche) {
    for (const userId of ['erijon', 'koray'] as UserId[]) {
      for (const area of AREAS) {
        for (const aufenthalt of messungen(z.aufenthalte, userId, area.id, tag)) {
          const dt = new Date(aufenthalt.abgang!)
          const dauer = dauerMinuten(aufenthalt)!
          eintraege.push({
            id: `aufenthalt-${userId}-${area.id}-${aufenthalt.ankunft}`,
            userId,
            feld: area.id,
            zeitstempel: dt,
            tag: tagVon(aufenthalt),
            relativeZeit: formatiereRelativeZeit(dt, tag, referenzZeit),
            quelle: 'gemessen',
            zusatz: Math.round(dauer) + ' min',
          })
        }
      }
    }
  }

  for (const [key, kg] of Object.entries(z.gewichte)) {
    const parts = key.split('|')
    if (parts.length === 2) {
      const [u, tag] = parts as [UserId, string]
      if (!woche.includes(tag)) continue
      eintraege.push({
        id: 'gewicht-' + key,
        userId: u,
        feld: 'gewicht',
        zeitstempel: null,
        tag,
        relativeZeit: formatiereRelativeZeit(null, tag, referenzZeit),
        quelle: 'gemessen',
        zusatz: kg.toFixed(1) + ' kg',
      })
    }
  }

  eintraege.sort((a, b) => {
    const tagDiff = b.tag.localeCompare(a.tag)
    if (tagDiff !== 0) return tagDiff
    return (b.zeitstempel?.getTime() ?? 0) - (a.zeitstempel?.getTime() ?? 0)
  })
  return eintraege.slice(0, limit)
}

function formatiereRelativeZeit(d: Date | null, tag: string, jetzt: Date): string {
  if (!d || !Number.isFinite(d.getTime())) {
    return tag === toKey(jetzt) ? 'heute' : tag.slice(8, 10) + '.' + tag.slice(5, 7) + '.'
  }
  const diffSek = Math.max(0, Math.floor((jetzt.getTime() - d.getTime()) / 1000))
  if (diffSek < 60) return 'gerade eben'
  const diffMin = Math.floor(diffSek / 60)
  if (diffMin < 60) return 'vor ' + diffMin + 'm'
  const diffStd = Math.floor(diffMin / 60)
  if (diffStd < 24) return 'vor ' + diffStd + 'h'
  const diffTage = Math.floor(diffStd / 24)
  return 'vor ' + diffTage + 'd'
}

/** Anzahl Wochen bis zum ältesten vorhandenen Datensatz; keine künstliche 6-Wochen-Grenze. */
export function historieWochen(z: Zustand, aktuelleWocheStart: Date): number {
  const tage: string[] = []
  for (const listen of Object.values(z.einheiten)) for (const e of listen) tage.push(e.tag)
  for (const key of Object.keys(z.gewichte)) tage.push(key.split('|')[1] ?? '')
  for (const a of z.aufenthalte) {
    const tag = tagVon(a)
    if (tag) tage.push(tag)
  }
  const gueltig = tage.filter((tag) => /^\d{4}-\d{2}-\d{2}$/.test(tag)).sort()
  if (gueltig.length === 0) return 0
  const diff = Math.floor((startOfWeek(aktuelleWocheStart).getTime() - new Date(gueltig[0] + 'T12:00:00').getTime()) / 604800000)
  return Math.max(0, diff + 1)
}

export function saisonHistorie(
  z: Zustand,
  aktuelleWocheStart: Date,
  wochenZurueck: number = 6,
  me: UserId
): DuellHistorie {
  const er = other(me)
  const aktuellerMontag = startOfWeek(aktuelleWocheStart)
  const letzteWochen: WochenBilanz[] = []

  let siegeIch = 0
  let siegeEr = 0
  let unentschieden = 0

  for (let i = 1; i <= wochenZurueck; i++) {
    const montag = addDays(aktuellerMontag, -7 * i)
    const wocheTage = weekDays(montag)
    // jedes gewertete feld ist genau ein punkt, deshalb ist `gesamt` der
    // wochenstand. eine zweite runde über dieselben 35 felder wäre dieselbe
    // zahl noch einmal — und in der historie mal die anzahl der wochen.
    const belegIch = belegQuote(z, me, wocheTage)
    const belegEr = belegQuote(z, er.id, wocheTage)
    const pIch = belegIch.gesamt
    const pEr = belegEr.gesamt
    const bIch = belegIch.gemessen
    const bEr = belegEr.gemessen

    if (pIch === 0 && pEr === 0) continue

    const sieger = entscheideDuell(pIch, pEr, bIch, bEr).sieger
    if (sieger === 'ich') siegeIch++
    else if (sieger === 'er') siegeEr++
    else unentschieden++

    letzteWochen.push({
      kw: isoWeek(montag),
      wocheKey: toKey(montag),
      montag: wocheTage[0],
      sonntag: wocheTage[6],
      punkteIch: pIch,
      punkteEr: pEr,
      belegIch: bIch,
      belegEr: bEr,
      sieger,
      differenz: pIch - pEr,
    })
  }

  let serieHalter: 'ich' | 'er' | 'keiner' = 'keiner'
  let serieAnzahl = 0

  for (let i = 0; i < letzteWochen.length; i++) {
    const w = letzteWochen[i]!
    // Eine spielfreie Kalenderwoche unterbricht eine Serie. Übersprungene
    // 0:0-Wochen dürfen nicht zwei Siege künstlich aneinanderkleben.
    if (w.montag !== toKey(addDays(aktuellerMontag, -7 * (i + 1)))) break
    if (w.sieger === 'unentschieden') break
    if (serieHalter === 'keiner') {
      serieHalter = w.sieger
      serieAnzahl = 1
    } else if (serieHalter === w.sieger) {
      serieAnzahl++
    } else {
      break
    }
  }

  return {
    siegeIch,
    siegeEr,
    unentschieden,
    aktuelleSerie: {
      halter: serieHalter,
      anzahl: serieAnzahl,
    },
    letzteWochen,
  }
}
