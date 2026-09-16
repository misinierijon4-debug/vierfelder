import { lokaleMinute } from './erinnerung.ts'
import type { Person } from './eniLage.ts'

/**
 * Die vier Trackerbereiche. Die Liste steht hier noch einmal, weil ein
 * Wochenrueckblick ein eigener Datenvertrag ist und nicht von der aktuellen
 * LAGE (die immer die laufende Woche beschreibt) abhaengen darf.
 */
export const WOCHEN_BEREICHE = ['lernen', 'gym', 'boxen', 'lesen'] as const
export type WochenBereich = (typeof WOCHEN_BEREICHE)[number]

export const WOCHEN_PERSONEN = ['erijon', 'koray'] as const
export type WochenPerson = (typeof WOCHEN_PERSONEN)[number]

export const WOCHEN_ZONE = 'Europe/Berlin'
export const MAX_WOCHENZEILEN = 2_000
export const MAX_AUFENTHALT_MINUTEN = 12 * 60

type Fehler = { code?: string; message?: string; status?: number } | null
type Ergebnis<T> = { data: T; error: Fehler; count?: number | null }

/** Nur die Lese-Kette, die ein Wochenbericht benutzt. */
export type WochenAbfrage = PromiseLike<Ergebnis<Array<Record<string, unknown>> | null>> & {
  gte(spalte: string, wert: string): WochenAbfrage
  limit(anzahl: number): WochenAbfrage
}

export type WochenDatenbank = {
  from(tabelle: string): {
    select(
      spalten: string,
      optionen?: { count?: 'exact'; head?: boolean }
    ): WochenAbfrage
  }
}

export type WochenQuelleStatus = {
  status: 'ok' | 'unbekannt'
  /** Anzahl der vom Server gelieferten Zeilen, bevor sie fachlich gefiltert werden. */
  geleseneZeilen: number | null
  grund?: string
}

export type WochenKategorie = {
  /** echte, fachlich gueltige Rohzeilen, nicht deduplizierte Tage */
  echteDatensaetze: number
  /** ein Punkt je Person, Bereich und Berliner Kalendertag */
  tagespunkte: number | null
  tage: number
  /** nur abgeschlossene Messungen ueber der Bereichsschwelle */
  gemesseneDatensaetze: number
  gemesseneMinuten: number
  /** manuelle Werte koennen null sein; deren Summe bleibt dann unbekannt */
  manuelleDatensaetze: number
  manuelleWerte: number
  manuelleWertSumme: number | null
}

export type WochenGewicht = {
  echteDatensaetze: number
  tagespunkte: number
  tage: number
  werte: number[]
  mittelwert: number | null
  letzterTag: string | null
  letzterWert: number | null
}

export type WochenSchlaf = {
  /** Rohzeilen; mehrere Zeilen derselben Nacht werden hier sichtbar. */
  echteDatensaetze: number
  /** deduplizierte Berliner Nacht-/Datumsschluessel */
  naechte: number
  tage: number
  minuten: number[]
  minutenMittelwert: number | null
  nachtwerte: number[]
  nachtwertMittelwert: number | null
}

export type WochenPersonStat = {
  person: WochenPerson
  /** null bedeutet: mindestens eine Trackerquelle ist unlesbar. */
  tagespunkte: number | null
  tageMitPunkt: number | null
  tageMitAktivitaet: number | null
  kategorien: Record<WochenBereich, WochenKategorie | null>
  gewicht: WochenGewicht | null
  schlaf: WochenSchlaf | null
}

export type WochenVergleich = {
  tagespunkte: number | null
  differenz: number | null
  fuehrend: WochenPerson | 'gleichstand' | null
  schlafMinutenMittelwert: number | null
}

export type Wochenlage = {
  wochenbeginn: string
  naechsterMontag: string
  jetzt: string
  datenstand: string
  /** Der Sonntag ist bis zum naechsten Montag kein abgeschlossener Rueckblick. */
  status: 'stand' | 'abgeschlossen' | 'zukuenftig'
  teilwoche: boolean
  tageImBericht: number
  quellen: {
    einheiten: WochenQuelleStatus
    aufenthalte: WochenQuelleStatus
    gewicht: WochenQuelleStatus
    schlaf: WochenQuelleStatus
  }
  personen: Record<WochenPerson, WochenPersonStat>
  vergleich: WochenVergleich
  text: string
}

