import type { TrackRef } from './types'
import { pickAlternative } from './songKey'
import { search } from './ytmusic'

/** YouTube blocks some uploads (often music videos) unless you're signed in or of age. */
export const SIGN_IN_PATTERN =
  /Please sign in|Sign in to confirm|age.restricted|inappropriate for some users|members-only|Join this channel/i

/**
 * Look for another upload of the same song: official audio first ("songs"), then videos.
 * Keeps the original's album context (album, track number) when it had one.
 */
export async function findAlternative(
  track: TrackRef,
  warn: (msg: string, err: unknown) => void = () => undefined
): Promise<TrackRef | null> {
  try {
    const r = await search(`${track.title} ${track.artists[0] ?? ''}`.trim())
    const alt = pickAlternative(track, [...r.songs, ...r.videos])
    if (!alt) return null
    if (!track.album) return alt
    return {
      ...alt,
      title: track.title,
      artists: track.artists,
      album: track.album,
      albumId: track.albumId,
      albumArtist: track.albumArtist,
      trackNumber: track.trackNumber,
      year: track.year ?? alt.year,
      thumbnail: track.thumbnail ?? alt.thumbnail
    }
  } catch (err) {
    warn(`Could not look for another upload of ${track.title}`, err)
    return null
  }
}
