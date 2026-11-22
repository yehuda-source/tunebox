// TypeScript side of the native plugins in android/app/src/main/java/com/tunebox/app/.
import { registerPlugin, type PluginListenerHandle } from '@capacitor/core'

export interface YtdlpProgress {
  id: string
  /** 0–100, or -1 when unknown. */
  progress: number
  eta: number
  line: string
}

export interface YtdlpPlugin {
  /** Unpacks Python, yt-dlp, ffmpeg and QuickJS on first run. */
  init(): Promise<{ version: string; musicDir: string; cacheDir: string }>
  /** Download the latest yt-dlp release (like the desktop app's auto-update). */
  update(): Promise<{ status: 'DONE' | 'ALREADY_UP_TO_DATE' | 'UNKNOWN'; version: string }>
  /** Run yt-dlp with these arguments. `id` lets it be cancelled and tags progress events. */
  run(options: {
    id: string
    args: string[]
  }): Promise<{ exitCode: number; out: string; err: string }>
  cancel(options: { id: string }): Promise<{ canceled: boolean }>
  addListener(event: 'progress', cb: (e: YtdlpProgress) => void): Promise<PluginListenerHandle>
}

export const Ytdlp = registerPlugin<YtdlpPlugin>('Ytdlp')
