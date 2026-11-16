import { join } from 'path'
import { safeName } from '../sanitize'
import type { TrackRef } from '../../shared/types'

/** Library layout: <library>/<Artist>/<Album>/<NN - >Title.<ext> */
export function libraryPath(libraryDir: string, track: TrackRef, ext: string): string {
  const artist = safeName(track.albumArtist || track.artists[0], 'Unknown Artist')
  const album = safeName(track.album, 'Singles')
  const num =
    track.album && track.trackNumber ? `${String(track.trackNumber).padStart(2, '0')} - ` : ''
  return join(libraryDir, artist, album, `${num}${safeName(track.title, 'Untitled')}.${ext}`)
}
