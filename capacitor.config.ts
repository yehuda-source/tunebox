import type { CapacitorConfig } from '@capacitor/cli'

// TuneBox for phones: the same React UI (built with vite.mobile.config.ts into out/mobile) with a
// phone backend (src/renderer/src/mobile) and native plugins for yt-dlp, files and playback.
const config: CapacitorConfig = {
  appId: 'com.tunebox.app',
  appName: 'TuneBox',
  webDir: 'out/mobile',
  plugins: {
    // Route fetch() through native HTTP: YouTube's endpoints don't allow browser CORS.
    CapacitorHttp: { enabled: true },
    // Light status/navigation bar icons: TuneBox is dark.
    SystemBars: { style: 'DARK' }
  }
}

export default config
