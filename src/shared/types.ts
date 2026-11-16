// Types shared by the main process (backend), the preload bridge and the renderer (UI).

export interface TrackRef {
  videoId: string
  title: string
  artists: string[]
  album?: string
  albumId?: string
  albumArtist?: string
  durationSec?: number
  thumbnail?: string
  trackNumber?: number
  year?: string
}

export interface AlbumRef {
  browseId: string
  title: string
  artist: string
  year?: string
  thumbnail?: string
  kind?: string
}

export interface ArtistRef {
  channelId: string
  name: string
  thumbnail?: string
  subtitle?: string
}

export interface SearchResults {
  query: string
  songs: TrackRef[]
  albums: AlbumRef[]
  artists: ArtistRef[]
  videos: TrackRef[]
  /** 'ytdlp' means YouTube Music was unreachable and the yt-dlp fallback was used. */
  source: 'ytmusic' | 'ytdlp'
}

export interface AlbumDetails extends AlbumRef {
  subtitle?: string
  tracks: TrackRef[]
}

export interface ArtistDetails extends ArtistRef {
  description?: string
  banner?: string
  topSongs: TrackRef[]
  albums: AlbumRef[]
  singles: AlbumRef[]
}

export interface LibraryTrack {
  id: number
  path: string
  title: string
  artist: string
  album: string
  albumArtist: string
  trackNumber: number | null
  year: string | null
  durationSec: number | null
  videoId: string | null
  hasCover: boolean
  addedAt: number
}

export interface TagEdit {
  title: string
  artist: string
  album: string
  albumArtist: string
  trackNumber: number | null
  year: string | null
}

export type JobStatus = 'queued' | 'downloading' | 'processing' | 'done' | 'error' | 'canceled'

export interface DownloadJob {
  id: string
  track: TrackRef
  status: JobStatus
  progress: number
  speed?: number | null
  eta?: number | null
  error?: string
  path?: string
  attempts: number
  createdAt: number
  batch?: string
}

export type AudioFormat = 'mp3' | 'm4a' | 'opus'

export interface Settings {
  libraryDir: string
  extraDirs: string[]
  format: AudioFormat
  /** Target kbps; 0 = best available (320 for MP3, no re-encode for M4A/Opus). */
  bitrate: number
  concurrency: number
  skipExisting: boolean
  /** Also skip the same song from another album, compilation or upload (matched by name + length). */
  skipDuplicates: boolean
  cookiesFile: string
  cookiesBrowser: string
  theme: 'dark' | 'light' | 'system'
  closeToTray: boolean
  autoUpdateTools: boolean
  ytdlpPath: string
  ffmpegPath: string
  notifyOnFinish: boolean
  autoDownloadFollowed: boolean
  followCheckHours: number
  firstRunDone: boolean
}

export type ToolSource = 'custom' | 'managed' | 'bundled' | 'system' | 'missing'

export interface ToolInfo {
  path: string | null
  version: string | null
  source: ToolSource
}

export interface ToolStatus {
  ytdlp: ToolInfo
  ffmpeg: ToolInfo
  jsRuntime: { mode: 'electron' | 'system'; detail: string }
  selfTest: { ok: boolean; message: string; at: number } | null
  busy: string | null
  lastUpdateCheck: number | null
  latestYtdlp: string | null
}

export interface Playlist {
  id: number
  name: string
  trackCount: number
  createdAt: number
}

export interface FollowedArtist {
  channelId: string
  name: string
  thumbnail: string | null
  followedAt: number
  lastChecked: number | null
  /** When a new release was last found. */
  lastNew: number | null
}

export interface FollowCheckResult {
  releases: number
  tracks: number
  errors: string[]
}

export interface DuplicateGroup {
  keep: LibraryTrack
  extras: LibraryTrack[]
}

export interface EnqueueResult {
  queued: number
  skipped: number
}

export interface AppInfo {
  version: string
  platform: NodeJS.Platform
  userData: string
  logsDir: string
}

