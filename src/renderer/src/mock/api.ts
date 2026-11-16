// In-memory implementation of window.api for the browser preview (npm run preview:web).
// Choose a scenario with ?scenario=default|empty|broken|slow|errors|huge|firstrun|notrash|spotify-setup|spotify-signin.
import type {
  DownloadJob,
  FollowedArtist,
  LibraryTrack,
  Playlist,
  Settings,
  SpotifyMatch,
  SpotifyStatus,
  TuneboxApi,
  TuneboxEvents
} from '@shared/types'
import {
  coverSvg,
  makeAlbum,
  makeArtist,
  makeJobs,
  makeLibrary,
  makeSearch,
  makeSpotifyTracks,
  makeTools
} from './fixtures'

export const scenario = new URLSearchParams(location.search).get('scenario') ?? 'default'

const listeners = new Map<string, Set<(p: unknown) => void>>()
function emit<K extends keyof TuneboxEvents>(event: K, payload: TuneboxEvents[K]): void {
  listeners.get(event)?.forEach((cb) => cb(payload))
}

const delay = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))
const latency = (): Promise<void> => delay(scenario === 'slow' ? 2500 : 150)
const fail = (what: string): never => {
  throw new Error(
    `Error invoking remote method '${what}': Error: getaddrinfo ENOTFOUND music.youtube.com`
  )
}

let settings: Settings = {
  libraryDir: '/home/user/Music/TuneBox',
  extraDirs: scenario === 'default' ? ['/mnt/data/Music/Old CDs'] : [],
  format: 'mp3',
  bitrate: 0,
  concurrency: 3,
  skipExisting: true,
  skipDuplicates: true,
  cookiesFile: '',
  cookiesBrowser: '',
  theme: (new URLSearchParams(location.search).get('theme') as Settings['theme']) ?? 'dark',
  closeToTray: false,
  autoUpdateTools: true,
  ytdlpPath: '',
  ffmpegPath: '',
  notifyOnFinish: true,
  autoDownloadFollowed: true,
  followCheckHours: 6,
  firstRunDone: scenario !== 'firstrun'
}

let spotifyStatus: SpotifyStatus = {
  clientId: scenario === 'spotify-setup' ? '' : '0123456789abcdef0123456789abcdef',
  signedIn: scenario !== 'spotify-setup' && scenario !== 'spotify-signin',
  user: scenario === 'spotify-setup' || scenario === 'spotify-signin' ? null : 'Preview User',
  redirectUri: 'http://127.0.0.1:43821/callback'
}

let tracks: LibraryTrack[] = makeLibrary(
  scenario === 'empty' || scenario === 'firstrun' ? 0 : scenario === 'huge' ? 5000 : 300
)
const jobs = new Map<string, DownloadJob>(
  (scenario === 'empty' || scenario === 'firstrun' ? [] : makeJobs()).map((j) => [j.id, j])
)
let playlists: Playlist[] =
  scenario === 'default'
    ? [
        { id: 1, name: 'Shabbos Table', trackCount: 3, createdAt: Date.now() },
        {
          id: 2,
          name: 'A playlist with a really long name that should be truncated',
          trackCount: 0,
          createdAt: Date.now()
        }
      ]
    : []
const playlistTracks = new Map<number, number[]>([[1, [1, 2, 3]]])
let follows: FollowedArtist[] =
  scenario === 'default'
    ? [
        {
          channelId: 'UCartist0',
          name: 'Yaakov Shwekey',
          thumbnail: null,
          followedAt: Date.now() - 86_400_000,
          lastChecked: Date.now() - 3_600_000,
          lastNew: null
        }
      ]
    : []

// Simulate download progress so the Downloads view animates.
setInterval(() => {
  for (const j of jobs.values()) {
    if (j.status === 'downloading') {
      j.progress = Math.min(0.95, j.progress + 0.07)
      if (j.progress >= 0.95) j.status = 'processing'
      emit('downloads:update', { ...j })
    } else if (j.status === 'processing' && Math.random() < 0.3) {
      j.status = 'done'
      j.progress = 1
      emit('downloads:update', { ...j })
    }
  }
  const running = [...jobs.values()].filter(
    (j) => j.status === 'downloading' || j.status === 'processing'
  ).length
  const next = [...jobs.values()].find((j) => j.status === 'queued')
  if (next && running < settings.concurrency) {
    next.status = 'downloading'
    next.progress = 0
    emit('downloads:update', { ...next })
  }
}, 700)

