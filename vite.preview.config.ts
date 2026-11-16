// Serves the renderer in a normal browser with a mocked backend (see src/renderer/src/mock).
// npm run preview:web  →  http://localhost:5199/preview.html?scenario=default
import { resolve } from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  root: resolve('src/renderer'),
  resolve: {
    alias: {
      '@renderer': resolve('src/renderer/src'),
      '@shared': resolve('src/shared')
    }
  },
  plugins: [react(), tailwindcss()],
  server: { port: 5199, strictPort: true, open: false }
})
