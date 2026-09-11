import { useSyncExternalStore } from 'react'

/**
 * ENI ist eine eigene oberfläche, kein tab. sie hängt an einer eigenen adresse,
 * damit sie eine zurück-taste hat und nicht mitten in der anzeigetafel liegt.
 *
 * bewusst der hash und kein pfad: die app liegt auf GitHub Pages unter
 * `/vierfelder/`, und ein echter pfad `/eni` bräuchte dort eine umschreibung
 * auf dem server. den hash versteht jeder statische host, auch die
 * homescreen-pwa mit ihrem eigenen scope.
 */
export const ENI_HASH = '#/eni'

export type Route = 'zweikampf' | 'eni'

/** ob wir selbst hierher navigiert sind. entscheidet, wohin zurück führt. */
let selbstGeoeffnet = false

function lies(): Route {
  if (typeof window === 'undefined') return 'zweikampf'
  return window.location.hash.startsWith(ENI_HASH) ? 'eni' : 'zweikampf'
}

function abonniere(melde: () => void) {
  window.addEventListener('hashchange', melde)
  return () => window.removeEventListener('hashchange', melde)
}

export function useRoute(): Route {
  return useSyncExternalStore(abonniere, lies, () => 'zweikampf')
}

export function oeffneEni() {
  selbstGeoeffnet = true
  window.location.hash = ENI_HASH
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
