import { useSyncExternalStore } from 'react'

/**
 * Die adressen der app. ENI ist eine eigene oberfläche, kein tab; sie hängt an
 * einer eigenen adresse, damit sie eine zurück-taste hat und nicht mitten in
 * der anzeigetafel liegt. der wochenbericht hat aus demselben grund eine —
 * eine push-meldung muss ihn direkt aufschlagen können.
 *
 * bewusst der hash und kein pfad: die app liegt auf GitHub Pages unter
 * `/vierfelder/`, und ein echter pfad `/eni` bräuchte dort eine umschreibung
 * auf dem server. den hash versteht jeder statische host, auch die
 * homescreen-pwa mit ihrem eigenen scope.
 */
export const ENI_HASH = '#/eni'
export const BERICHT_HASH = '#/bericht'
const ENI_WOCHE_PARAM = 'woche'
const DATUM_MUSTER = /^\d{4}-\d{2}-\d{2}$/

export type Route = 'zweikampf' | 'eni'

/** ob wir selbst hierher navigiert sind. entscheidet, wohin zurück führt. */
let selbstGeoeffnet = false

function lies(): Route {
  if (typeof window === 'undefined') return 'zweikampf'
  return istEniHash(window.location.hash) ? 'eni' : 'zweikampf'
}

function istEniHash(hash: string): boolean {
  return hash === ENI_HASH || hash.startsWith(`${ENI_HASH}?`)
}

/** Ein Wochenmontag wird ohne lokale Zeitzone geprueft, damit es auf jedem
 * Geraet dieselbe Adresse ist und Fantasiedaten wie der 31.02. nicht gelten. */
export function istEniWochenbeginn(wert: unknown): wert is string {
  if (typeof wert !== 'string' || !DATUM_MUSTER.test(wert)) return false
  const datum = new Date(`${wert}T00:00:00.000Z`)
  return !Number.isNaN(datum.getTime())
    && datum.toISOString().slice(0, 10) === wert
    && datum.getUTCDay() === 1
}

function liesEniWochenbeginn(): string | null {
  if (typeof window === 'undefined' || !istEniHash(window.location.hash)) return null
  const query = window.location.hash.slice(ENI_HASH.length)
  const wert = new URLSearchParams(query).get(ENI_WOCHE_PARAM)
  return istEniWochenbeginn(wert) ? wert : null
}

function abonniere(melde: () => void) {
  window.addEventListener('hashchange', melde)
  return () => window.removeEventListener('hashchange', melde)
}

export function useRoute(): Route {
  return useSyncExternalStore(abonniere, lies, () => 'zweikampf')
}

/** Der optionale Wochenkontext lebt auf demselben Hash wie ENI. */
export function useEniWochenbeginn(): string | null {
  return useSyncExternalStore(abonniere, liesEniWochenbeginn, () => null)
}

function istBerichtHash(hash: string): boolean {
  return hash === BERICHT_HASH || hash.startsWith(`${BERICHT_HASH}?`)
}

function liesBerichtWoche(): string | null {
  if (typeof window === 'undefined' || !istBerichtHash(window.location.hash)) return null
  const query = window.location.hash.slice(BERICHT_HASH.length)
  const wert = new URLSearchParams(query).get(ENI_WOCHE_PARAM)
  return istEniWochenbeginn(wert) ? wert : null
}

/**
 * Der montag, dessen bericht die adresse gerade aufschlägt.
 *
 * Das blatt bleibt ein überlagerndes blatt über der anzeigetafel — die route
 * sagt nur, welche woche offen ist. so öffnet eine push-meldung genau den
 * bericht, von dem sie spricht, ohne dass die app eine zweite ansicht braucht.
 */
export function useBerichtWoche(): string | null {
  return useSyncExternalStore(abonniere, liesBerichtWoche, () => null)
}

/**
 * Die bericht-adresse ist ein einmaliger einstieg, kein dauerzustand.
 *
 * Sobald die app das blatt geöffnet hat, wird der hash ersetzt: danach kann
 * man wochen blättern und das blatt schließen, ohne dass in der adresse eine
 * woche steht, die längst nicht mehr die gezeigte ist.
 */
export function verlasseBericht(): void {
  if (typeof window === 'undefined' || !istBerichtHash(window.location.hash)) return
  window.history.replaceState(null, '', window.location.pathname + window.location.search)
  window.dispatchEvent(new HashChangeEvent('hashchange'))
}

export function oeffneEni() {
  selbstGeoeffnet = true
  window.location.hash = ENI_HASH
}

/** Oeffnet ENI fuer einen serverseitig bestaetigten Wochenmontag. */
export function oeffneEniWoche(wochenbeginn: string): void {
  if (!istEniWochenbeginn(wochenbeginn)) return
  selbstGeoeffnet = true
  window.location.hash = `${ENI_HASH}?${ENI_WOCHE_PARAM}=${encodeURIComponent(wochenbeginn)}`
}

/**
 * zurück in die anzeigetafel. sind wir von dort gekommen, geht es einen schritt
 * im verlauf zurück — dann bleibt die zurück-taste des telefons stimmig. wurde
 * ENI direkt geöffnet (lesezeichen, homescreen), gibt es nichts, wohin man
 * zurückgehen könnte, und die adresse wird ersetzt statt gestapelt.
 */
export function schliesseEni() {
  if (selbstGeoeffnet) {
    selbstGeoeffnet = false
    window.history.back()
    return
  }
  window.history.replaceState(null, '', window.location.pathname + window.location.search)
  window.dispatchEvent(new HashChangeEvent('hashchange'))
}

/** nur für tests */
export function routeZuruecksetzen() {
  selbstGeoeffnet = false
}