type Rohzeile = Record<string, unknown>

const istBereich = (wert: unknown): wert is WochenBereich =>
  typeof wert === 'string' && (WOCHEN_BEREICHE as readonly string[]).includes(wert)

const istPerson = (wert: unknown): wert is WochenPerson =>
  wert === 'erijon' || wert === 'koray'

function datumGueltig(tag: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(tag)) return false
  const datum = new Date(`${tag}T12:00:00Z`)
  return Number.isFinite(datum.getTime()) && datum.toISOString().slice(0, 10) === tag
}

function verschiebeTag(tag: string, tage: number): string {
  const datum = new Date(`${tag}T12:00:00Z`)
  datum.setUTCDate(datum.getUTCDate() + tage)
  return datum.toISOString().slice(0, 10)
}

/** Montag der ISO-Woche, ohne die Uhrzeit des Aufrufers zu verwenden. */
export function montagVonWochenbeginn(tag: string): string {
  if (!datumGueltig(tag)) throw new RangeError('wochenbeginn ist kein gueltiges datum')
  const datum = new Date(`${tag}T12:00:00Z`)
  const versatz = (datum.getUTCDay() + 6) % 7
  datum.setUTCDate(datum.getUTCDate() - versatz)
  return datum.toISOString().slice(0, 10)
}

export function istWochenMontag(tag: string): boolean {
  return datumGueltig(tag) && montagVonWochenbeginn(tag) === tag
}

function zahl(raw: unknown): number | null {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null
  if (typeof raw !== 'string' || raw.trim() === '') return null
  const wert = Number(raw)
  return Number.isFinite(wert) ? wert : null
}

function text(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const wert = raw.trim()
  return wert === '' ? null : wert
}

function personAusZeile(
  zeile: Rohzeile,
  personen: Map<string, Person>
): WochenPerson | null {
  const person = personen.get(String(zeile.user_id))
  return istPerson(person) ? person : null
}

function berlinTag(raw: unknown): string | null {
  const wert = text(raw)
  if (!wert) return null
  const zeit = new Date(wert)
  if (!Number.isFinite(zeit.getTime())) return null
  const tag = lokaleMinute(zeit, WOCHEN_ZONE).tag
  return datumGueltig(tag) ? tag : null
}

function innerhalbBericht(
  tag: string | null,
  wochenbeginn: string,
  naechsterMontag: string,
  letzterBerichtstag: string
): tag is string {
  return Boolean(
    tag &&
      datumGueltig(tag) &&
      tag >= wochenbeginn &&
      tag < naechsterMontag &&
      tag <= letzterBerichtstag
  )
}

function istZukuenftigeZeit(raw: unknown, jetztMs: number): boolean {
  if (typeof raw !== 'string' || raw.trim() === '') return false
  const zeit = new Date(raw)
  return Number.isFinite(zeit.getTime()) && zeit.getTime() > jetztMs
}

function leereKategorie(): WochenKategorie {
  return {
    echteDatensaetze: 0,
    tagespunkte: 0,
    tage: 0,
    gemesseneDatensaetze: 0,
    gemesseneMinuten: 0,
    manuelleDatensaetze: 0,
    manuelleWerte: 0,
    manuelleWertSumme: 0,
  }
}

function leeresGewicht(): WochenGewicht {
  return {
    echteDatensaetze: 0,
    tagespunkte: 0,
    tage: 0,
    werte: [],
    mittelwert: null,
    letzterTag: null,
    letzterWert: null,
  }
}

function leeresSchlaf(): WochenSchlaf {
  return {
    echteDatensaetze: 0,
    naechte: 0,
    tage: 0,
    minuten: [],
    minutenMittelwert: null,
    nachtwerte: [],
    nachtwertMittelwert: null,
  }
}

function mittelwert(werte: number[]): number | null {
  return werte.length === 0 ? null : werte.reduce((summe, wert) => summe + wert, 0) / werte.length
}

