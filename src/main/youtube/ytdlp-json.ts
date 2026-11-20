import type { ShowDetails, ShowKind, TrackRef } from '../../shared/types'
import { ytdlpCommand } from '../binaries/manager'
import { run } from '../proc'
import { isListedEpisode } from './entries'

interface YtdlpEntry {
  description?: string
  playlist_count?: number
  view_count?: number
  id: string
  title?: string
  track?: string
  artist?: string
  artists?: string[]
  creator?: string
  channel?: string
  uploader?: string
  album?: string
  album_artist?: string
  track_number?: number
  release_year?: number
  duration?: number
  thumbnail?: string
  thumbnails?: { url: string; width?: number }[]
  entries?: YtdlpEntry[]
  _type?: string
}

export function entryToTrack(e: YtdlpEntry, fallback: Partial<TrackRef> = {}): TrackRef {
  const artist = e.artists?.length ? e.artists : e.artist ? e.artist.split(/,\s*/) : null
  const channel = (e.channel ?? e.uploader ?? '').replace(/ - Topic$/, '')
  const thumbs = e.thumbnails ?? []
  return {
    videoId: e.id,
    title: e.track ?? e.title ?? 'Unknown title',
    artists: artist ?? fallback.artists ?? (channel ? [channel] : ['Unknown artist']),
    album: e.album ?? fallback.album,
    albumArtist: e.album_artist ?? fallback.albumArtist,
    trackNumber: e.track_number ?? fallback.trackNumber,
    year: e.release_year ? String(e.release_year) : fallback.year,
    durationSec: e.duration ?? undefined,
    thumbnail: e.thumbnail ?? thumbs.at(-1)?.url ?? `https://i.ytimg.com/vi/${e.id}/hqdefault.jpg`
  }
}

export async function ytdlpJson(
  target: string,
  flat: boolean,
  more: string[] = []
): Promise<YtdlpEntry> {
  const extra = flat ? ['--flat-playlist'] : ['--no-playlist']
  const { cmd, args, env } = ytdlpCommand(['-J', '--skip-download', ...extra, ...more, target])
  const r = await run(cmd, args, { env, timeoutMs: 120000 })
  return JSON.parse(r.stdout) as YtdlpEntry
}

export async function ytdlpSearch(query: string): Promise<TrackRef[]> {
  const data = await ytdlpJson(`ytsearch20:${query}`, true)
  return (data.entries ?? []).filter((e) => e.id).map((e) => entryToTrack(e))
}

/** Turn any YouTube / YouTube Music link (video, playlist, album) into tracks. */
export async function resolveUrl(url: string): Promise<TrackRef[]> {
  if (!/^https?:\/\/([a-z0-9-]+\.)?(youtube\.com|youtu\.be)\//i.test(url.trim())) {
    throw new Error('That does not look like a YouTube or YouTube Music link.')
  }
  const isList = /[?&]list=|\/playlist|\/browse\//.test(url)
  const data = await ytdlpJson(url.trim(), isList)
  if (!data.entries) return [entryToTrack(data)]
  const album = data.album ?? data.title?.replace(/^Album - /, '')
  const albumArtist = (data.channel ?? data.uploader ?? '').replace(/ - Topic$/, '') || undefined
  const isAlbum = /OLAK5uy_|\/browse\/MPREb/.test(url)
  return data.entries
    .filter((e) => e.id)
    .map((e, i) =>
      entryToTrack(
        e,
        isAlbum
          ? {
              album,
              albumArtist,
              trackNumber: i + 1,
              artists: albumArtist ? [albumArtist] : undefined
            }
          : {}
      )
    )
}

/**
 * A podcast (YouTube playlist) or channel with its newest `limit` episodes. Both list newest
 * first; dates aren't available in this quick listing and are read when an episode downloads.
 */
export async function loadShow(kind: ShowKind, id: string, limit = 100): Promise<ShowDetails> {
  if (!/^[\w-]+$/.test(id)) throw new Error('Invalid podcast or channel id.')
  const url =
    kind === 'podcast'
      ? `https://www.youtube.com/playlist?list=${id}`
      : `https://www.youtube.com/channel/${id}/videos`
  // Shows often hold many private placeholders (17 of the latest 100 for one big podcast), which
  // are skipped below. Fetch extra so a page still fills up, plus one to know if there's more.
  const fetchCount = Math.ceil(limit * 1.5) + 1
  const data = await ytdlpJson(url, true, ['--playlist-end', String(fetchCount)])
  const raw = data.entries ?? []
  const author = (data.channel ?? data.uploader ?? '').replace(/ - Topic$/, '') || undefined
  const title = (data.title ?? '').replace(/ - Videos$/, '') || author || 'Untitled'
  const show = kind === 'podcast' ? title : (author ?? title)
  const entries = raw.filter(isListedEpisode)
  const thumbs = data.thumbnails ?? []
  return {
    kind,
    id,
    title,
    author,
    subtitle: kind === 'podcast' ? 'Podcast' : 'Channel',
    description: data.description || undefined,
    thumbnail: [...thumbs].sort((a, b) => (b.width ?? 0) - (a.width ?? 0))[0]?.url,
    total: kind === 'podcast' ? (data.playlist_count ?? null) : null,
    // More if there are listed episodes past this page, or the fetch was cut off at its limit.
    hasMore: entries.length > limit || raw.length >= fetchCount,
    episodes: entries.slice(0, limit).map((e) => ({
      videoId: e.id,
      title: e.title ?? 'Untitled',
      artists: [author ?? show],
      durationSec: e.duration ?? undefined,
      thumbnail: `https://i.ytimg.com/vi/${e.id}/hqdefault.jpg`,
      show
    }))
  }
}
