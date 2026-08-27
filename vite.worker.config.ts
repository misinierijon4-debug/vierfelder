import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    ssr: 'src/sitesWorker.ts',
    outDir: 'dist/server',
    emptyOutDir: false,
    rolldownOptions: {
      output: {
        entryFileNames: 'index.js',
      },
    },
  },
})