/** The API the preload script exposes as `window.api`. */
export interface TuneboxApi {
  app: {
    info(): Promise<AppInfo>
    openPath(p: string): Promise<void>
  }
  settings: {
    get(): Promise<Settings>
    set(patch: Partial<Settings>): Promise<Settings>
    pickFolder(): Promise<string | null>
    pickFile(): Promise<string | null>
  }
  search: {
    query(q: string): Promise<SearchResults>
    suggest(q: string): Promise<string[]>
    album(browseId: string): Promise<AlbumDetails>
    artist(channelId: string): Promise<ArtistDetails>
    resolveUrl(url: string): Promise<TrackRef[]>
    /** Resolve a stream URL ahead of time so playback starts faster. */
    prefetch(videoId: string): Promise<void>
  }
  downloads: {
    list(): Promise<DownloadJob[]>
    enqueue(tracks: TrackRef[], batch?: string): Promise<EnqueueResult>
    cancel(id: string): Promise<void>
    retry(id: string): Promise<void>
    remove(id: string): Promise<void>
    cancelAll(): Promise<void>
    clearFinished(): Promise<void>
  }
  library: {
    tracks(): Promise<LibraryTrack[]>
    rescan(): Promise<void>
    remove(id: number): Promise<void>
    showInFolder(id: number): Promise<void>
    editTags(id: number, tags: TagEdit): Promise<void>
    duplicates(): Promise<DuplicateGroup[]>
    /** Removes the extra copies (to the trash, or deleted when `permanent`), keeping the first-downloaded one. */
    removeDuplicates(permanent?: boolean): Promise<{ removed: number; failed: number }>
  }
  playlists: {
    list(): Promise<Playlist[]>
    create(name: string): Promise<Playlist>
    rename(id: number, name: string): Promise<void>
    remove(id: number): Promise<void>
    tracks(id: number): Promise<number[]>
    add(id: number, trackIds: number[]): Promise<void>
    removeTrack(id: number, trackId: number): Promise<void>
    exportM3u(id: number): Promise<string | null>
  }
  follows: {
    list(): Promise<FollowedArtist[]>
    follow(artist: ArtistRef): Promise<void>
    unfollow(channelId: string): Promise<void>
    check(): Promise<FollowCheckResult>
  }
  tools: {
    status(): Promise<ToolStatus>
    update(): Promise<ToolStatus>
    selfTest(): Promise<ToolStatus>
  }
  on<K extends keyof TuneboxEvents>(event: K, cb: (payload: TuneboxEvents[K]) => void): () => void
}

export interface TuneboxEvents {
  'downloads:update': DownloadJob
  'downloads:removed': string
  'library:changed': null
  'tools:status': ToolStatus
  'media:command': 'toggle' | 'next' | 'prev'
  'follows:changed': null
}

/** Channels the preload forwards; keep in sync with TuneboxApi. */
export const API_CHANNELS = {
  app: ['info', 'openPath'],
  settings: ['get', 'set', 'pickFolder', 'pickFile'],
  search: ['query', 'suggest', 'album', 'artist', 'resolveUrl', 'prefetch'],
  downloads: ['list', 'enqueue', 'cancel', 'retry', 'remove', 'cancelAll', 'clearFinished'],
  library: [
    'tracks',
    'rescan',
    'remove',
    'showInFolder',
    'editTags',
    'duplicates',
    'removeDuplicates'
  ],
  playlists: ['list', 'create', 'rename', 'remove', 'tracks', 'add', 'removeTrack', 'exportM3u'],
  follows: ['list', 'follow', 'unfollow', 'check'],
  tools: ['status', 'update', 'selfTest']
} as const

export const EVENT_CHANNELS: (keyof TuneboxEvents)[] = [
  'downloads:update',
  'downloads:removed',
  'library:changed',
  'tools:status',
  'media:command',
  'follows:changed'
]
