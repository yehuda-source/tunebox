import { create } from 'zustand'
import type { SpotifyCollection, SpotifyMatch, SpotifyStatus, SpotifyTrack } from '@shared/types'
import { toast } from './toast'

type Phase = 'idle' | 'loading' | 'matching' | 'review'

interface SpotifyState {
  status: SpotifyStatus | null
  playlists: SpotifyCollection[] | null
  phase: Phase
  collection: SpotifyCollection | null
  tracks: SpotifyTrack[]
  matches: SpotifyMatch[]
  /** Spotify track ids the user wants to download. */
  selected: Set<string>
  progress: { done: number; total: number }
  signingIn: boolean
}

export const useSpotify = create<SpotifyState>(() => ({
  status: null,
  playlists: null,
  phase: 'idle',
  collection: null,
  tracks: [],
  matches: [],
  selected: new Set(),
  progress: { done: 0, total: 0 },
  signingIn: false
}))

const set = useSpotify.setState
const get = useSpotify.getState

let listening = false
export async function initSpotify(): Promise<void> {
  if (!listening) {
    listening = true
    window.api.on('spotify:progress', (progress) => set({ progress }))
  }
  const status = await window.api.spotify.status()
  set({ status })
  if (status.signedIn && !get().playlists) void loadPlaylists()
}

export async function loadPlaylists(): Promise<void> {
  try {
    set({ playlists: await window.api.spotify.myPlaylists() })
  } catch (err) {
    toast.error('Could not load your Spotify playlists', err)
  }
}

export async function saveClientId(id: string): Promise<boolean> {
  try {
    set({ status: await window.api.spotify.setClientId(id), playlists: null })
    return true
  } catch (err) {
    toast.error('Could not save the Client ID', err)
    return false
  }
}

export async function signIn(): Promise<void> {
  set({ signingIn: true })
  try {
    const status = await window.api.spotify.signIn()
    set({ status })
    toast.success(`Connected to Spotify${status.user ? ` as ${status.user}` : ''}`)
    void loadPlaylists()
  } catch (err) {
    toast.error('Spotify sign-in failed', err)
  } finally {
    set({ signingIn: false })
  }
}

export async function signOut(): Promise<void> {
  set({ status: await window.api.spotify.signOut(), playlists: null })
}

/** Load a playlist/album/track (link, id or 'liked') and match it against YouTube Music. */
export async function open(source: string): Promise<void> {
  set({
    phase: 'loading',
    collection: null,
    matches: [],
    selected: new Set(),
    progress: { done: 0, total: 0 }
  })
  try {
    const { collection, tracks } = await window.api.spotify.load(source)
    if (!tracks.length) {
      toast.info('Nothing to import', 'That has no songs (local files and podcasts are skipped).')
      set({ phase: 'idle' })
      return
    }
    set({ collection, tracks, phase: 'matching', progress: { done: 0, total: tracks.length } })
    const matches = await window.api.spotify.match(tracks)
    set({
      matches,
      phase: 'review',
      // Confident and likely matches start ticked; guesses and songs you have don't.
      selected: new Set(
        matches.filter((m) => m.status === 'match' || m.status === 'check').map((m) => m.spotify.id)
      )
    })
  } catch (err) {
    toast.error('Could not load from Spotify', err)
    set({ phase: 'idle' })
  }
}

export function toggle(id: string): void {
  const selected = new Set(get().selected)
  if (selected.has(id)) selected.delete(id)
  else selected.add(id)
  set({ selected })
}

export function selectMany(ids: string[], on: boolean): void {
  const selected = new Set(get().selected)
  for (const id of ids) {
    if (on) selected.add(id)
    else selected.delete(id)
  }
  set({ selected })
}

export function reset(): void {
  set({ phase: 'idle', collection: null, tracks: [], matches: [], selected: new Set() })
}

export async function importSelected(playlistName: string | null): Promise<boolean> {
  const { matches, selected } = get()
  // Songs you already have still go into the new playlist.
  const chosen = matches.filter(
    (m) => m.status === 'library' || (selected.has(m.spotify.id) && m.candidate)
  )
  try {
    const r = await window.api.spotify.import(chosen, playlistName)
    const parts = [`${r.queued} song${r.queued === 1 ? '' : 's'} downloading`]
    if (r.skipped) parts.push(`${r.skipped} already in your library or queue`)
    toast.success(
      r.playlistId ? `Playlist “${playlistName}” created` : 'Import started',
      parts.join(', ')
    )
    return true
  } catch (err) {
    toast.error('Import failed', err)
    return false
  }
}
