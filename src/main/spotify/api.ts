import { net } from 'electron'
import type { SpotifyCollection, SpotifyTrack } from '../../shared/types'
import { accessToken } from './auth'
import { parseSpotifySource, toSpotifyTrack, type RawTrack } from './parse'

const API = 'https://api.spotify.com/v1'

/** GET from the Spotify Web API, waiting out rate limits, with errors that say what to do. */
async function get<T>(pathOrUrl: string, context = ''): Promise<T> {
  const url = pathOrUrl.startsWith('http') ? pathOrUrl : `${API}${pathOrUrl}`
  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await net.fetch(url, {
      headers: { Authorization: `Bearer ${await accessToken()}` }
    })
    if (res.status === 429) {
      const wait = Math.min(30, Number(res.headers.get('retry-after')) || 2 ** attempt)
      await new Promise((r) => setTimeout(r, wait * 1000))
      continue
    }
    if (res.ok) return (await res.json()) as T
    if (res.status === 404 && context === 'playlist') {
      throw new Error(
        'Spotify doesn’t let apps read its own playlists (like “Today’s Top Hits” or Discover Weekly). In Spotify, add those songs to a playlist of your own and import that one.'
      )
    }
    if (res.status === 404) throw new Error('Spotify couldn’t find that. Check the link.')
    if (res.status === 403) {
      throw new Error(
        'Spotify refused access. In your app on developer.spotify.com, open “User Management” and add the email of the Spotify account you signed in with.'
      )
    }
    throw new Error(`Spotify returned an error (HTTP ${res.status}).`)
  }
  throw new Error('Spotify is rate-limiting requests. Wait a minute and try again.')
}

interface Paging<T> {
  items: T[]
  next: string | null
  total: number
}

async function all<T>(first: string, context = ''): Promise<T[]> {
  const out: T[] = []
  let next: string | null = first
  for (let page = 0; next && page < 200; page++) {
    const p: Paging<T> = await get<Paging<T>>(next, context)
    out.push(...p.items)
    next = p.next
  }
  return out
}

const keepTracks = (items: { track: RawTrack | null }[]): SpotifyTrack[] =>
  items
    .map((i) => (i.track ? toSpotifyTrack(i.track) : null))
    .filter((t): t is SpotifyTrack => t !== null)

export async function myPlaylists(): Promise<SpotifyCollection[]> {
  interface RawPlaylist {
    id: string
    name: string
    owner?: { display_name?: string }
    images?: { url: string }[] | null
    tracks?: { total: number }
  }
  const [liked, lists] = await Promise.all([
    get<Paging<unknown>>('/me/tracks?limit=1'),
    all<RawPlaylist | null>('/me/playlists?limit=50')
  ])
  return [
    { kind: 'liked', id: 'liked', name: 'Liked Songs', total: liked.total },
    ...lists
      .filter((p): p is RawPlaylist => p !== null)
      .map((p) => ({
        kind: 'playlist' as const,
        id: p.id,
        name: p.name,
        owner: p.owner?.display_name,
        cover: p.images?.[0]?.url,
        total: p.tracks?.total ?? 0
      }))
  ]
}

export async function load(
  source: string
): Promise<{ collection: SpotifyCollection; tracks: SpotifyTrack[] }> {
  const src = parseSpotifySource(source)
  if (src.kind === 'liked') {
    const tracks = keepTracks(await all<{ track: RawTrack | null }>('/me/tracks?limit=50'))
    return {
      collection: { kind: 'liked', id: 'liked', name: 'Liked Songs', total: tracks.length },
      tracks
    }
  }
  if (src.kind === 'track') {
    const t = toSpotifyTrack(await get<RawTrack>(`/tracks/${src.id}`))
    if (!t) throw new Error('That Spotify item isn’t a song.')
    return {
      collection: { kind: 'track', id: src.id, name: t.title, cover: t.cover, total: 1 },
      tracks: [t]
    }
  }
  if (src.kind === 'album') {
    interface RawAlbum {
      name: string
      artists: { name: string }[]
      images?: { url: string }[]
      release_date?: string
      tracks: Paging<RawTrack>
    }
    const a = await get<RawAlbum>(`/albums/${src.id}`)
    const rest = a.tracks.next ? await all<RawTrack>(a.tracks.next) : []
    const album = {
      name: a.name,
      artists: a.artists,
      images: a.images,
      release_date: a.release_date
    }
    const tracks = [...a.tracks.items, ...rest]
      .map((t) => toSpotifyTrack({ ...t, album }))
      .filter((t): t is SpotifyTrack => t !== null)
    return {
      collection: {
        kind: 'album',
        id: src.id,
        name: a.name,
        owner: a.artists[0]?.name,
        cover: a.images?.[0]?.url,
        total: tracks.length
      },
      tracks
    }
  }
  const p = await get<{
    name: string
    owner?: { display_name?: string }
    images?: { url: string }[] | null
  }>(`/playlists/${src.id}?fields=name,owner(display_name),images`, 'playlist')
  const tracks = keepTracks(
    await all<{ track: RawTrack | null }>(
      `/playlists/${src.id}/tracks?limit=100&additional_types=track`,
      'playlist'
    )
  )
  return {
    collection: {
      kind: 'playlist',
      id: src.id,
      name: p.name,
      owner: p.owner?.display_name,
      cover: p.images?.[0]?.url,
      total: tracks.length
    },
    tracks
  }
}
