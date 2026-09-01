import { defineConfig } from 'vite'
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
      manifest: {
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
