import type { Backend } from './backend'
import { ANSAGE_FEHLERTEXT, ANSAGE_STUFEN, NEUE_ANSAGE_FELDER, ansageFehlerAus } from './ansagen'
import type { AnsageFeld, AnsageStufe } from './ansagen'
import { toKey } from './dates'
import { baueEinheit } from './tracker'
import type { AreaId, UserId } from './types'

/**
 * Was ENI in der App tun darf — immer nur vorschlagen, nie selbst.
 *
 * ENI schreibt einen ```aktion-Block mit JSON in die Antwort, die Oberflaeche
 * zeigt daraus eine Karte, und erst der Tipp der Person schreibt. Der Server
 * sieht davon nichts: geschrieben wird mit genau dem Backend und denselben
 * Regeln, mit denen auch der Tracker schreibt, in beiden Datenmodi.
 *
 * Vier Dinge gehen, alle nur fuer die eigene Person:
 *
 *   einheit     eine Durchfuehrung in lernen, gym, boxen oder lesen, optional
 *               mit Minuten (Seiten beim Lesen)
 *   gewicht     das Gewicht eines Tages
 *   ansage      eine Ansage an den anderen; ob sie gilt, entscheidet der Server
 *   erinnerung  ein Eintrag in ENIs Gedaechtnis: eine Aufgabe (mit Frist
 *               meldet sich die App am Morgen per Push), vorlaeufiger
 *               Kontext, eine Vorliebe oder eine bewaehrte Methode
 *
 * Tage einer Einheit oder des Gewichts gehen nur rueckwaerts und hoechstens
 * eine Woche weit; die Frist einer Erinnerung nur vorwaerts, hoechstens ein
 * Jahr. Was hier nicht durchgeht, wird keine Karte, sondern ein ehrlicher Satz.
 */
export type ErinnerungsArt = 'aufgabe' | 'aktuell' | 'profil' | 'erfahrung'
export type ErinnerungsAktion = { typ: 'erinnerung'; art: ErinnerungsArt; text: string; bis: string | null }
export type EniAktion =
  | { typ: 'einheit'; bereich: AreaId; tag: string; wert: number | null }
  | { typ: 'gewicht'; tag: string; kg: number }
  | { typ: 'ansage'; feld: AnsageFeld; stufe: AnsageStufe }
  | ErinnerungsAktion

export type AktionsUrteil = { ok: true; aktion: EniAktion } | { ok: false; grund: string }

const BEREICHE: readonly AreaId[] = ['lernen', 'gym', 'boxen', 'lesen']

/** so viele tage zurueck darf ENI eintragen, heute eingeschlossen */
export const RUECKBLICK_TAGE = 7

/** hoechstwerte je bereich: minuten beim sport und lernen, seiten beim lesen */
const HOECHSTWERT: Record<AreaId, number> = { lernen: 600, gym: 300, boxen: 300, lesen: 1000 }

/**
 * Welcher Tag gemeint ist. ENI soll „heute“ oder „gestern“ schreiben statt ein
 * Datum zu rechnen; ein Datum geht auch. Gerechnet wird in lokaler Zeit.
 */
export function liesTag(roh: unknown, jetzt: Date = new Date()): string | null {
  const heute = toKey(jetzt)
  const vor = (tage: number) => {
    const d = new Date(jetzt)
    d.setDate(d.getDate() - tage)
    return toKey(d)
  }
  if (roh === undefined || roh === null || roh === 'heute') return heute
  if (roh === 'gestern') return vor(1)
  if (roh === 'vorgestern') return vor(2)
  if (typeof roh !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(roh)) return null
  const [j, m, t] = roh.split('-').map(Number)
  const datum = new Date(j!, m! - 1, t!)
  if (toKey(datum) !== roh) return null
  // ISO-Zeichenketten gleicher Form lassen sich lexikalisch vergleichen
  return roh <= heute && roh >= vor(RUECKBLICK_TAGE - 1) ? roh : null
}

const ERINNERUNGS_ARTEN: readonly ErinnerungsArt[] = ['aufgabe', 'aktuell', 'profil', 'erfahrung']

/** so lang darf der Text einer vorgeschlagenen Erinnerung sein; die Tabelle erlaubt tausend */
export const ERINNERUNG_MAX_ZEICHEN = 300

/** so weit darf die Frist einer Erinnerung in die Zukunft reichen */
export const FRIST_MAX_TAGE = 365

/**
 * Bis wann eine Erinnerung gilt. `null` heisst: ohne Frist. `undefined` heisst:
 * kein Datum, das ENI setzen darf (Vergangenheit, mehr als ein Jahr, Unsinn).
 */
