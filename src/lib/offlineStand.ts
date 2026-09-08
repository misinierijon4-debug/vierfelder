import type { Anfangszustand } from './backend'

const PRAEFIX = 'zweikampf:offline-stand:'

/**
 * Ein zu grosser Stand fliegt beim Schreiben ohnehin gegen das Kontingent des
 * Browsers. Die Grenze davor macht daraus einen stillen Verzicht statt einer
 * Ausnahme mitten im Laden.
 */
const HOECHSTZEICHEN = 2_000_000

export type OfflineStand = {
  /** ISO-Zeitpunkt, zu dem dieser Stand vom Server kam */
  gespeichertAm: string
  anfang: Anfangszustand
}

function schluessel(kennung: string): string {
  return `${PRAEFIX}${kennung}`
}

/**
 * Der gemerkte Stand ist eine Bequemlichkeit, keine Quelle der Wahrheit. Jeder
 * Fehler daran — kein Speicher, volles Kontingent, beschaedigter Inhalt — darf
 * die App deshalb nur eine Ansicht kosten und niemals einen Ladevorgang.
 */
function istEbenesObjekt(wert: unknown): wert is Record<string, unknown> {
  if (!wert || typeof wert !== 'object' || Array.isArray(wert)) return false
  const prototyp = Object.getPrototypeOf(wert)
  return prototyp === Object.prototype || prototyp === null
}

function istAnfangszustand(wert: unknown): wert is Anfangszustand {
  if (!istEbenesObjekt(wert)) return false
  if (wert.me !== 'erijon' && wert.me !== 'koray') return false
  for (const feld of ['einheiten', 'gewichte', 'gewichtQuellen', 'wetten', 'wettenMeta']) {
    if (!istEbenesObjekt(wert[feld])) return false
  }
  for (const feld of ['schlaf', 'aufenthalte', 'abrechnungen']) {
    if (!Array.isArray(wert[feld])) return false
  }
  for (const feld of ['einheitVonVerfuegbar', 'altbestand']) {
    if (typeof wert[feld] !== 'boolean') return false
  }
  const noten = wert.noten
  return istEbenesObjekt(noten) && Array.isArray(noten.faecher) && Array.isArray(noten.noten)
}

/** merkt den zuletzt vom server gelesenen stand. fehler bleiben still */
export function merkeStand(kennung: string, anfang: Anfangszustand, jetzt = new Date()): void {
  let inhalt: string
  try {
    inhalt = JSON.stringify({ gespeichertAm: jetzt.toISOString(), anfang })
  } catch {
    return
  }
  if (inhalt.length > HOECHSTZEICHEN) {
    vergissStand(kennung)
    return
  }
  try {
    localStorage.setItem(schluessel(kennung), inhalt)
  } catch {
    // volles kontingent oder gesperrter speicher: der stand fehlt dann eben
    vergissStand(kennung)
  }
}

/** liest den gemerkten stand. beschaedigtes wird entfernt und als `null` gemeldet */
export function leseStand(kennung: string): OfflineStand | null {
  let roh: string | null
  try {
    roh = localStorage.getItem(schluessel(kennung))
  } catch {
    return null
  }
  if (roh === null) return null

  let gelesen: unknown
  try {
    gelesen = JSON.parse(roh)
  } catch {
    vergissStand(kennung)
    return null
  }

  if (
    !istEbenesObjekt(gelesen)
    || typeof gelesen.gespeichertAm !== 'string'
    || Number.isNaN(Date.parse(gelesen.gespeichertAm))
    || !istAnfangszustand(gelesen.anfang)
  ) {
    vergissStand(kennung)
    return null
  }

  return { gespeichertAm: gelesen.gespeichertAm, anfang: gelesen.anfang }
}

export function vergissStand(kennung: string): void {
  try {
    localStorage.removeItem(schluessel(kennung))
  } catch {
    // nichts zu retten: ein nicht loeschbarer eintrag wird beim lesen geprueft
  }
}