export const mockApi: TuneboxApi = {
  app: {
    info: async () => ({
      version: '1.0.0-preview',
      platform: 'linux',
      userData: '/home/user/.config/TuneBox',
      logsDir: '/home/user/.config/TuneBox/logs'
    }),
    openPath: async () => undefined
  },
  settings: {
    get: async () => settings,
    set: async (patch) => (settings = { ...settings, ...patch }),
    pickFolder: async () => '/home/user/Music/Picked Folder',
    pickFile: async () => '/home/user/cookies.txt'
  },
  search: {
    query: async (q) => {
      await latency()
      if (scenario === 'errors') fail('search:query')
      return makeSearch(q)
    },
    suggest: async (q) => (q ? [q, `${q} live`, `${q} album`, `${q} remix`] : []),
    album: async (id) => {
      await latency()
      if (scenario === 'errors') fail('search:album')
      return makeAlbum(id)
    },
    artist: async (id) => {
      await latency()
      if (scenario === 'errors') fail('search:artist')
      return makeArtist(id)
    },
    resolveUrl: async (url) => {
      await latency()
      if (!/youtu/.test(url))
        throw new Error('That does not look like a YouTube or YouTube Music link.')
      return makeAlbum('MPREb_url').tracks
    },
    prefetch: async () => undefined
  },
  downloads: {
    list: async () => [...jobs.values()],
    enqueue: async (refs, batch) => {
      const have = new Set(tracks.map((t) => t.videoId))
      let queued = 0
      for (const track of refs) {
        if (have.has(track.videoId)) continue
        const job: DownloadJob = {
          id: crypto.randomUUID(),
          track,
          status: 'queued',
          progress: 0,
          attempts: 0,
          createdAt: Date.now() + queued,
          batch
        }
        jobs.set(job.id, job)
        emit('downloads:update', job)
        queued++
      }
      return { queued, skipped: refs.length - queued }
    },
    cancel: async (id) => {
      const j = jobs.get(id)
      if (j) emit('downloads:update', Object.assign(j, { status: 'canceled' as const }))
    },
    retry: async (id) => {
      const j = jobs.get(id)
      if (j)
        emit(
          'downloads:update',
          Object.assign(j, { status: 'queued' as const, progress: 0, error: undefined })
        )
    },
    remove: async (id) => {
      jobs.delete(id)
      emit('downloads:removed', id)
    },
    cancelAll: async () => {
      for (const j of jobs.values())
        if (['queued', 'downloading', 'processing'].includes(j.status))
          await mockApi.downloads.cancel(j.id)
    },
    clearFinished: async () => {
      for (const j of [...jobs.values()])
        if (['done', 'error', 'canceled'].includes(j.status)) await mockApi.downloads.remove(j.id)
    }
  },
  library: {
    tracks: async () => tracks,
    rescan: async () => delay(800),
    remove: async (id) => {
      tracks = tracks.filter((t) => t.id !== id)
      emit('library:changed', null)
    },
    showInFolder: async () => undefined,
    duplicates: async () => {
      const groups = new Map<string, { keep: LibraryTrack; extras: LibraryTrack[] }>()
      for (const t of tracks) {
        const key = `${t.artist}|${t.title}`.toLowerCase()
        const g = groups.get(key)
        if (g) g.extras.push(t)
        else groups.set(key, { keep: t, extras: [] })
      }
      return [...groups.values()].filter((g) => g.extras.length)
    },
    removeDuplicates: async (permanent) => {
      // ?scenario=notrash: the music drive has no trash, so only permanent deletion works.
      if (scenario === 'notrash' && !permanent) {
        const n = (await mockApi.library.duplicates()).reduce((k, g) => k + g.extras.length, 0)
        return { removed: 0, failed: n }
      }
      const extras = new Set(
        (await mockApi.library.duplicates()).flatMap((g) => g.extras.map((e) => e.id))
      )
      tracks = tracks.filter((t) => !extras.has(t.id))
      emit('library:changed', null)
      return { removed: extras.size, failed: 0 }
    },
    editTags: async (id, tags) => {
      tracks = tracks.map((t) => (t.id === id ? { ...t, ...tags } : t))
      emit('library:changed', null)
    }
  },
  playlists: {
    list: async () =>
      playlists.map((p) => ({ ...p, trackCount: playlistTracks.get(p.id)?.length ?? 0 })),
    create: async (name) => {
      const p = { id: Date.now(), name, trackCount: 0, createdAt: Date.now() }
      playlists = [...playlists, p]
      return p
    },
    rename: async (id, name) =>
      void (playlists = playlists.map((p) => (p.id === id ? { ...p, name } : p))),
    remove: async (id) => void (playlists = playlists.filter((p) => p.id !== id)),
    tracks: async (id) => playlistTracks.get(id) ?? [],
    add: async (id, ids) =>
      void playlistTracks.set(id, [...new Set([...(playlistTracks.get(id) ?? []), ...ids])]),
    removeTrack: async (id, tid) =>
      void playlistTracks.set(
        id,
        (playlistTracks.get(id) ?? []).filter((t) => t !== tid)
      ),
    exportM3u: async () => '/home/user/Music/Shabbos Table.m3u8'
  },
  follows: {
    list: async () => follows,
    follow: async (a) => {
      await latency()
      follows = [
        ...follows,
        {
          channelId: a.channelId,
          name: a.name,
          thumbnail: a.thumbnail ?? null,
          followedAt: Date.now(),
          lastChecked: Date.now(),
          lastNew: null
        }
      ]
      emit('follows:changed', null)
    },
    unfollow: async (id) => {
      follows = follows.filter((f) => f.channelId !== id)
      emit('follows:changed', null)
    },
    check: async () => {
      await delay(1200)
      return { releases: 1, tracks: 3, errors: [] }
    }
  },
  spotify: {
    status: async () => spotifyStatus,
    setClientId: async (id) => {
      if (id && !/^[0-9a-f]{32}$/i.test(id))
        throw new Error('That doesn’t look like a Spotify Client ID.')
      spotifyStatus = { ...spotifyStatus, clientId: id, signedIn: false, user: null }
      return spotifyStatus
    },
    signIn: async () => {
      await delay(600)
      spotifyStatus = { ...spotifyStatus, signedIn: true, user: 'Preview User' }
      return spotifyStatus
    },
    signOut: async () => (spotifyStatus = { ...spotifyStatus, signedIn: false, user: null }),
    myPlaylists: async () => [
      { kind: 'liked', id: 'liked', name: 'Liked Songs', total: 24 },
      {
        kind: 'playlist',
        id: 'pl1',
        name: 'Shabbos Mix',
        owner: 'Preview User',
        cover: coverSvg('Shabbos Mix', 1),
        total: 18
      },
      {
        kind: 'playlist',
        id: 'pl2',
        name: 'Road Trip',
        owner: 'Preview User',
        cover: coverSvg('Road Trip', 4),
        total: 30
      }
    ],
    load: async (source) => {
      await latency()
      if (/spotify\.link/.test(source)) throw new Error('Short spotify.link links can’t be read.')
      const name =
        source === 'liked' ? 'Liked Songs' : source === 'pl1' ? 'Shabbos Mix' : 'Road Trip'
      const tracks = makeSpotifyTracks(source === 'pl1' ? 18 : 24)
      return {
        collection: {
          kind: source === 'liked' ? 'liked' : 'playlist',
          id: source,
          name,
          owner: 'Preview User',
          total: tracks.length
        },
        tracks
      }
    },
    match: async (list) => {
      for (let done = 0; done <= list.length; done += 3) {
        emit('spotify:progress', { done: Math.min(done, list.length), total: list.length })
        await delay(scenario === 'slow' ? 400 : 60)
      }
      return list.map((sp, i): SpotifyMatch => {
        const status = (['match', 'match', 'match', 'check', 'library', 'missing'] as const)[i % 6]
        if (status === 'library')
          return { spotify: sp, status, libraryTrackId: (i % tracks.length) + 1 }
        return {
          spotify: sp,
          status,
          candidate:
            status === 'missing' && i % 12 === 5
              ? undefined
              : {
                  videoId: `sp${String(i).padStart(9, '0')}`,
                  title: status === 'check' ? `${sp.title} (Official Video)` : sp.title,
                  artists: sp.artists,
                  durationSec:
                    sp.durationSec + (status === 'check' ? 18 : status === 'missing' ? 60 : 1)
                }
        }
      })
    },
    import: async (matches, name) => {
      const toDownload = matches.filter((m) => m.status !== 'library' && m.candidate)
      const r = await mockApi.downloads.enqueue(
        toDownload.map((m) => ({ ...m.candidate!, album: m.spotify.album })),
        name ? `Spotify: ${name}` : 'Spotify import'
      )
      let playlistId: number | null = null
      if (name) {
        playlistId = (await mockApi.playlists.create(name)).id
        await mockApi.playlists.add(
          playlistId,
          matches.filter((m) => m.libraryTrackId).map((m) => m.libraryTrackId!)
        )
        emit('library:changed', null)
      }
      return { ...r, playlistId }
    }
  },
  tools: {
    status: async () => makeTools(scenario),
    update: async () => makeTools(scenario),
    selfTest: async () => makeTools(scenario)
  },
  on: (event, cb) => {
    const set = listeners.get(event) ?? new Set()
    set.add(cb as (p: unknown) => void)
    listeners.set(event, set)
    return () => set.delete(cb as (p: unknown) => void)
  }
}
