import { join } from 'path'
import { safeName } from '../sanitize'
import type { TrackRef } from '../../shared/types'

/**
 * Library layout: <library>/<Artist>/<Album>/<NN - >Title.<ext>
 * Podcast/channel episodes: <library>/Podcasts/<Show>/<YYYY-MM-DD - >Title.<ext>
 */
export function libraryPath(
  libraryDir: string,
  track: TrackRef,
  ext: string,
  date?: string
): string {
  if (track.show) {
    const prefix = date ? `${date} - ` : ''
    return join(
      libraryDir,
      'Podcasts',
      safeName(track.show, 'Podcast'),
      `${prefix}${safeName(track.title, 'Untitled')}.${ext}`
    )
  }
  const artist = safeName(track.albumArtist || track.artists[0], 'Unknown Artist')
  const album = safeName(track.album, 'Singles')
  const num =
    track.album && track.trackNumber ? `${String(track.trackNumber).padStart(2, '0')} - ` : ''
  return join(libraryDir, artist, album, `${num}${safeName(track.title, 'Untitled')}.${ext}`)
}

/**
 * Pick a free destination. Another song that already has (or is about to get) this path keeps it,
 * and this one gets its video id appended. Re-downloading the same video overwrites its own file.
 */
export function chooseDestination(
  dest: string,
  videoId: string,
  exists: (p: string) => boolean,
  ownerOf: (p: string) => string | null,
  reserved: Map<string, string>
): string {
  const taken = (p: string): boolean => {
    const claim = reserved.get(p)
    if (claim) return claim !== videoId
    return exists(p) && ownerOf(p) !== videoId
  }
  if (!taken(dest)) return dest
  return dest.replace(/(\.\w+)$/, ` [${videoId}]$1`)
}

/** yt-dlp's upload_date "20261116" → "2026-11-16" (undefined when unknown). */
export function formatUploadDate(raw: string | undefined | null): string | undefined {
  const m = raw?.match(/^(\d{4})(\d{2})(\d{2})$/)
  return m ? `${m[1]}-${m[2]}-${m[3]}` : undefined
}
