import { AREAS, FELDER, other } from './types'
import type { Abrechnung, FeldId, TickQuelle, UserId, Zustand } from './types'
import { addDays, fromKey, isoWeek, startOfWeek, toKey, weekDays } from './dates'
import { dauerMinuten, messungen, tagVon } from './training'
import { erledigteFelder, quelle, tageMitDaten, wocheBereich, wocheGesamt } from './tracker'

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
  /** Tage mit ausschließlich automatischer Messung */
  gemessen: number
  /** Tage mit automatischer Messung und mindestens einer manuellen Einheit */
  gemischt: number
  /** Tage mit ausschließlich manueller Einheit */
  getippt: number
  /** bisherige Tiebreak-Basis: ausschließlich gemessen plus gemischt */
  belegt: number
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
  /** Archive speichern bislang nur den Abstand, nie erfundene absolute Staende. */
  punkteIch: number | null
  punkteEr: number | null
  belegIch: number
  belegEr: number
  sieger: 'ich' | 'er' | 'unentschieden'
  grund: Abrechnung['grund']
  differenz: number
  herkunft: 'archiviert' | 'nachberechnet'
  archivQuelle?: Abrechnung['archivQuelle']
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

/**
 * der beleg zählt nur die vier bereiche, nicht das gewicht. für gym, boxen,
 * lernen und lesen hat jeder dieselbe messquelle im telefon — eine waage, die
 * nach apple health schreibt, hat nicht jeder. ein tiebreak, der an der
 * ausrüstung hängt, misst den einkauf und nicht die woche.
 */
export function belegQuote(z: Zustand, u: UserId, woche: string[]): BelegInfo {
  let gemessenAnzahl = 0
  let gemischtAnzahl = 0
  let getipptAnzahl = 0

  for (const tag of woche) {
    for (const f of AREAS) {
      const q = quelle(z, u, f.id, tag)
      if (q === 'gemessen') gemessenAnzahl++
      else if (q === 'gemischt') gemischtAnzahl++
      else if (q === 'getippt') getipptAnzahl++
    }
  }

  // Vor dieser Unterscheidung galt ein gemischter Tag als gemessen. `belegt`
  // erhaelt genau diese bestehende Punkte- und Tiebreak-Basis; nur die Anzeige
  // wird ehrlicher aufgeschluesselt.
  const belegt = gemessenAnzahl + gemischtAnzahl
  const gesamt = belegt + getipptAnzahl
  const quote = gesamt > 0 ? Math.round((belegt / gesamt) * 100) : null

  return {
    gemessen: gemessenAnzahl,
    gemischt: gemischtAnzahl,
    getippt: getipptAnzahl,
    belegt,
    gesamt,
    quote,
  }
}

/**
 * archiviert den sonntagsstand: dieselbe regel wie finale und historie —
 * punkte, bei gleichstand der beleg.
 */
