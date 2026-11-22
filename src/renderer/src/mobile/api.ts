// The phone backend: implements window.api (shared/types TuneboxApi) on top of the Capacitor
// plugins in android/ and the code shared with the desktop app. Follows and Spotify come later.
import { App } from '@capacitor/app'
import type { AppInfo, ToolStatus, TuneboxApi } from '@shared/types'
import { album, artist, configureYtMusic, search, suggest } from '@shared/ytmusic'
import { loadShowWith, resolveUrlWith } from '@shared/ytdlpEntries'
import { platform, enablePhoneLayout } from '../lib/platform'
import { createNativeAudio } from './audio'
import { db, flush, openDb } from './db'
import * as downloads from './downloads'
import { emit, on } from './events'
import * as library from './library'
import { Files, NativePlayer, Ytdlp } from './native'
import { getSettings, paths, setSettings } from './settings'
import { resolveStream, ytdlpJson } from './ytdlp'

let tools: ToolStatus = {
  ytdlp: { path: null, version: null, source: 'missing' },
  ffmpeg: { path: 'bundled', version: 'bundled with the app', source: 'bundled' },
  jsRuntime: { mode: 'system', detail: 'QuickJS (bundled with yt-dlp for Android)' },
  selfTest: null,
  busy: null,
  lastUpdateCheck: Number(localStorage.getItem('tunebox.ytdlpChecked')) || null,
  latestYtdlp: null
}

function setTools(patch: Partial<ToolStatus>): ToolStatus {
  tools = { ...tools, ...patch }
  emit('tools:status', tools)
  return tools
}

let updating: Promise<ToolStatus> | null = null
/** Fetch the newest yt-dlp (youtubedl-android keeps it in app storage, no app update needed). */
function updateYtdlp(): Promise<ToolStatus> {
  updating ??= (async () => {
    setTools({ busy: 'Updating yt-dlp…' })
    try {
      const r = await Ytdlp.update()
      localStorage.setItem('tunebox.ytdlpChecked', String(Date.now()))
      return setTools({
        busy: null,
        ytdlp: { ...tools.ytdlp, version: r.version || tools.ytdlp.version },
        latestYtdlp: r.version || null,
        lastUpdateCheck: Date.now()
      })
    } catch (err) {
      return setTools({ busy: null, selfTest: { ok: false, message: String(err), at: Date.now() } })
    } finally {
      updating = null
    }
  })()
  return updating
}

/** Like the desktop app: update when a download fails with an "outdated" error, at most hourly. */
async function updateIfOutdated(): Promise<void> {
  if (tools.lastUpdateCheck && Date.now() - tools.lastUpdateCheck < 60 * 60 * 1000) return
  await updateYtdlp()
}

let ready: Promise<void> = new Promise(() => undefined)

async function start(): Promise<void> {
  setTools({ busy: 'Preparing yt-dlp…' })
  const r = await Ytdlp.init()
  const dirs = await Files.dirs()
  paths.music = r.musicDir
  paths.covers = `${dirs.external}/covers`
  paths.work = `${dirs.cache}/downloads`
  paths.data = `${dirs.files}/library.json`
  await openDb(paths.data)
  setTools({ ytdlp: { path: 'bundled', version: r.version, source: 'managed' }, busy: null })
  await downloads.initQueue({ updateIfOutdated })
  void library.rescan()
  const stale = !tools.lastUpdateCheck || Date.now() - tools.lastUpdateCheck > 24 * 60 * 60 * 1000
  if (getSettings().autoUpdateTools && stale) void updateYtdlp()
}

/** Waits for startup before touching the library. */
const after =
  <A extends unknown[], R>(fn: (...args: A) => R | Promise<R>) =>
  async (...args: A): Promise<R> => {
    await ready
    return fn(...args)
  }

const notYet = async (): Promise<never> => {
  throw new Error('Not available in the phone app yet.')
}

/** tunebox-media://track/<id> and tunebox-media://stream/<videoId> → what the native player opens. */
async function resolveMedia(
  src: string
): Promise<{ url: string; userAgent?: string; artwork?: string }> {
  const m = src.match(/^tunebox-media:\/\/(track|stream)\/(.+)$/)
  if (!m) return { url: src }
  if (m[1] === 'track') {
    await ready
    const t = db.track(Number(m[2]))
    if (!t) throw new Error('This song is no longer in the library.')
    return {
      url: library.fileUrl(t.path),
      artwork: t.hasCover ? library.fileUrl(library.coverFile(t.id)) : undefined
    }
  }
  const s = await resolveStream(m[2])
  return { url: s.url, userAgent: s.userAgent }
}

