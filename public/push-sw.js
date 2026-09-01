/**
 * Der Empfaenger. Wird vom erzeugten Service Worker per `importScripts`
 * geladen (siehe `vite.config.ts`).
 *
 * Warum eine eigene Datei und kein Eintrag in einer Quelle unter `src/`:
 * `vite-plugin-pwa` erzeugt den Service Worker vollstaendig selbst. Eigener
 * Code kaeme dort nur hinein, wenn man auf `injectManifest` umstellt — dann
 * gehoerte auch das Vorabspeichern aller Dateien uns, samt eigenem Build und
 * eigener tsconfig. Fuer zwei Ereignisbehandler ist das der falsche Tausch.
 *
 * Was hier passiert, ist bewusst wenig. Der Text der Nachricht steht fertig im
 * Paket; dieser Worker entscheidet nichts, er zeigt an. Alle Regeln — wer wann
 * woran erinnert wird — stehen auf dem Server, wo man sie aendern kann, ohne
 * dass jemand die App neu installiert.
 *
 * Aufbau eines Pakets:
 *   { "titel": "zweikampf", "text": "heute noch nicht gewogen.",
 *     "tag": "gewicht", "url": "/" }
 *
 * `tag` ersetzt eine gleichnamige aeltere Mitteilung, statt eine zweite
 * danebenzulegen: zweimal dieselbe Erinnerung ist eine Erinnerung.
 */

self.addEventListener('push', (ereignis) => {
  let paket = {}
  try {
    paket = ereignis.data ? ereignis.data.json() : {}
  } catch {
    // kein json — dann ist der rohtext die nachricht.
    paket = { text: ereignis.data ? ereignis.data.text() : '' }
  }

  const titel = paket.titel || 'zweikampf'
  const optionen = {
    body: paket.text || '',
    tag: paket.tag || 'zweikampf',
    icon: 'pwa-192x192.png',
    badge: 'pwa-192x192.png',
    data: { url: paket.url || './' },
  }

  // ohne waitUntil beendet der browser den worker, bevor die mitteilung steht.
  ereignis.waitUntil(self.registration.showNotification(titel, optionen))
})

self.addEventListener('notificationclick', (ereignis) => {
  ereignis.notification.close()

  const ziel = new URL(
    (ereignis.notification.data && ereignis.notification.data.url) || './',
    self.registration.scope
  ).href

  ereignis.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((fenster) => {
      // ein offenes fenster der app wird geholt, nicht ein zweites geoeffnet.
      for (const f of fenster) {
        if (f.url.startsWith(self.registration.scope) && 'focus' in f) {
          if (f.url !== ziel && 'navigate' in f) return f.navigate(ziel).then((g) => g && g.focus())
          return f.focus()
        }
      }
      return self.clients.openWindow(ziel)
    })
  )
})