export function abrechnungFuerWoche(
  z: Zustand,
  woche: string[],
  wetteText: string | null
): Abrechnung {
  const punkteErijon = wocheGesamt(z, 'erijon', woche)
  const punkteKoray = wocheGesamt(z, 'koray', woche)
  const belegErijon = belegQuote(z, 'erijon', woche).belegt
  const belegKoray = belegQuote(z, 'koray', woche).belegt
  const entscheidung = entscheideDuell(punkteErijon, punkteKoray, belegErijon, belegKoray)
  const wette = wetteText && wetteText.trim() ? wetteText.trim().slice(0, 160) : null
  return {
    woche: woche[0]!,
    sieger: entscheidung.sieger === 'ich' ? 'erijon' : entscheidung.sieger === 'er' ? 'koray' : 'unentschieden',
    grund: entscheidung.grund,
    differenz: punkteErijon - punkteKoray,
    belegErijon,
    belegKoray,
    wette,
    abgeschlossen: new Date().toISOString(),
    berechnungVersion: 1,
    archivQuelle: 'lokal',
    punkteErijon,
    punkteKoray,
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
    belegIch.belegt,
    belegEr.belegt
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
        quelle: z.gewichtQuellen?.[key] ?? 'getippt',
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

function gueltigerTag(tag: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(tag) && toKey(fromKey(tag)) === tag
}

function istDatumsschluessel(key: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(key) && toKey(fromKey(key)) === key
}

/**
 * Verpasste Wochen werden nur dann nachgeholt, wenn mindestens eine echte
 * Trackerquelle oder ein bewusst gesetzter Wetteinsatz zu dieser Woche
 * gehoert. Leere Luecken werden nicht als nachtraegliche Remis erfunden.
 */
export function fehlendeAbschlussWochen(
  z: Zustand,
  wetten: Readonly<Record<string, string>>,
  abrechnungen: readonly Abrechnung[],
  jetzt: Date
): string[] {
  const laufendeWoche = toKey(startOfWeek(jetzt))
  const vorhanden = new Set(abrechnungen.map((a) => a.woche))
  const kandidaten = new Set<string>()

  for (const user of ['erijon', 'koray'] as const) {
    for (const tag of tageMitDaten(z, user)) {
      if (!istDatumsschluessel(tag)) continue
      kandidaten.add(toKey(startOfWeek(fromKey(tag))))
    }
  }
  for (const woche of Object.keys(wetten)) {
    if (!istDatumsschluessel(woche)) continue
    if (toKey(startOfWeek(fromKey(woche))) === woche) kandidaten.add(woche)
  }

  return [...kandidaten]
    .filter((woche) => woche < laufendeWoche && !vorhanden.has(woche))
    .sort()
}

/**
 * Ganze Kalenderwochen bis zum ältesten Rohdatum oder Archiv. Die Rechnung
 * läuft über UTC-Kalendertage, damit eine Zeitumstellung keine Woche verliert.
 */
export function historieWochen(
  z: Zustand,
  aktuelleWocheStart: Date,
  abrechnungen: Abrechnung[] = []
): number {
  const tage: string[] = []
  for (const listen of Object.values(z.einheiten)) for (const e of listen) tage.push(e.tag)
  for (const key of Object.keys(z.gewichte)) tage.push(key.split('|')[1] ?? '')
  for (const a of z.aufenthalte) {
    const tag = tagVon(a)
    if (tag) tage.push(tag)
  }
  for (const abrechnung of abrechnungen) tage.push(abrechnung.woche)

  const aktuellerMontag = startOfWeek(aktuelleWocheStart)
  const aktuellerMontagKey = toKey(aktuellerMontag)
  const gueltig = tage
    .filter((tag) => gueltigerTag(tag) && tag <= aktuellerMontagKey)
    .map((tag) => toKey(startOfWeek(fromKey(tag))))
    .sort()
  if (gueltig.length === 0) return 0

  const aeltester = fromKey(gueltig[0]!)
  const utcAktuell = Date.UTC(
    aktuellerMontag.getFullYear(),
    aktuellerMontag.getMonth(),
    aktuellerMontag.getDate()
  )
  const utcAlt = Date.UTC(aeltester.getFullYear(), aeltester.getMonth(), aeltester.getDate())
  return Math.max(0, Math.round((utcAktuell - utcAlt) / (7 * 86_400_000)))
}

export function saisonHistorie(
  z: Zustand,
  aktuelleWocheStart: Date,
  wochenZurueck: number = 6,
  me: UserId,
  abrechnungen: Abrechnung[] = []
): DuellHistorie {
  const er = other(me)
  const aktuellerMontag = startOfWeek(aktuelleWocheStart)
  const aktuellerMontagKey = toKey(aktuellerMontag)
  const letzteWochen: WochenBilanz[] = []

  // Der erste persistierte Abschluss gewinnt bereits im lokalen und im
  // produktiven Backend. Dieselbe Regel gilt bei unerwarteten Duplikaten hier.
  const archive = new Map<string, Abrechnung>()
  for (const abrechnung of abrechnungen) {
    if (!archive.has(abrechnung.woche)) archive.set(abrechnung.woche, abrechnung)
  }
  const hatAktuellesArchiv = archive.has(aktuellerMontagKey)

  let siegeIch = 0
  let siegeEr = 0
  let unentschieden = 0

  for (let i = hatAktuellesArchiv ? 0 : 1; i <= Math.max(0, wochenZurueck); i++) {
    const montag = addDays(aktuellerMontag, -7 * i)
    const wocheTage = weekDays(montag)
    const wocheKey = toKey(montag)
    const archiv = archive.get(wocheKey)

    if (archiv) {
      const sieger = archiv.sieger === 'unentschieden'
        ? 'unentschieden' as const
        : archiv.sieger === me
          ? 'ich' as const
          : 'er' as const
      const perspektivDifferenz = me === 'erijon' ? archiv.differenz : -archiv.differenz
      const differenz = perspektivDifferenz === 0 ? 0 : perspektivDifferenz
      if (sieger === 'ich') siegeIch++
      else if (sieger === 'er') siegeEr++
      else unentschieden++

      letzteWochen.push({
        kw: isoWeek(montag),
        wocheKey,
        montag: wocheTage[0],
        sonntag: wocheTage[6],
        punkteIch: me === 'erijon'
          ? (archiv.punkteErijon ?? null)
          : (archiv.punkteKoray ?? null),
        punkteEr: me === 'erijon'
          ? (archiv.punkteKoray ?? null)
          : (archiv.punkteErijon ?? null),
        belegIch: me === 'erijon' ? archiv.belegErijon : archiv.belegKoray,
        belegEr: me === 'erijon' ? archiv.belegKoray : archiv.belegErijon,
        sieger,
        grund: archiv.grund,
        differenz,
        herkunft: 'archiviert',
        archivQuelle: archiv.archivQuelle,
      })
      continue
    }

    // Noch nicht archivierte Altwochen werden mit derselben Fünf-Felder-
    // Punktebasis wie Live-Stand und Abschluss nachberechnet. Der Beleg bleibt
    // ausschließlich der Tiebreak der vier automatisierbaren Bereiche.
    const belegIch = belegQuote(z, me, wocheTage)
    const belegEr = belegQuote(z, er.id, wocheTage)
    const pIch = wocheGesamt(z, me, wocheTage)
    const pEr = wocheGesamt(z, er.id, wocheTage)
    const bIch = belegIch.belegt
    const bEr = belegEr.belegt

    if (pIch === 0 && pEr === 0) continue

    const entscheidung = entscheideDuell(pIch, pEr, bIch, bEr)
    const sieger = entscheidung.sieger
    if (sieger === 'ich') siegeIch++
    else if (sieger === 'er') siegeEr++
    else unentschieden++

    letzteWochen.push({
      kw: isoWeek(montag),
      wocheKey,
      montag: wocheTage[0],
      sonntag: wocheTage[6],
      punkteIch: pIch,
      punkteEr: pEr,
      belegIch: bIch,
      belegEr: bEr,
      sieger,
      grund: entscheidung.grund,
      differenz: pIch - pEr,
      herkunft: 'nachberechnet',
    })
  }

  let serieHalter: 'ich' | 'er' | 'keiner' = 'keiner'
  let serieAnzahl = 0

  let erwarteteWoche = hatAktuellesArchiv
    ? aktuellerMontagKey
    : toKey(addDays(aktuellerMontag, -7))
  for (const w of letzteWochen) {
    // Eine spielfreie Kalenderwoche unterbricht eine Serie. Übersprungene
    // 0:0-Wochen dürfen nicht zwei Siege künstlich aneinanderkleben.
    if (w.montag !== erwarteteWoche) break
    if (w.sieger === 'unentschieden') break
    if (serieHalter === 'keiner') {
      serieHalter = w.sieger
      serieAnzahl = 1
    } else if (serieHalter === w.sieger) {
      serieAnzahl++
    } else {
      break
    }
    erwarteteWoche = toKey(addDays(fromKey(erwarteteWoche), -7))
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
