// The phone backend: implements window.api (shared/types TuneboxApi) on top of Capacitor plugins
// and the shared YouTube Music code. Pieces arrive in stages; unbuilt ones return empty results.
import type { AppInfo, Settings, ToolStatus, TuneboxApi, TuneboxEvents } from '@shared/types'
import { album, artist, configureYtMusic, search, suggest } from '@shared/ytmusic'
import { Ytdlp } from './native'

type Listener = (payload: unknown) => void
const listeners = new Map<string, Set<Listener>>()
export function emit<K extends keyof TuneboxEvents>(event: K, payload: TuneboxEvents[K]): void {
  listeners.get(event)?.forEach((cb) => cb(payload))
}

const SETTINGS_KEY = 'tunebox.settings'
const DEFAULTS: Settings = {
  libraryDir: '',
  extraDirs: [],
  format: 'm4a',
  bitrate: 0,
  concurrency: 2,
  skipExisting: true,
  skipDuplicates: true,
  cookiesFile: '',
  cookiesBrowser: '',
  theme: 'dark',
  closeToTray: false,
  autoUpdateTools: true,
  ytdlpPath: '',
  ffmpegPath: '',
  notifyOnFinish: true,
  autoDownloadFollowed: true,
  followCheckHours: 6,
  firstRunDone: true
}

function loadSettings(): Settings {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}') }
  } catch {
    return { ...DEFAULTS }
  }
}

let settings = loadSettings()
let tools: ToolStatus = {
  ytdlp: { path: null, version: null, source: 'missing' },
  ffmpeg: { path: 'bundled', version: 'bundled', source: 'bundled' },
  jsRuntime: { mode: 'system', detail: 'QuickJS (bundled with yt-dlp for Android)' },
  selfTest: null,
  busy: null,
  lastUpdateCheck: null,
  latestYtdlp: null
}
let paths = { musicDir: '', cacheDir: '' }

function setTools(patch: Partial<ToolStatus>): ToolStatus {
  tools = { ...tools, ...patch }
  emit('tools:status', tools)
  return tools
}

async function initTools(): Promise<void> {
  setTools({ busy: 'Preparing yt-dlp…' })
  try {
    const r = await Ytdlp.init()
    paths = { musicDir: r.musicDir, cacheDir: r.cacheDir }
    settings = { ...settings, libraryDir: r.musicDir }
    setTools({ ytdlp: { path: 'bundled', version: r.version, source: 'managed' }, busy: null })
  } catch (err) {
    setTools({ busy: null, selfTest: { ok: false, message: String(err), at: Date.now() } })
  }
}

const notYet = async (): Promise<never> => {
  throw new Error('Not available in the phone app yet.')
}

const api: TuneboxApi = {
  app: {
    info: async (): Promise<AppInfo> => ({
      version: '0.1.0-mobile',
      platform: 'android' as NodeJS.Platform,
      userData: paths.cacheDir,
      logsDir: paths.cacheDir
    }),
    openPath: async () => undefined
  },
  settings: {
    get: async () => settings,
    set: async (patch) => {
      settings = { ...settings, ...patch }
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
      return settings
    },
    pickFolder: async () => null,
    pickFile: async () => null
  },
  search: {
    query: (q) => search(q),
    suggest: (q) => suggest(q),
    album: (id) => album(id),
    artist: (id) => artist(id),
    resolveUrl: notYet,
    show: notYet,
    prefetch: async () => undefined
  },
  downloads: {
    list: async () => [],
    enqueue: notYet,
    cancel: async () => undefined,
    retry: async () => undefined,
    remove: async () => undefined,
    cancelAll: async () => undefined,
    clearFinished: async () => undefined
  },
  library: {
    tracks: async () => [],
    rescan: async () => undefined,
    remove: notYet,
    showInFolder: async () => undefined,
    editTags: notYet,
    duplicates: async () => [],
    removeDuplicates: async () => ({ removed: 0, failed: 0 })
  },
  playlists: {
    list: async () => [],
    create: notYet,
    rename: notYet,
    remove: notYet,
    tracks: async () => [],
    add: notYet,
    removeTrack: notYet,
    exportM3u: async () => null
  },
  follows: {
    list: async () => [],
    follow: notYet,
    unfollow: async () => undefined,
    check: async () => ({ releases: 0, tracks: 0, errors: [] }),
    shows: async () => [],
    followShow: notYet,
    unfollowShow: async () => undefined
  },
  spotify: {
    status: async () => ({ clientId: '', signedIn: false, user: null, redirectUri: '' }),
    setClientId: notYet,
    signIn: notYet,
    signOut: notYet,
    myPlaylists: async () => [],
    load: notYet,
    match: async () => [],
    import: notYet
  },
  tools: {
    status: async () => tools,
    update: async () => {
      setTools({ busy: 'Updating yt-dlp…' })
      try {
        const r = await Ytdlp.update()
        return setTools({
          busy: null,
          ytdlp: { ...tools.ytdlp, version: r.version },
          lastUpdateCheck: Date.now()
        })
      } catch (err) {
        return setTools({
          busy: null,
          selfTest: { ok: false, message: String(err), at: Date.now() }
        })
      }
    },
    selfTest: async () => tools
  },
  on: (event, cb) => {
    const set = listeners.get(event) ?? new Set()
    set.add(cb as Listener)
    listeners.set(event, set)
    return () => set.delete(cb as Listener)
  }
}

export async function installMobileApi(): Promise<void> {
  configureYtMusic({ logger: { warn: console.warn, debug: () => undefined } })
  Object.assign(window, { api })
  void initTools()
}
