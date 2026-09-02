import type { Backend } from './backend'
import { neueEinheitId } from './types'
import type { Abrechnung, Einheit, Note, UserId } from './types'

export const WARTESCHLANGE_KEY = 'vierfelder.warteschlange'

/** was geschrieben werden sollte, als die verbindung weg war */
export type Auftrag =
  | { typ: 'schreibeEinheit'; einheit: Einheit }
  | { typ: 'schreibeEinheitWert'; einheit: Einheit; wert: number | null }
  | { typ: 'schreibeEinheitVon'; einheit: Einheit; von: string | null }
  | { typ: 'loescheEinheit'; einheit: Einheit }
  | { typ: 'loescheTag'; einheiten: Einheit[] }
  | { typ: 'schreibeGewicht'; tag: string; kg: number }
  | { typ: 'schreibeWette'; woche: string; text: string }
  | { typ: 'schreibeAbrechnung'; abrechnung: Abrechnung }
  | { typ: 'schreibeNote'; note: Note }
  | { typ: 'loescheNote'; id: string }

/**
 * jeder eintrag traegt eine eigene id und die person, die ihn ausgeloest hat.
 * die id, damit ein abgearbeiteter eintrag punktgenau aus der frisch gelesenen
 * schlange verschwindet statt eine veraltete liste zurueckzuschreiben; die
 * person, weil `schreibeGewicht` und `schreibeWette` ohne benutzer auskommen
 * und sonst auf dem konto landen wuerden, das gerade angemeldet ist.
 */
export type WarteschlangenEintrag = Auftrag & { id: string; user: UserId }

/** prueft, ob ein fehler aus offline-zustand oder abgebrochenem netzwerk resultiert */
export function istNetzwerkFehler(e: unknown): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return true
  }
  if (!e) return false
  if (e instanceof TypeError) {
    const msg = e.message.toLowerCase()
    if (msg.includes('fetch') || msg.includes('network')) return true
  }
  const msg =
    typeof (e as { message?: unknown }).message === 'string'
      ? ((e as { message: string }).message).toLowerCase()
      : String(e).toLowerCase()
  return (
    msg.includes('networkerror') ||
    msg.includes('failed to fetch') ||
    msg.includes('load failed') ||
    msg.includes('offline') ||
    msg.includes('network request failed') ||
    msg.includes('the internet connection appears to be offline')
  )
}

export function ladeWarteschlange(): WarteschlangenEintrag[] {
  try {
    const raw = localStorage.getItem(WARTESCHLANGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    // eintraege ohne id oder person stammen aus einer aelteren fassung und
    // liessen sich weder zuordnen noch gezielt entfernen
    return parsed.filter(
      (e): e is WarteschlangenEintrag =>
        !!e && typeof e.id === 'string' && typeof e.user === 'string'
    )
  } catch {
    return []
  }
}

export function speichereWarteschlange(liste: WarteschlangenEintrag[]): void {
  try {
    if (liste.length === 0) {
      localStorage.removeItem(WARTESCHLANGE_KEY)
    } else {
      localStorage.setItem(WARTESCHLANGE_KEY, JSON.stringify(liste))
    }
  } catch {
    // localStorage voll oder blockiert
  }
}

export function einreihen(auftrag: Auftrag, user: UserId): WarteschlangenEintrag {
  const eintrag = { ...auftrag, id: neueEinheitId(), user } as WarteschlangenEintrag
  speichereWarteschlange([...ladeWarteschlange(), eintrag])
  return eintrag
}

/** nimmt genau einen eintrag aus der gerade gespeicherten schlange */
function entferne(id: string): void {
  speichereWarteschlange(ladeWarteschlange().filter((e) => e.id !== id))
}

export function leereWarteschlange(): void {
  try {
    localStorage.removeItem(WARTESCHLANGE_KEY)
  } catch {
    // ignore
  }
}

export async function fuehreEintragAus(backend: Backend, eintrag: WarteschlangenEintrag): Promise<void> {
  switch (eintrag.typ) {
    case 'schreibeEinheit':
      await backend.schreibeEinheit(eintrag.einheit)
      break
    case 'schreibeEinheitWert':
      await backend.schreibeEinheitWert(eintrag.einheit, eintrag.wert)
      break
    case 'schreibeEinheitVon':
      await backend.schreibeEinheitVon(eintrag.einheit, eintrag.von)
      break
    case 'loescheEinheit':
      await backend.loescheEinheit(eintrag.einheit)
      break
    case 'loescheTag':
      await backend.loescheTag(eintrag.einheiten)
      break
    case 'schreibeGewicht':
      await backend.schreibeGewicht(eintrag.tag, eintrag.kg)
      break
    case 'schreibeWette':
      await backend.schreibeWette(eintrag.woche, eintrag.text)
      break
    case 'schreibeAbrechnung':
      await backend.schreibeAbrechnung(eintrag.abrechnung)
      break
    case 'schreibeNote':
      await backend.schreibeNote(eintrag.note)
      break
    case 'loescheNote':
      await backend.loescheNote(eintrag.id)
      break
  }
}

/**
 * nur ein durchlauf gleichzeitig. der start beim laden und das `online`-ereignis
 * treffen sonst zusammen und schicken denselben eintrag zweimal los.
 */
let laeuft = false

/**
 * arbeitet die eintraege der angemeldeten person ab, aelteste zuerst. die
 * schlange wird vor jedem eintrag frisch gelesen: waehrend ein schreibvorgang
 * unterwegs ist, kann ein neuer tap dazukommen, und der darf nicht unter einer
 * zurueckgeschriebenen alten liste verschwinden.
 */
export async function arbeiteWarteschlangeAb(
  backend: Backend,
  user: UserId
): Promise<{ erfolg: boolean; abgearbeitet: number; verbleibend: number }> {
  if (laeuft) {
    return { erfolg: true, abgearbeitet: 0, verbleibend: ladeWarteschlange().length }
  }
  laeuft = true
  let abgearbeitet = 0
  try {
    for (;;) {
      const schlange = ladeWarteschlange()
      const naechster = schlange.find((e) => e.user === user)
      if (!naechster) return { erfolg: true, abgearbeitet, verbleibend: schlange.length }
      try {
        await fuehreEintragAus(backend, naechster)
        abgearbeitet++
      } catch (e) {
        if (istNetzwerkFehler(e)) {
          // verbindung weiterhin unterbrochen; die restliche schlange bleibt
          return { erfolg: false, abgearbeitet, verbleibend: ladeWarteschlange().length }
        }
        // fachlicher fehler (z.b. zeile existiert nicht mehr): dieser eintrag
        // geht nie durch und wuerde sonst alle folgenden blockieren
      }
      entferne(naechster.id)
    }
  } finally {
    laeuft = false
  }
}
