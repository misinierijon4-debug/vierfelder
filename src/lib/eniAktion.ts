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
 * Drei Dinge gehen, alle nur fuer die eigene Person:
 *
 *   einheit  eine Durchfuehrung in lernen, gym, boxen oder lesen, optional mit
 *            Minuten (Seiten beim Lesen)
 *   gewicht  das Gewicht eines Tages
 *   ansage   eine Ansage an den anderen; ob sie gilt, entscheidet der Server
 *
 * Tage gehen nur rueckwaerts und hoechstens eine Woche weit. Was hier nicht
 * durchgeht, wird keine Karte, sondern ein ehrlicher Satz.
 */
export type EniAktion =
  | { typ: 'einheit'; bereich: AreaId; tag: string; wert: number | null }
  | { typ: 'gewicht'; tag: string; kg: number }
  | { typ: 'ansage'; feld: AnsageFeld; stufe: AnsageStufe }

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
  return `ansage ${aktion.feld} · ${aktion.stufe === 'allin' ? 'all-in' : aktion.stufe}`
}

/** die beschriftung des knopfs */
export function knopfText(aktion: EniAktion): string {
  return aktion.typ === 'ansage' ? 'ansagen' : 'eintragen'
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
  aktion: EniAktion,
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
