import { create } from 'zustand'
import type { LibraryTrack, Playlist, TrackRef } from '@shared/types'
import { SongIndex } from '@shared/songKey'

interface LibraryState {
  tracks: LibraryTrack[]
  byVideo: Map<string, LibraryTrack>
  byId: Map<number, LibraryTrack>
  /** Same song under a different video id (other album, compilation, upload). */
  songs: SongIndex<LibraryTrack>
  loaded: boolean
  playlists: Playlist[]
  load: () => Promise<void>
  loadPlaylists: () => Promise<void>
}

export const useLibrary = create<LibraryState>((set) => ({
  tracks: [],
  byVideo: new Map(),
  byId: new Map(),
  songs: new SongIndex(),
  loaded: false,
  playlists: [],
  load: async () => {
    const tracks = await window.api.library.tracks()
    const songs = new SongIndex<LibraryTrack>()
    for (const t of tracks) songs.add(t.title, t.artist, t)
    set({
      songs,
      tracks,
      loaded: true,
      byId: new Map(tracks.map((t) => [t.id, t])),
      byVideo: new Map(tracks.filter((t) => t.videoId).map((t) => [t.videoId!, t]))
    })
  },
  loadPlaylists: async () => set({ playlists: await window.api.playlists.list() })
}))

let timer: ReturnType<typeof setTimeout> | null = null
export function initLibraryStore(): void {
  void useLibrary.getState().load()
  void useLibrary.getState().loadPlaylists()
  window.api.on('library:changed', () => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      void useLibrary.getState().load()
      void useLibrary.getState().loadPlaylists()
    }, 300)
  })
}

export interface AlbumGroup {
  key: string
  album: string
  artist: string
  year: string | null
  tracks: LibraryTrack[]
  coverId: number | null
}

export function groupAlbums(tracks: LibraryTrack[]): AlbumGroup[] {
  const map = new Map<string, AlbumGroup>()
  for (const t of tracks) {
    const key = `${t.albumArtist}\u0000${t.album}`
    let g = map.get(key)
    if (!g) {
      g = { key, album: t.album, artist: t.albumArtist, year: t.year, tracks: [], coverId: null }
      map.set(key, g)
    }
    g.tracks.push(t)
    if (g.coverId == null && t.hasCover) g.coverId = t.id
  }
  for (const g of map.values())
    g.tracks.sort(
      (a, b) => (a.trackNumber ?? 999) - (b.trackNumber ?? 999) || a.title.localeCompare(b.title)
    )
  return [...map.values()].sort(
    (a, b) => a.artist.localeCompare(b.artist) || a.album.localeCompare(b.album)
  )
}

export const coverUrl = (id: number | null | undefined): string | undefined =>
  id == null ? undefined : `tunebox-media://cover/${id}`

/** The library copy of an online track: same video, or the same song from another album/upload. */
export function findLocal(
  t: TrackRef,
  state: Pick<LibraryState, 'byVideo' | 'songs'> = useLibrary.getState()
): LibraryTrack | undefined {
  return (
    state.byVideo.get(t.videoId) ?? state.songs.find(t.title, t.artists.join(', '), t.durationSec)
  )
}
