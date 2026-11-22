// The phone library: tracks, playlists and the download queue, kept in one JSON file in app
// storage (written atomically, debounced). Plenty for a phone-sized library, and no SQLite needed.
import type { DownloadJob, LibraryTrack, Playlist } from '@shared/types'
import { Files } from './native'

interface StoredPlaylist {
  id: number
  name: string
  createdAt: number
  trackIds: number[]
}

interface Data {
  version: 1
  nextTrackId: number
  nextPlaylistId: number
  tracks: LibraryTrack[]
  playlists: StoredPlaylist[]
  jobs: DownloadJob[]
}

const empty = (): Data => ({
  version: 1,
  nextTrackId: 1,
  nextPlaylistId: 1,
  tracks: [],
  playlists: [],
  jobs: []
})

let file = ''
let data: Data = empty()
let saveTimer: ReturnType<typeof setTimeout> | null = null
let saving: Promise<void> = Promise.resolve()

export async function openDb(path: string): Promise<void> {
  file = path
  try {
    const { text } = await Files.readText({ path })
    if (text) data = { ...empty(), ...(JSON.parse(text) as Partial<Data>) }
  } catch (err) {
    // Keep the unreadable file for inspection rather than overwriting it with an empty library.
    console.error('Could not read the library file', err)
    await Files.move({ from: path, to: `${path}.broken-${Date.now()}` }).catch(() => undefined)
  }
}

function scheduleSave(): void {
  if (saveTimer) return
  saveTimer = setTimeout(() => void flush(), 400)
}

/** Write pending changes now (also called when the app goes to the background). */
export function flush(): Promise<void> {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = null
  if (!file) return saving
  const text = JSON.stringify(data)
  saving = saving
    .then(() => Files.writeText({ path: file, text }))
    .catch((err) => console.error('Could not save the library', err))
  return saving
}

const byName = (a: string, b: string): number =>
  a.localeCompare(b, undefined, { sensitivity: 'base' })

export const db = {
  // ---------- tracks ----------
  allTracks(): LibraryTrack[] {
    return [...data.tracks].sort(
      (a, b) =>
        byName(a.artist, b.artist) ||
        byName(a.album, b.album) ||
        (a.trackNumber ?? 999) - (b.trackNumber ?? 999) ||
        byName(a.title, b.title)
    )
  },
  track(id: number): LibraryTrack | null {
    return data.tracks.find((t) => t.id === id) ?? null
  },
  trackForPath(path: string): LibraryTrack | null {
    return data.tracks.find((t) => t.path === path) ?? null
  },
  videoIdsInLibrary(): Set<string> {
    return new Set(data.tracks.flatMap((t) => (t.videoId ? [t.videoId] : [])))
  },
  /** Adds a track, or updates the one already stored at this path. */
  upsertTrack(t: Omit<LibraryTrack, 'id' | 'addedAt'>): LibraryTrack {
    const existing = data.tracks.find((x) => x.path === t.path)
    if (existing) {
      Object.assign(existing, t)
      scheduleSave()
      return existing
    }
    const row: LibraryTrack = { ...t, id: data.nextTrackId++, addedAt: Date.now() }
    data.tracks.push(row)
    scheduleSave()
    return row
  },
  updateTrack(id: number, patch: Partial<LibraryTrack>): void {
    const t = data.tracks.find((x) => x.id === id)
    if (!t) return
    Object.assign(t, patch)
    scheduleSave()
  },
  removeTracks(ids: Set<number>): void {
    if (!ids.size) return
    data.tracks = data.tracks.filter((t) => !ids.has(t.id))
    for (const p of data.playlists) p.trackIds = p.trackIds.filter((id) => !ids.has(id))
    scheduleSave()
  },
  replaceInPlaylists(from: number, to: number): void {
    for (const p of data.playlists) {
      const has = p.trackIds.includes(to)
      p.trackIds = has
        ? p.trackIds.filter((id) => id !== from)
        : p.trackIds.map((id) => (id === from ? to : id))
    }
    scheduleSave()
  },

  // ---------- playlists ----------
  playlists(): Playlist[] {
    return [...data.playlists]
      .sort((a, b) => byName(a.name, b.name))
      .map((p) => ({
        id: p.id,
        name: p.name,
        createdAt: p.createdAt,
        trackCount: p.trackIds.length
      }))
  },
  createPlaylist(name: string): Playlist {
    const p: StoredPlaylist = {
      id: data.nextPlaylistId++,
      name,
      createdAt: Date.now(),
      trackIds: []
    }
    data.playlists.push(p)
    scheduleSave()
    return { id: p.id, name, createdAt: p.createdAt, trackCount: 0 }
  },
  renamePlaylist(id: number, name: string): void {
    const p = data.playlists.find((x) => x.id === id)
    if (p) p.name = name
    scheduleSave()
  },
  removePlaylist(id: number): void {
    data.playlists = data.playlists.filter((p) => p.id !== id)
    scheduleSave()
  },
  playlistTracks(id: number): number[] {
    return [...(data.playlists.find((p) => p.id === id)?.trackIds ?? [])]
  },
  /** Appends tracks that aren't in the playlist yet. */
  addToPlaylist(id: number, trackIds: number[]): void {
    const p = data.playlists.find((x) => x.id === id)
    if (!p) throw new Error('That playlist no longer exists.')
    for (const t of trackIds) if (!p.trackIds.includes(t)) p.trackIds.push(t)
    scheduleSave()
  },
  removeFromPlaylist(id: number, trackId: number): void {
    const p = data.playlists.find((x) => x.id === id)
    if (p) p.trackIds = p.trackIds.filter((t) => t !== trackId)
    scheduleSave()
  },

  // ---------- download queue ----------
  loadJobs(): DownloadJob[] {
    return data.jobs.map((j) => ({ ...j }))
  },
  saveJob(job: DownloadJob): void {
    const i = data.jobs.findIndex((j) => j.id === job.id)
    const copy = { ...job, speed: null, eta: null }
    if (i >= 0) data.jobs[i] = copy
    else data.jobs.push(copy)
    scheduleSave()
  },
  deleteJob(id: string): void {
    data.jobs = data.jobs.filter((j) => j.id !== id)
    scheduleSave()
  }
}
