// TypeScript side of the native plugins in android/app/src/main/java/com/tunebox/app/.
import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core'

/** iPhone: yt-dlp runs in embedded Python with JavaScriptCore, and there's no ffmpeg. */
export const isIos = Capacitor.getPlatform() === 'ios'

export interface YtdlpProgress {
  id: string
  /** 0–100, or -1 when unknown. */
  progress: number
  eta: number
  line: string
}

export interface YtdlpPlugin {
  /** Unpacks Python, yt-dlp, ffmpeg and QuickJS on first run. */
  start(): Promise<{ version: string; musicDir: string; cacheDir: string }>
  /** Download the latest yt-dlp release (like the desktop app's auto-update). */
  update(): Promise<{ status: 'DONE' | 'ALREADY_UP_TO_DATE' | 'UNKNOWN'; version: string }>
  /** Run yt-dlp with these arguments. `id` lets it be cancelled and tags progress events. */
  run(options: {
    id: string
    args: string[]
  }): Promise<{ exitCode: number; out: string; err: string }>
  cancel(options: { id: string }): Promise<{ canceled: boolean }>
  /** iOS only (no ffmpeg there): write tags and a JPEG cover into an .m4a/.mp3 file. */
  tag(options: { path: string; tags: Record<string, unknown>; cover?: string }): Promise<void>
  /** iOS only: whether the app was launched for the automated check. */
  selfTest(): Promise<{ requested: boolean; results: string }>
  addListener(event: 'progress', cb: (e: YtdlpProgress) => void): Promise<PluginListenerHandle>
}

export const Ytdlp = registerPlugin<YtdlpPlugin>('Ytdlp')

export interface FilesPlugin {
  dirs(): Promise<{ files: string; cache: string; external: string }>
  /** `text` is null when the file doesn't exist. */
  readText(o: { path: string }): Promise<{ text: string | null }>
  /** Atomic (temporary file + rename). */
  writeText(o: { path: string; text: string }): Promise<void>
  stat(o: { path: string }): Promise<{ exists: boolean; size: number; dir: boolean }>
  existing(o: { paths: string[] }): Promise<{ paths: string[] }>
  list(o: { path: string }): Promise<{ names: string[] }>
  mkdirs(o: { path: string }): Promise<void>
  move(o: { from: string; to: string }): Promise<void>
  /** Deletes a file or folder; with `pruneUpTo`, also folders left empty below that root. */
  remove(o: { path: string; pruneUpTo?: string }): Promise<void>
  download(o: { url: string; path: string }): Promise<{ size: number }>
  /** Android only. */
  ffmpeg(o: { args: string[] }): Promise<{ exitCode: number; out: string }>
  /** iOS only: download an image and save it as a square JPEG. */
  squareCover(o: { url: string; path: string }): Promise<{ size: number }>
}

export const Files = registerPlugin<FilesPlugin>('Files')

export interface PlayerState {
  position: number
  duration: number
  playing: boolean
  playWhenReady: boolean
  buffering: boolean
  ready: boolean
  ended: boolean
}

export interface PlayerPlugin {
  load(o: {
    url: string
    key?: string
    title?: string
    artist?: string
    album?: string
    artwork?: string
    userAgent?: string
    startAt?: number
    autoplay?: boolean
  }): Promise<void>
  play(): Promise<void>
  pause(): Promise<void>
  seek(o: { position: number }): Promise<void>
  setVolume(o: { volume: number }): Promise<void>
  stop(): Promise<void>
  getState(): Promise<PlayerState>
  addListener(event: 'state', cb: (s: PlayerState) => void): Promise<PluginListenerHandle>
  addListener(
    event: 'time',
    cb: (t: { position: number; duration: number }) => void
  ): Promise<PluginListenerHandle>
  addListener(
    event: 'error',
    cb: (e: { message: string; code: number }) => void
  ): Promise<PluginListenerHandle>
  addListener(
    event: 'command',
    cb: (e: { command: 'next' | 'prev' }) => void
  ): Promise<PluginListenerHandle>
}

export const NativePlayer = registerPlugin<PlayerPlugin>('Player')
