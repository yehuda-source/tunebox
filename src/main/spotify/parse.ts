// Pure helpers for Spotify data (no Electron), so they can be unit tested.
import type { SpotifyTrack } from '../../shared/types'

export type SpotifySource = { kind: 'liked' } | { kind: 'playlist' | 'album' | 'track'; id: string }

/** Accepts open.spotify.com links (with or without /intl-xx/), spotify: URIs, bare playlist ids and "liked". */
export function parseSpotifySource(input: string): SpotifySource {
  const s = input.trim()
  if (/^liked( songs)?$/i.test(s) || /open\.spotify\.com\/collection\/tracks/.test(s))
    return { kind: 'liked' }
  const m =
    s.match(
      /open\.spotify\.com\/(?:intl-[a-z-]+\/)?(?:embed\/)?(playlist|album|track)\/([A-Za-z0-9]{22})/
    ) ?? s.match(/^spotify:(playlist|album|track):([A-Za-z0-9]{22})$/)
  if (m) return { kind: m[1] as 'playlist' | 'album' | 'track', id: m[2] }
  if (/^[A-Za-z0-9]{22}$/.test(s)) return { kind: 'playlist', id: s }
  if (/spotify\.link|spoti\.fi/.test(s)) {
    throw new Error(
      'Short spotify.link links can’t be read. In Spotify use Share → Copy link to playlist/album.'
    )
  }
  throw new Error('That doesn’t look like a Spotify playlist, album or song link.')
}

export interface RawTrack {
  id: string | null
  name: string
  type?: string
  is_local?: boolean
  duration_ms: number
  track_number?: number
  artists: { name: string }[]
  album?: {
    name: string
    artists?: { name: string }[]
    images?: { url: string }[]
    release_date?: string
  }
}

/** Spotify track → our shape. Local files and podcast episodes are skipped (null). */
export function toSpotifyTrack(t: RawTrack): SpotifyTrack | null {
  if (!t || t.is_local || !t.id || (t.type && t.type !== 'track')) return null
  const artists = t.artists.map((a) => a.name).filter(Boolean)
  return {
    id: t.id,
    title: t.name,
    artists: artists.length ? artists : ['Unknown Artist'],
    album: t.album?.name ?? '',
    albumArtist: t.album?.artists?.[0]?.name ?? artists[0] ?? '',
    trackNumber: t.track_number ?? null,
    year: t.album?.release_date?.slice(0, 4) ?? null,
    durationSec: Math.round(t.duration_ms / 1000),
    cover: t.album?.images?.[0]?.url
  }
}