function fertigKategorie(kategorie: WochenKategorie, punktTage: Set<string>): WochenKategorie {
  return {
    ...kategorie,
    tagespunkte: punktTage.size,
    tage: new Set([...punktTage].map((wert) => wert.slice(wert.indexOf('\u0000') + 1))).size,
    manuelleWertSumme:
      kategorie.manuelleWerte === kategorie.manuelleDatensaetze
        ? kategorie.manuelleWertSumme
        : kategorie.manuelleWerte > 0
          ? kategorie.manuelleWertSumme
          : null,
  }
}

function formatZahl(wert: number | null, nachkommastellen = 0): string {
  if (wert === null || !Number.isFinite(wert)) return 'unbekannt'
  // komma, nicht punkt: der bericht ist deutsch, und ENI schreibt ab, was dasteht
  return nachkommastellen > 0
    ? wert.toFixed(nachkommastellen).replace('.', ',')
    : String(Math.round(wert))
}

function formatDatum(tag: string): string {
  return `${tag.slice(8, 10)}.${tag.slice(5, 7)}.${tag.slice(0, 4)}`
}

function formatStunden(minuten: number | null): string {
  return minuten === null ? 'unbekannt' : `${(minuten / 60).toFixed(1)} h`
}

async function leseQuelle(
  db: WochenDatenbank,
  tabelle: string,
  spalten: string,
  datumsspalte: string,
  ab: string
): Promise<{ daten: Rohzeile[]; status: WochenQuelleStatus }> {
  try {
    const abfrage = db
      .from(tabelle)
      .select(spalten, { count: 'exact' })
      .gte(datumsspalte, ab)
      .limit(MAX_WOCHENZEILEN)
    const ergebnis = await abfrage
    if (ergebnis.error) {
      return {
        daten: [],
        status: {
          status: 'unbekannt',
          geleseneZeilen: null,
          grund: ergebnis.error.message ?? ergebnis.error.code ?? 'abfrage fehlgeschlagen',
        },
      }
    }
    const daten = (ergebnis.data ?? []) as Rohzeile[]
    const exakt = ergebnis.count
    const abgeschnitten =
      (typeof exakt === 'number' && exakt > MAX_WOCHENZEILEN) ||
      (exakt === undefined && daten.length >= MAX_WOCHENZEILEN)
    return {
      daten,
      status: {
        status: abgeschnitten ? 'unbekannt' : 'ok',
        geleseneZeilen: daten.length,
        ...(abgeschnitten ? { grund: 'zu viele Zeilen; Wochenstand waere unvollstaendig' } : {}),
      },
    }
  } catch (ursache) {
    return {
      daten: [],
      status: {
        status: 'unbekannt',
        geleseneZeilen: null,
        grund: ursache instanceof Error ? ursache.message : 'abfrage fehlgeschlagen',
      },
    }
  }
}

function neuePersonStat(person: WochenPerson): WochenPersonStat {
  return {
    person,
    tagespunkte: 0,
    tageMitPunkt: 0,
    tageMitAktivitaet: 0,
    kategorien: {
      lernen: leereKategorie(),
      gym: leereKategorie(),
      boxen: leereKategorie(),
      lesen: leereKategorie(),
    },
    gewicht: leeresGewicht(),
    schlaf: leeresSchlaf(),
  }
}

