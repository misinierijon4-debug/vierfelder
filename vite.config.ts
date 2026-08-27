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
      manifest: {
        name: 'vierfelder',
        short_name: 'vierfelder',
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
            src: `${base}icon.svg`,
            sizes: '512x512',
            type: 'image/svg+xml',
            purpose: 'any maskable',
          },
        ],
      },
    }),
  ],
})
