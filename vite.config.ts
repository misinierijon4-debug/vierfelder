// vitest steuert die testumgebung mit, deshalb kommt defineConfig von dort:
// nur diese fassung kennt den `test`-abschnitt weiter unten.
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react-swc'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { sites } from '@openai/sites-vite-plugin'
import { execFileSync } from 'node:child_process'

/**
 * Der sichtbare Stand bleibt fuer denselben Commit reproduzierbar. Eine echte
 * Uhrzeit bei jedem Build veraenderte bislang den Hauptchunk, obwohl der Code
 * identisch war, und loeste damit unnoetige PWA-Updates aus.
 */
function standDerFassung(): string {
  if (process.env.SOURCE_DATE_EPOCH) {
    return new Date(Number(process.env.SOURCE_DATE_EPOCH) * 1000).toISOString()
  }
  try {
    return execFileSync('git', ['show', '-s', '--format=%cI', 'HEAD'], {
      encoding: 'utf8',
    }).trim()
  } catch {
    return '1970-01-01T00:00:00.000Z'
  }
}

export default defineConfig(({ mode }) => {
  const istSitesBuild = mode === 'sites'
  // Sites liefert immer ab Root aus. Pages behaelt unveraendert /vierfelder/.
  const base = istSitesBuild ? '/' : process.env.VITE_BASE || '/'

  return {
  base,
  // der commit-stand steht in der fusszeile. er beantwortet die eine frage, die
  // man einer app auf einem fremden telefon sonst nicht stellen kann: laeuft
  // dort die fassung, ueber die wir gerade reden?
  define: {
    __BAUZEIT__: JSON.stringify(standDerFassung()),
    // Die separate Sites-Vorschau ist absichtlich ein klarer Prototyp und
    // darf auch bei vorhandener .env.local nicht die Produktivdaten anbinden.
    ...(istSitesBuild ? {
      'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(''),
      'import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY': JSON.stringify(''),
    } : {}),
  },
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
    ...(istSitesBuild ? [sites()] : []),
    VitePWA({
      /**
       * Eine neue Fassung darf eine offene Eingabe nicht durch einen Reload
       * abschneiden. Der Worker wartet deshalb, bis der Nutzer ihn in der App
       * ausdrücklich aktiviert. `src/lib/pwa.ts` fängt auch die Übernahme ab,
       * die ein zweiter Tab ausgelöst hat.
       */
      registerType: 'prompt',
      // Manifest-Dateien sind nicht in jeder Plugin-Konfiguration automatisch
      // Teil des Precaches. Explizit aufführen und im Build nachweisen.
      includeAssets: [
        'favicon-32x32.png',
        'apple-touch-icon.png',
        'pwa-192x192.png',
        'pwa-512x512.png',
      ],
      workbox: {
        /**
         * Der erzeugte Service Worker kann von sich aus kein Push. Statt auf
         * `injectManifest` umzustellen und damit das Vorabspeichern selbst zu
         * uebernehmen, laedt er eine zweite Datei dazu: `public/push-sw.js`
         * bringt die beiden Ereignisbehandler mit, alles andere bleibt, wie
         * das Plugin es baut. Der Pfad ist relativ zum Worker, gilt also unter
         * `/` genauso wie unter `/reponame/`.
         */
        importScripts: ['push-sw.js'],
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
  }
})
