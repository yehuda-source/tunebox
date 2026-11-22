import type { CapacitorConfig } from '@capacitor/cli'

// TuneBox for phones: the same React UI (built with vite.mobile.config.ts into out/mobile) with a
// phone backend (src/renderer/src/mobile) and native plugins for yt-dlp and local media.
const config: CapacitorConfig = {
  appId: 'com.tunebox.app',
  appName: 'TuneBox',
  webDir: 'out/mobile',
  plugins: {
    // Route fetch() through native HTTP: YouTube's endpoints don't allow browser CORS.
    CapacitorHttp: { enabled: true }
  },
  android: {
    // Local songs and streams are served by the app's own server on http://127.0.0.1.
    allowMixedContent: true
  }
}

export default config
