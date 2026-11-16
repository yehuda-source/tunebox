import { resolve } from 'path'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@renderer': resolve('src/renderer/src'),
      '@shared': resolve('src/shared')
    }
  },
  test: {
    include: ['test/**/*.test.{ts,tsx}'],
    environment: 'node',
    // UI tests opt into jsdom with a `// @vitest-environment jsdom` comment.
    setupFiles: ['test/ui/setup.ts']
  }
})