function renderWochenlage(lage: Omit<Wochenlage, 'text'>): string {
  const zeilen: string[] = [
    `WOCHENLAGE. Zeitraum ${formatDatum(lage.wochenbeginn)} bis ${formatDatum(lage.naechsterMontag)} (Europe/Berlin; Montag einschliesslich, naechster Montag ausschliesslich).`,
    `Datenstand: ${lage.datenstand}. Status: ${lage.status === 'stand' ? 'Die Woche laeuft noch; dies ist ein Stand.' : lage.status === 'abgeschlossen' ? 'Die Woche ist abgeschlossen.' : 'Die Woche liegt in der Zukunft.'}`,
    `Berichtstage: ${lage.tageImBericht}/7. Zahlen ohne Daten werden als unbekannt behandelt; fehlender Schlaf ist nicht null.`,
    '',
    'Trackerdaten:',
  ]

  for (const person of WOCHEN_PERSONEN) {
    const stat = lage.personen[person]
    const punkt = formatZahl(stat.tagespunkte)
    const punktTage = formatZahl(stat.tageMitPunkt)
    const aktivTage = formatZahl(stat.tageMitAktivitaet)
    zeilen.push(`${person}: ${punkt} Tagespunkte von 35; Punkt-Tage ${punktTage}/7; Aktivitaetstage ${aktivTage}/7.`)

    for (const bereich of WOCHEN_BEREICHE) {
      const kategorie = stat.kategorien[bereich]
      if (!kategorie) {
        zeilen.push(`  ${bereich}: unbekannt (Quelle nicht lesbar).`)
        continue
      }
      const wert =
        kategorie.manuelleWertSumme === null
          ? 'Wertsumme unbekannt'
          : `Wertsumme ${formatZahl(kategorie.manuelleWertSumme)}`
      zeilen.push(
        `  ${bereich}: ${kategorie.echteDatensaetze} echte Datensaetze, ${formatZahl(kategorie.tagespunkte)} Tagespunkte an ${kategorie.tage} Tagen; ${kategorie.manuelleDatensaetze} manuell (${wert}), ${kategorie.gemesseneDatensaetze} abgeschlossene Messungen mit ${kategorie.gemesseneMinuten} Minuten.`
      )
    }

    const gewicht = stat.gewicht
    if (!gewicht) {
      zeilen.push('  Gewicht: unbekannt (Quelle nicht lesbar).')
    } else {
      zeilen.push(
        `  Gewicht: ${gewicht.echteDatensaetze} echte Messungen, ${gewicht.tagespunkte} Tagespunkte; Mittelwert ${formatZahl(gewicht.mittelwert, 1)} kg${gewicht.letzterTag && gewicht.letzterWert !== null ? `, zuletzt ${formatDatum(gewicht.letzterTag)} ${formatZahl(gewicht.letzterWert, 1)} kg` : ''}.`
      )
    }

    const schlaf = stat.schlaf
    if (!schlaf) {
      zeilen.push('  Schlaf: unbekannt (Quelle nicht lesbar).')
    } else {
      zeilen.push(
        `  Schlaf: ${schlaf.echteDatensaetze} echte Datensaetze, ${schlaf.naechte} Naechte an ${schlaf.tage} Tagen; Schlafdauer im Mittel ${formatStunden(schlaf.minutenMittelwert)}, Nachtwert im Mittel ${formatZahl(schlaf.nachtwertMittelwert, 1)}.`
      )
    }
  }

  zeilen.push('', 'Vergleich:')
  if (lage.vergleich.tagespunkte === null || lage.vergleich.differenz === null) {
    zeilen.push('Tagespunkte: unbekannt, weil mindestens eine Trackerquelle nicht lesbar ist.')
  } else {
    const fuehrung = lage.vergleich.fuehrend === 'gleichstand' ? 'Gleichstand' : `${lage.vergleich.fuehrend}`
    zeilen.push(`Tagespunkte Erijon : Koray = ${lage.personen.erijon.tagespunkte} : ${lage.personen.koray.tagespunkte}; ${fuehrung}, Differenz ${lage.vergleich.differenz}.`)
  }
  zeilen.push(
    `Schlafdauer-Mittelwerte vergleichbar: ${lage.vergleich.schlafMinutenMittelwert === null ? 'unbekannt' : formatStunden(lage.vergleich.schlafMinutenMittelwert)}.`,
    '',
    'Diese Zahlen sind Rohdaten fuer ENI. Keine Leistung, Ursache, Krankheit oder Absicht erfinden.',
  )
  return zeilen.join('\n')
}

/**
 * Ermittelt den Bericht als typed data. `wochenbeginn` ist immer der konkrete
 * angefragte Montag; der aktuelle Tag beeinflusst nur den Datenstand eines
 * noch laufenden Sonntags.
 */
