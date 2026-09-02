import type { Backend } from './backend'
import type { Abrechnung, Einheit, Note } from './types'

export const WARTESCHLANGE_KEY = 'vierfelder.warteschlange'

export type WarteschlangenEintrag =
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
    return Array.isArray(parsed) ? parsed : []
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

export function einreihen(eintrag: WarteschlangenEintrag): void {
  const schlange = ladeWarteschlange()
  schlange.push(eintrag)
  speichereWarteschlange(schlange)
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

export async function arbeiteWarteschlangeAb(
  backend: Backend
): Promise<{ erfolg: boolean; abgearbeitet: number; verbleibend: number }> {
  const schlange = ladeWarteschlange()
  if (schlange.length === 0) return { erfolg: true, abgearbeitet: 0, verbleibend: 0 }

  let abgearbeitet = 0
  while (schlange.length > 0) {
    const naechster = schlange[0]!
    try {
      await fuehreEintragAus(backend, naechster)
      schlange.shift()
      abgearbeitet++
      speichereWarteschlange(schlange)
    } catch (e) {
      if (istNetzwerkFehler(e)) {
        // verbindung weiterhin unterbrochen; halte die restliche schlange
        return { erfolg: false, abgearbeitet, verbleibend: schlange.length }
      }
      // fachlicher fehler (z.b. zeile existiert nicht mehr) -> verwerfe diesen eintrag
      schlange.shift()
      speichereWarteschlange(schlange)
    }
  }
  return { erfolg: true, abgearbeitet, verbleibend: 0 }
}
