// vitest steuert die testumgebung mit, deshalb kommt defineConfig von dort:
// nur diese fassung kennt den `test`-abschnitt weiter unten.
import { defineConfig } from 'vitest/config'
import type { Plugin } from 'vite'
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

/**
 * ENI hat einen zweiten einstieg: `eni.html`, mit eigenem zeichen, eigenem
 * titel und eigenem manifest (`public/eni.webmanifest`). so liegt ENI als
 * eigenes symbol auf dem homescreen und oeffnet direkt den chat. iOS nimmt
 * symbol und titel aus der seite, von der aus man sie ablegt — ein hash auf
 * index.html reicht dafuer nicht.
 *
 * die seite wird aus der fertig gebauten index.html abgeleitet statt als
 * zweiter html-einstieg gebaut: zwei einstiege zerlegen das bundle in einen
 * gemeinsamen chunk und machen es groesser. so laden beide seiten byte fuer
 * byte dasselbe. jede ersetzung muss greifen, sonst bricht der bau ab.
 */
const ENI_ERSETZUNGEN: [string, string][] = [
  ['<title>zweikampf</title>', '<title>ENI</title>'],
  ['name="apple-mobile-web-app-title" content="zweikampf"', 'name="apple-mobile-web-app-title" content="ENI"'],
  ['content="lernen, gym, boxen, lesen. zu zweit, eine woche."', 'content="ENI, direkt. ohne umweg über die anzeigetafel."'],
  ['favicon-32x32.png"', 'eni-favicon-32x32.png"'],
  ['apple-touch-icon.png"', 'eni-apple-touch-icon.png"'],
  ['manifest.webmanifest"', 'eni.webmanifest"'],
  // ohne adresse gleich zu ENI. eine andere (etwa der bericht aus einer push)
  // bleibt stehen. laeuft vor dem bundle, die route liest den hash beim start.
  ['<script type="module"', "<script>if(!location.hash)history.replaceState(null,'','#/eni')</script>\n    <script type=\"module\""],
]

function eniEinstieg(): Plugin {
  return {
    name: 'zweikampf:eni-einstieg',
    apply: 'build',
    enforce: 'post',
    generateBundle(_, bundle) {
      const index = bundle['index.html']
      if (index?.type !== 'asset') throw new Error('eni.html: index.html fehlt im bundle')
      let html = String(index.source)
      for (const [alt, neu] of ENI_ERSETZUNGEN) {
        if (!html.includes(alt)) throw new Error(`eni.html: ${alt} fehlt in index.html`)
        html = html.replace(alt, neu)
      }
      this.emitFile({ type: 'asset', fileName: 'eni.html', source: html })
    },
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
        'eni.webmanifest',
        'eni-favicon-32x32.png',
        'eni-apple-touch-icon.png',
        'eni-192x192.png',
        'eni-512x512.png',
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
    eniEinstieg(),
  ],
  }
})