export async function ermittleWochenlage(
  db: WochenDatenbank,
  personen: Map<string, Person>,
  wochenbeginn: string,
  jetzt: Date = new Date()
): Promise<Wochenlage> {
  if (!istWochenMontag(wochenbeginn)) throw new RangeError('wochenbeginn muss ein Montag sein')
  const jetztMs = jetzt.getTime()
  if (!Number.isFinite(jetztMs)) throw new RangeError('jetzt ist kein gueltiges datum')

  const naechsterMontag = verschiebeTag(wochenbeginn, 7)
  const lokalJetzt = lokaleMinute(jetzt, WOCHEN_ZONE)
  const letzterBerichtstag = lokalJetzt.tag < naechsterMontag ? lokalJetzt.tag : verschiebeTag(naechsterMontag, -1)
  const tageImBericht = letzterBerichtstag < wochenbeginn
    ? 0
    : Math.min(7, Math.max(0, Math.round((Date.parse(`${letzterBerichtstag}T12:00:00Z`) - Date.parse(`${wochenbeginn}T12:00:00Z`)) / 86_400_000) + 1))
  const zukunft = wochenbeginn > lokalJetzt.tag
  const teilwoche = !zukunft && lokalJetzt.tag < naechsterMontag
  const status: Wochenlage['status'] = zukunft ? 'zukuenftig' : teilwoche ? 'stand' : 'abgeschlossen'

  const [einheiten, aufenthalte, gewicht, schlaf] = await Promise.all([
    leseQuelle(db, 'einheiten', 'id,user_id,bereich,tag,wert,erfasst,erstellt', 'tag', wochenbeginn),
    // Ein Berliner Montag beginnt im Sommer am Sonntag 22:00Z, im Winter
    // 23:00Z. Ein Tag Puffer deckt beide Wechsel ab; die fachliche Grenze
    // wird anschliessend anhand des Berliner Starttags exakt gesetzt.
    leseQuelle(db, 'aufenthalte', 'id,user_id,bereich,ort,ankunft,abgang', 'ankunft', `${verschiebeTag(wochenbeginn, -1)}T00:00:00Z`),
    leseQuelle(db, 'gewicht', 'user_id,tag,kg,erstellt', 'tag', wochenbeginn),
    leseQuelle(db, 'schlafnaechte_ansicht', 'user_id,nacht,schlaf_minuten,nachtwert', 'nacht', wochenbeginn),
  ])

  const quellen = {
    einheiten: einheiten.status,
    aufenthalte: aufenthalte.status,
    gewicht: gewicht.status,
    schlaf: schlaf.status,
  }
  const erijon = neuePersonStat('erijon')
  const koray = neuePersonStat('koray')
  const stats: Record<WochenPerson, WochenPersonStat> = { erijon, koray }
  const punktSchluessel = new Map<WochenPerson, Set<string>>([
    ['erijon', new Set<string>()],
    ['koray', new Set<string>()],
  ])
  const aktivitaetsTage = new Map<WochenPerson, Set<string>>([
    ['erijon', new Set<string>()],
    ['koray', new Set<string>()],
  ])

  const addPunkt = (person: WochenPerson, bereich: string, tag: string, aktivitaet = true) => {
    const schluessel = `${person}\u0000${bereich}\u0000${tag}`
    punktSchluessel.get(person)!.add(schluessel)
    if (aktivitaet) aktivitaetsTage.get(person)!.add(tag)
  }

  if (einheiten.status.status === 'ok') {
    for (const zeile of einheiten.daten) {
      const person = personAusZeile(zeile, personen)
      const bereich = zeile.bereich
      const tag = text(zeile.tag)
      if (!person || !istBereich(bereich) || !tag || !innerhalbBericht(tag, wochenbeginn, naechsterMontag, letzterBerichtstag)) continue
      // Eine nachtraeglich geplante Einheit mit expliziter Zeit darf nicht in
      // einen Bericht rutschen, bevor sie stattgefunden hat.
      if (istZukuenftigeZeit(zeile.erfasst, jetztMs) || istZukuenftigeZeit(zeile.von, jetztMs)) continue
      const kategorie = stats[person].kategorien[bereich]
      if (!kategorie) continue
      kategorie.echteDatensaetze += 1
      kategorie.manuelleDatensaetze += 1
      const wert = zahl(zeile.wert)
      if (wert !== null && wert >= 0) {
        kategorie.manuelleWerte += 1
        kategorie.manuelleWertSumme = (kategorie.manuelleWertSumme ?? 0) + wert
      }
      addPunkt(person, bereich, tag)
    }
  }

  if (aufenthalte.status.status === 'ok') {
    for (const zeile of aufenthalte.daten) {
      const person = personAusZeile(zeile, personen)
      const bereich = zeile.bereich
      if (!person || !istBereich(bereich)) continue
      const ankunftText = text(zeile.ankunft)
      const abgangText = text(zeile.abgang)
      if (!ankunftText || !abgangText) continue
      const ankunft = new Date(ankunftText)
      const abgang = new Date(abgangText)
      if (!Number.isFinite(ankunft.getTime()) || !Number.isFinite(abgang.getTime())) continue
      if (ankunft.getTime() > jetztMs || abgang.getTime() > jetztMs || abgang.getTime() <= ankunft.getTime()) continue
      const minuten = (abgang.getTime() - ankunft.getTime()) / 60_000
      const mindest = bereich === 'lesen' ? 10 : 20
      if (!Number.isFinite(minuten) || minuten < mindest || minuten > MAX_AUFENTHALT_MINUTEN) continue
      const tag = berlinTag(ankunftText)
      if (!innerhalbBericht(tag, wochenbeginn, naechsterMontag, letzterBerichtstag)) continue
      const kategorie = stats[person].kategorien[bereich]
      if (!kategorie) continue
      kategorie.echteDatensaetze += 1
      kategorie.gemesseneDatensaetze += 1
      kategorie.gemesseneMinuten += Math.round(minuten)
      addPunkt(person, bereich, tag)
    }
  }

  const gewichtTage = new Map<WochenPerson, Set<string>>([
    ['erijon', new Set<string>()],
    ['koray', new Set<string>()],
  ])
  const gewichtLetzte = new Map<WochenPerson, { tag: string; wert: number }>()
  if (gewicht.status.status === 'ok') {
    for (const zeile of gewicht.daten) {
      const person = personAusZeile(zeile, personen)
      const tag = text(zeile.tag)
      const kg = zahl(zeile.kg)
      if (!person || !tag || !innerhalbBericht(tag, wochenbeginn, naechsterMontag, letzterBerichtstag) || kg === null || kg <= 0 || kg > 500) continue
      const stat = stats[person].gewicht!
      stat.echteDatensaetze += 1
      stat.werte.push(kg)
      gewichtTage.get(person)!.add(tag)
      const bisher = gewichtLetzte.get(person)
      if (!bisher || tag >= bisher.tag) gewichtLetzte.set(person, { tag, wert: kg })
      addPunkt(person, 'gewicht', tag, false)
    }
  }

  for (const person of WOCHEN_PERSONEN) {
    const gewicht = stats[person].gewicht!
    gewicht.tagespunkte = gewichtTage.get(person)!.size
    gewicht.tage = gewichtTage.get(person)!.size
    gewicht.mittelwert = mittelwert(gewicht.werte)
    const letzte = gewichtLetzte.get(person)
    gewicht.letzterTag = letzte?.tag ?? null
    gewicht.letzterWert = letzte?.wert ?? null
  }

  const schlafNacht = new Map<WochenPerson, Map<string, { minuten: number | null; nachtwert: number | null }>>([
    ['erijon', new Map()],
    ['koray', new Map()],
  ])
  if (schlaf.status.status === 'ok') {
    for (const zeile of schlaf.daten) {
      const person = personAusZeile(zeile, personen)
      const nacht = text(zeile.nacht)
      if (!person || !nacht || !innerhalbBericht(nacht, wochenbeginn, naechsterMontag, letzterBerichtstag)) continue
      const minutenRaw = zahl(zeile.schlaf_minuten)
      const nachtwertRaw = zahl(zeile.nachtwert)
      const minuten = minutenRaw !== null && minutenRaw > 0 && minutenRaw <= 24 * 60 ? minutenRaw : null
      const nachtwert = nachtwertRaw !== null && nachtwertRaw >= 0 && nachtwertRaw <= 100 ? nachtwertRaw : null
      if (minuten === null && nachtwert === null) continue
      const stat = stats[person].schlaf!
      stat.echteDatensaetze += 1
      const nachtMap = schlafNacht.get(person)!
      const vorhanden = nachtMap.get(nacht)
      nachtMap.set(nacht, {
        minuten: minuten ?? vorhanden?.minuten ?? null,
        nachtwert: nachtwert ?? vorhanden?.nachtwert ?? null,
      })
    }
  }
  for (const person of WOCHEN_PERSONEN) {
    const stat = stats[person].schlaf!
    const naechte = [...schlafNacht.get(person)!.values()]
    stat.naechte = naechte.length
    stat.tage = naechte.length
    stat.minuten = naechte.flatMap((nacht) => nacht.minuten === null ? [] : [nacht.minuten])
    stat.nachtwerte = naechte.flatMap((nacht) => nacht.nachtwert === null ? [] : [nacht.nachtwert])
    stat.minutenMittelwert = mittelwert(stat.minuten)
    stat.nachtwertMittelwert = mittelwert(stat.nachtwerte)
  }

  for (const person of WOCHEN_PERSONEN) {
    const stat = stats[person]
    for (const bereich of WOCHEN_BEREICHE) {
      const tage = new Set(
        [...punktSchluessel.get(person)!]
          .filter((schluessel) => schluessel.split('\u0000')[1] === bereich)
          .map((schluessel) => schluessel.split('\u0000')[2]!),
      )
      stat.kategorien[bereich] = fertigKategorie(stat.kategorien[bereich]!, new Set([...tage].map((tag) => `${person}\u0000${tag}`)))
    }
    const punktTage = new Set(
      [...punktSchluessel.get(person)!].map((schluessel) => schluessel.split('\u0000')[2]!),
    )
    const trackerQuelleUnbekannt =
      quellen.einheiten.status === 'unbekannt' ||
      quellen.aufenthalte.status === 'unbekannt' ||
      quellen.gewicht.status === 'unbekannt'
    stat.tagespunkte = trackerQuelleUnbekannt
      ? null
      : punktSchluessel.get(person)!.size
    stat.tageMitPunkt = trackerQuelleUnbekannt ? null : punktTage.size
    stat.tageMitAktivitaet =
      quellen.einheiten.status === 'ok' && quellen.aufenthalte.status === 'ok'
        ? aktivitaetsTage.get(person)!.size
        : null
    if (quellen.einheiten.status === 'unbekannt') {
      for (const bereich of WOCHEN_BEREICHE) {
        if (stat.kategorien[bereich]) {
          stat.kategorien[bereich] = {
            ...stat.kategorien[bereich]!,
            tagespunkte: null,
            manuelleDatensaetze: 0,
            manuelleWerte: 0,
            manuelleWertSumme: null,
          }
        }
      }
    }
    if (quellen.aufenthalte.status === 'unbekannt') {
      for (const bereich of WOCHEN_BEREICHE) {
        if (stat.kategorien[bereich]) {
          stat.kategorien[bereich] = {
            ...stat.kategorien[bereich]!,
            tagespunkte: null,
            gemesseneDatensaetze: 0,
            gemesseneMinuten: 0,
          }
        }
      }
    }
    if (quellen.gewicht.status === 'unbekannt') stat.gewicht = null
    if (quellen.schlaf.status === 'unbekannt') stat.schlaf = null
  }

  const punkteE = stats.erijon.tagespunkte
  const punkteK = stats.koray.tagespunkte
  const differenz = punkteE === null || punkteK === null ? null : punkteE - punkteK
  const fuehrend = differenz === null ? null : differenz === 0 ? 'gleichstand' : differenz > 0 ? 'erijon' : 'koray'
  const mittelE = stats.erijon.schlaf?.minutenMittelwert ?? null
  const mittelK = stats.koray.schlaf?.minutenMittelwert ?? null
  const schlafVergleich = mittelE === null || mittelK === null ? null : mittelE - mittelK
  const ohneText: Omit<Wochenlage, 'text'> = {
    wochenbeginn,
    naechsterMontag,
    jetzt: jetzt.toISOString(),
    datenstand: `${formatDatum(lokalJetzt.tag)} ${lokalJetzt.minute} Uhr Europe/Berlin`,
    status,
    teilwoche,
    tageImBericht,
    quellen,
    personen: stats,
    vergleich: {
      tagespunkte: differenz === null ? null : punkteE! + punkteK!,
      differenz,
      fuehrend,
      schlafMinutenMittelwert: schlafVergleich,
    },
  }
  return { ...ohneText, text: renderWochenlage(ohneText) }
}

/** Baut den serverseitigen Wochen-Datenblock fuer den ENI-Systemprompt. */
export async function baueWochenlage(
  db: WochenDatenbank,
  personen: Map<string, Person>,
  wochenbeginn: string,
  jetzt: Date = new Date()
): Promise<string> {
  return (await ermittleWochenlage(db, personen, wochenbeginn, jetzt)).text
}
