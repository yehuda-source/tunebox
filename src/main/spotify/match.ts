import type { SpotifyImportResult, SpotifyMatch, SpotifyTrack, TrackRef } from '../../shared/types'
import { SongIndex, matchSong } from '../../shared/songKey'
import { searchTracks } from '../youtube/search'
import { libraryDb } from '../library/library'
import { enqueue } from '../downloads/queue'
import { emit } from '../events'
import log from '../log'

const CONCURRENCY = 4

/** Find each Spotify track in the library or on YouTube Music. */
export async function matchTracks(tracks: SpotifyTrack[]): Promise<SpotifyMatch[]> {
  const library = new SongIndex<{ id: number; durationSec: number | null }>()
  for (const t of libraryDb().allTracks()) library.add(t.title, t.artist, t)

  const results: SpotifyMatch[] = new Array(tracks.length)
  let next = 0
  let done = 0
  const worker = async (): Promise<void> => {
    while (next < tracks.length) {
      const i = next++
      results[i] = await matchOne(tracks[i], library)
      done++
      if (done % 3 === 0 || done === tracks.length)
        emit('spotify:progress', { done, total: tracks.length })
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, tracks.length) }, worker))
  return results
}

async function matchOne(
  sp: SpotifyTrack,
  library: SongIndex<{ id: number; durationSec: number | null }>
): Promise<SpotifyMatch> {
  const have = library.find(sp.title, sp.artists.join(', '), sp.durationSec)
  if (have) return { spotify: sp, status: 'library', libraryTrackId: have.id }
  try {
    const candidates = await searchTracks(`${sp.title} ${sp.artists[0] ?? ''}`)
    const found = matchSong(sp, candidates)
    if (found) return { spotify: sp, status: found.status, candidate: found.candidate }
    // Show the top result as a guess; it starts unticked.
    return { spotify: sp, status: 'missing', candidate: candidates[0] }
  } catch (err) {
    log.warn(`Could not search for ${sp.title}`, err)
    return { spotify: sp, status: 'missing' }
  }
}

/** Spotify's information is better for tags (exact album, number, year, square cover). */
function toTrackRef(m: SpotifyMatch): TrackRef {
  const sp = m.spotify
  return {
    videoId: m.candidate!.videoId,
    title: sp.title,
    artists: sp.artists,
    album: sp.album || undefined,
    albumArtist: sp.albumArtist || undefined,
    trackNumber: sp.album ? (sp.trackNumber ?? undefined) : undefined,
    year: sp.year ?? undefined,
    durationSec: m.candidate!.durationSec ?? sp.durationSec,
    thumbnail: sp.cover ?? m.candidate!.thumbnail
  }
}

/** Queue the chosen matches; optionally create a TuneBox playlist in the same order. */
export function importMatches(
  matches: SpotifyMatch[],
  playlistName: string | null
): SpotifyImportResult {
  const db = libraryDb()
  const playlist = playlistName?.trim() ? db.createPlaylist(playlistName.trim()) : null
  const toDownload: TrackRef[] = []
  const positions: number[] = []
  matches.forEach((m, position) => {
    if (m.status === 'library' && m.libraryTrackId != null) {
      if (playlist) db.addToPlaylistAt(playlist.id, m.libraryTrackId, position)
    } else if (m.candidate) {
      toDownload.push(toTrackRef(m))
      positions.push(position)
    }
  })
  const result = enqueue(
    toDownload,
    playlistName?.trim() ? `Spotify: ${playlistName.trim()}` : 'Spotify import',
    playlist ? { id: playlist.id, positions } : undefined
  )
  if (playlist) emit('library:changed', null)
  return { ...result, playlistId: playlist?.id ?? null }
}
