// vitest steuert die testumgebung mit, deshalb kommt defineConfig von dort:
// nur diese fassung kennt den `test`-abschnitt weiter unten.
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react-swc'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { sites } from '@openai/sites-vite-plugin'

// bei github pages liegt die app unter /reponame/, bei einer <name>.github.io-seite unter /.
// gesetzt wird das nur im deploy-workflow, lokal bleibt es '/'.
const base = process.env.VITE_BASE || '/'

export default defineConfig({
  base,
  test: {
    /**
     * Die Schlafanalyse rechnet in lokaler Zeit. Eine Nacht ueber die
     * Umstellung gibt es nur in einer Zone, die umstellt — in UTC waeren
     * genau die zwei Naechte im Jahr nicht pruefbar, in denen die Rechnung
     * frueher danebenlag. Alle uebrigen Tests bauen ihre Daten aus lokalen
     * Bestandteilen und sind von der Zone unabhaengig.
     */
    env: { TZ: 'Europe/Berlin' },
  },
  server: {
    port: 5199,
    strictPort: true,
  },
  plugins: [
    react(),
    tailwindcss(),
    sites(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon-32x32.png', 'apple-touch-icon.png'],
      workbox: {
        /**
         * Die Schriften gehoeren in den Cache, aber nicht in den Precache:
         * `@fontsource` liefert je Familie mehrere Schnitte (latin, latin-ext,
         * vietnamesisch), von denen der Browser ueber `unicode-range` nur die
         * holt, die er braucht. Vorsorglich alle sechs zu laden waeren rund
         * 270 KiB beim Einrichten, die groesstenteils nie gebraucht werden.
         *
         * Also: was einmal geholt wurde, bleibt. Damit steht die App beim
         * zweiten Start auch ohne Netz in ihrer eigenen Schrift da, statt in
         * der des Systems.
         *
         * Bewusst nur Schriften und nur aus eigener Herkunft. Alles andere —
         * die Antworten von Supabase zuallererst — laeuft weiter am Cache
         * vorbei; Gesundheitsdaten haben auf der Platte des Browsers nichts
         * verloren.
         */
        runtimeCaching: [
          {
            urlPattern: ({ request, sameOrigin }) => sameOrigin && request.destination === 'font',
            handler: 'CacheFirst',
            options: {
              cacheName: 'zweikampf-schriften',
              expiration: { maxEntries: 12, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      manifest: {
        /**
         * Ohne `id` leitet der Browser die Identitaet der App aus `start_url`
         * ab. Aendert sich die je — etwa weil das Repository und damit der
         * Pfad unter github.io umzieht —, gilt die installierte App als eine
         * andere: neues Symbol auf dem Homescreen, leerer lokaler Speicher.
         * Eine feste `id` haelt sie zusammen.
         */
        id: base,
        name: 'zweikampf',
        short_name: 'zweikampf',
        description: 'lernen, gym, boxen, lesen. zu zweit, eine woche.',
        lang: 'de',
        theme_color: '#14171c',
        background_color: '#14171c',
        display: 'standalone',
        orientation: 'portrait',
        scope: base,
        start_url: base,
        icons: [
          {
            src: `${base}pwa-192x192.png`,
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: `${base}pwa-512x512.png`,
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
          },
        ],
      },
    }),
  ],
})