const api: TuneboxApi = {
  app: {
    info: async (): Promise<AppInfo> => ({
      version: (await App.getInfo()).version,
      platform: 'android' as NodeJS.Platform,
      userData: paths.data,
      logsDir: ''
    }),
    openPath: async () => undefined
  },
  settings: {
    get: async () => getSettings(),
    set: async (patch) => setSettings(patch),
    pickFolder: async () => null,
    pickFile: async () => null
  },
  search: {
    query: (q) => search(q),
    suggest: (q) => suggest(q),
    album: (id) => album(id),
    artist: (id) => artist(id),
    resolveUrl: (url) => resolveUrlWith(ytdlpJson, url),
    show: (kind, id, limit) => loadShowWith(ytdlpJson, kind, id, limit),
    prefetch: async (videoId) => {
      void resolveStream(videoId).catch(() => undefined)
    }
  },
  downloads: {
    list: after(() => downloads.listJobs()),
    enqueue: after((tracks, batch) => downloads.enqueue(tracks, batch)),
    cancel: after((id) => downloads.cancel(id)),
    retry: after((id) => downloads.retry(id)),
    remove: after((id) => downloads.remove(id)),
    cancelAll: after(() => downloads.cancelAll()),
    clearFinished: after(() => downloads.clearFinished())
  },
  library: {
    tracks: after(() => db.allTracks()),
    rescan: after(() => library.rescan()),
    remove: after((id) => library.removeTrack(id)),
    showInFolder: async () => undefined,
    editTags: after((id, tags) => library.editTags(id, tags)),
    duplicates: after(() => library.findDuplicates()),
    removeDuplicates: after(() => library.removeDuplicates())
  },
  playlists: {
    list: after(() => db.playlists()),
    create: after((name) => db.createPlaylist(name)),
    rename: after((id, name) => db.renamePlaylist(id, name)),
    remove: after((id) => db.removePlaylist(id)),
    tracks: after((id) => db.playlistTracks(id)),
    add: after((id, ids) => db.addToPlaylist(id, ids)),
    removeTrack: after((id, trackId) => db.removeFromPlaylist(id, trackId)),
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
    update: () => updateYtdlp(),
    selfTest: async () => tools
  },
  on
}

/**
 * youtubei.js's browser build sends no User-Agent (browsers forbid setting one), so requests went
 * out with the WebView's mobile one and YouTube Music answered with its mobile layout, which has
 * no artists or albums in search results. Native HTTP can send any User-Agent, so send a desktop
 * browser's. Capacitor also reads headers from a Request object rather than from `init`, so the
 * URL and headers are passed separately.
 */
const DESKTOP_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36'

const nativeFetch: typeof fetch = async (input, init) => {
  const req = input instanceof Request ? input : null
  const url = req ? req.url : String(input)
  const headers = new Headers(init?.headers ?? req?.headers)
  if (!headers.has('User-Agent')) headers.set('User-Agent', DESKTOP_UA)
  const body = init?.body ?? (req?.body ? await req.clone().text() : undefined)
  return fetch(url, {
    method: init?.method ?? req?.method,
    headers: Object.fromEntries(headers.entries()),
    body,
    redirect: init?.redirect ?? req?.redirect,
    signal: init?.signal ?? req?.signal
  })
}

export async function installMobileApi(): Promise<void> {
  configureYtMusic({ logger: { warn: console.warn, debug: () => undefined }, fetch: nativeFetch })
  Object.assign(window, { api })
  const { audio, setNowPlaying } = createNativeAudio(resolveMedia)
  enablePhoneLayout()
  platform.createAudio = () => audio
  platform.coverUrl = library.coverUrl
  platform.nowPlaying = setNowPlaying
  ready = start()
  ready.catch((err) =>
    setTools({ busy: null, selfTest: { ok: false, message: String(err), at: Date.now() } })
  )
  void NativePlayer.addListener('command', (e) => emit('media:command', e.command))
  // Save right away when the app goes to the background; Android may stop it without warning.
  void App.addListener('pause', () => void flush())
}