export function liesFrist(roh: unknown, jetzt: Date = new Date()): string | null | undefined {
  if (roh === undefined || roh === null || roh === '') return null
  const nach = (tage: number) => {
    const d = new Date(jetzt)
    d.setDate(d.getDate() + tage)
    return toKey(d)
  }
  if (roh === 'heute') return nach(0)
  if (roh === 'morgen') return nach(1)
  if (typeof roh !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(roh)) return undefined
  const [j, m, t] = roh.split('-').map(Number)
  if (toKey(new Date(j!, m! - 1, t!)) !== roh) return undefined
  return roh >= nach(0) && roh <= nach(FRIST_MAX_TAGE) ? roh : undefined
}

/** den inhalt eines ```aktion-blocks pruefen */
export function pruefeAktion(quelle: string, jetzt: Date = new Date()): AktionsUrteil {
  let roh: Record<string, unknown>
  try {
    const gelesen: unknown = JSON.parse(quelle)
    if (!gelesen || typeof gelesen !== 'object' || Array.isArray(gelesen)) throw new Error()
    roh = gelesen as Record<string, unknown>
  } catch {
    return { ok: false, grund: 'den vorschlag konnte ich nicht lesen.' }
  }

  if (roh.typ === 'einheit') {
    const bereich = roh.bereich as AreaId
    if (!BEREICHE.includes(bereich)) return { ok: false, grund: 'diesen bereich gibt es nicht.' }
    const tag = liesTag(roh.tag, jetzt)
    if (!tag) return { ok: false, grund: `eintragen geht nur für heute und die ${RUECKBLICK_TAGE - 1} tage davor.` }
    let wert: number | null = null
    if (roh.wert !== undefined && roh.wert !== null) {
      if (typeof roh.wert !== 'number' || !Number.isFinite(roh.wert)) return { ok: false, grund: 'der wert ist keine zahl.' }
      wert = Math.round(roh.wert)
      if (wert < 1 || wert > HOECHSTWERT[bereich]) return { ok: false, grund: 'dieser wert ist nicht plausibel.' }
    }
    return { ok: true, aktion: { typ: 'einheit', bereich, tag, wert } }
  }

  if (roh.typ === 'gewicht') {
    const tag = liesTag(roh.tag, jetzt)
    if (!tag) return { ok: false, grund: `eintragen geht nur für heute und die ${RUECKBLICK_TAGE - 1} tage davor.` }
    if (typeof roh.kg !== 'number' || !Number.isFinite(roh.kg)) return { ok: false, grund: 'das gewicht ist keine zahl.' }
    const kg = Math.round(roh.kg * 10) / 10
    if (kg < 30 || kg > 250) return { ok: false, grund: 'dieses gewicht ist nicht plausibel.' }
    return { ok: true, aktion: { typ: 'gewicht', tag, kg } }
  }

  if (roh.typ === 'ansage') {
    const feld = roh.feld as AnsageFeld
    const stufe = roh.stufe as AnsageStufe
    if (!(NEUE_ANSAGE_FELDER as readonly string[]).includes(feld)) return { ok: false, grund: 'in diesem feld gibt es keine ansage.' }
    if (!(ANSAGE_STUFEN as readonly string[]).includes(stufe)) return { ok: false, grund: 'diese stufe gibt es nicht.' }
    return { ok: true, aktion: { typ: 'ansage', feld, stufe } }
  }

  if (roh.typ === 'erinnerung') {
    const art = roh.art as ErinnerungsArt
    if (!ERINNERUNGS_ARTEN.includes(art)) return { ok: false, grund: 'diese art von erinnerung gibt es nicht.' }
    const text = typeof roh.text === 'string' ? roh.text.trim().replace(/\s+/g, ' ') : ''
    if (!text) return { ok: false, grund: 'bei der erinnerung fehlt der text.' }
    if (text.length > ERINNERUNG_MAX_ZEICHEN) return { ok: false, grund: 'der text der erinnerung ist zu lang.' }
    const bis = liesFrist(roh.bis, jetzt)
    if (bis === undefined) return { ok: false, grund: 'die frist muss heute oder später in den nächsten zwölf monaten liegen.' }
    return { ok: true, aktion: { typ: 'erinnerung', art, text, bis } }
  }

  return { ok: false, grund: 'das kann ENI nicht eintragen.' }
}

function tagText(tag: string, jetzt: Date): string {
  if (tag === toKey(jetzt)) return 'heute'
  const gestern = new Date(jetzt)
  gestern.setDate(gestern.getDate() - 1)
  if (tag === toKey(gestern)) return 'gestern'
  const [, m, t] = tag.split('-')
  return `am ${Number(t)}.${Number(m)}.`
}

