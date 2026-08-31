import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import { App } from './App'

/** einmal pro stunde nach einer neuen version sehen */
const NACHSEHEN = 60 * 60 * 1000

/**
 * Ohne diese Zeile laedt die App eine neue Version erst beim uebernaechsten
 * Start: der Service Worker holt sie im Hintergrund, waehrend im Fenster noch
 * die alte laeuft. Auf dem Handy, wo die App wochenlang im Hintergrund haengt,
 * hiess das: gebaut, veroeffentlicht — und trotzdem der alte Stand.
 *
 * `registerSW` laedt die Seite neu, sobald der neue Worker uebernimmt. Beim
 * ersten Einrichten passiert das nicht, nur bei einer echten Aktualisierung.
 */
registerSW({
  immediate: true,
  onRegisteredSW(_pfad, registrierung) {
    if (registrierung) setInterval(() => void registrierung.update(), NACHSEHEN)
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
