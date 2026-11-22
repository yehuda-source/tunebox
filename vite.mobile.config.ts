// Builds the React UI for the phone apps (Capacitor): out/mobile, loaded by Android/iOS.
import { renameSync } from 'fs'
import { resolve } from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  root: resolve('src/renderer'),
  base: './',
  resolve: {
    alias: {
      '@renderer': resolve('src/renderer/src'),
      '@shared': resolve('src/shared')
    }
  },
  plugins: [
    react(),
    tailwindcss(),
    {
      // Capacitor loads index.html; the source is mobile.html (index.html is the desktop page).
      name: 'tunebox-mobile-index',
      closeBundle: () =>
        renameSync(resolve('out/mobile/mobile.html'), resolve('out/mobile/index.html'))
    }
  ],
  build: {
    outDir: resolve('out/mobile'),
    emptyOutDir: true,
    rollupOptions: { input: resolve('src/renderer/mobile.html') }
  }
})