function fristText(bis: string, jetzt: Date): string {
  const heute = toKey(jetzt)
  const morgen = new Date(jetzt)
  morgen.setDate(morgen.getDate() + 1)
  if (bis === heute) return 'bis heute'
  if (bis === toKey(morgen)) return 'bis morgen'
  const [, m, t] = bis.split('-')
  return `bis ${Number(t)}.${Number(m)}.`
}

/** was auf der karte steht, in einem satzteil */
export function beschreibeAktion(aktion: EniAktion, jetzt: Date = new Date()): string {
  if (aktion.typ === 'einheit') {
    const einheit = aktion.bereich === 'lesen' ? 'seiten' : 'min'
    const menge = aktion.wert === null ? '' : `${aktion.wert} ${einheit} `
    return `${menge}${aktion.bereich} · ${tagText(aktion.tag, jetzt)}`
  }
  if (aktion.typ === 'gewicht') {
    return `${aktion.kg.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} kg · ${tagText(aktion.tag, jetzt)}`
  }
  if (aktion.typ === 'erinnerung') {
    const kopf = aktion.art === 'aufgabe' ? 'aufgabe' : aktion.art === 'aktuell' ? 'merken, gerade aktuell' : 'merken'
    return [kopf, aktion.text, aktion.bis ? fristText(aktion.bis, jetzt) : ''].filter(Boolean).join(' · ')
  }
  return `ansage ${aktion.feld} · ${aktion.stufe === 'allin' ? 'all-in' : aktion.stufe}`
}

/** die beschriftung des knopfs */
export function knopfText(aktion: EniAktion): string {
  if (aktion.typ === 'erinnerung') return aktion.art === 'aufgabe' ? 'vormerken' : 'merken'
  return aktion.typ === 'ansage' ? 'ansagen' : 'eintragen'
}

/** was auf der karte steht, wenn es geschrieben ist */
export function erledigtText(aktion: EniAktion): string {
  if (aktion.typ === 'erinnerung') return aktion.art === 'aufgabe' ? 'vorgemerkt' : 'gemerkt'
  return aktion.typ === 'ansage' ? 'angesagt' : 'eingetragen'
}

/**
 * Eine feste id je Vorschlag: aus der Nachricht und der Stelle darin. Ein
 * zweiter Tipp — nach einem Neuladen, auf einem zweiten Geraet — schickt
 * dieselbe id, und dieselbe id legt nichts ein zweites Mal an (siehe
 * `Einheit.id` und `sage_an_stufe`).
 */
export async function aktionsId(nachrichtId: string, nr: number): Promise<string> {
  const bytes = new Uint8Array(
    await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`eni-aktion:${nachrichtId}:${nr}`))
  ).slice(0, 16)
  // wie eine namensbasierte uuid (version 5, variante rfc 4122)
  bytes[6] = (bytes[6]! & 0x0f) | 0x50
  bytes[8] = (bytes[8]! & 0x3f) | 0x80
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

/** fuehrt einen bestaetigten vorschlag aus. wirft mit einem satz, der auf die karte passt */
export async function fuehreAktionAus(
  aktion: Exclude<EniAktion, ErinnerungsAktion>,
  id: string,
  backend: Pick<Backend, 'schreibeEinheit' | 'schreibeGewicht' | 'sageAn'>,
  me: UserId,
  jetzt: Date = new Date(),
): Promise<void> {
  try {
    if (aktion.typ === 'einheit') {
      await backend.schreibeEinheit({ ...baueEinheit(me, aktion.bereich, aktion.tag, aktion.wert, jetzt), id })
    } else if (aktion.typ === 'gewicht') {
      await backend.schreibeGewicht(aktion.tag, aktion.kg)
    } else {
      await backend.sageAn(id, aktion.feld, aktion.stufe)
    }
  } catch (fehler) {
    const grund = ansageFehlerAus(fehler)
    throw new Error(grund ? ANSAGE_FEHLERTEXT[grund] : 'hat nicht geklappt. versuch es gleich noch einmal.')
  }
}

/**
 * Eine Erinnerung ins Gedaechtnis schreiben. Sie braucht kein Backend des
 * Trackers, nur das Konto: ohne Anmeldung gibt es kein Gedaechtnis. Die feste
 * Id sorgt dafuer, dass ein zweiter Tipp nichts doppelt anlegt.
 */
export async function fuehreErinnerungAus(
  aktion: ErinnerungsAktion,
  id: string,
  schreibe: ((id: string, aktion: ErinnerungsAktion) => Promise<void>) | undefined,
): Promise<void> {
  if (!schreibe) throw new Error('das gedächtnis gibt es nur mit anmeldung.')
  try {
    await schreibe(id, aktion)
  } catch {
    throw new Error('hat nicht geklappt. versuch es gleich noch einmal.')
  }
}
