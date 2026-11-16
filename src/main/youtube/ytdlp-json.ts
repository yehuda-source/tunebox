import type { TrackRef } from '../../shared/types'
import { ytdlpCommand } from '../binaries/manager'
import { run } from '../proc'

interface YtdlpEntry {
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

export async function ytdlpJson(target: string, flat: boolean): Promise<YtdlpEntry> {
  const extra = flat ? ['--flat-playlist'] : ['--no-playlist']
  const { cmd, args, env } = ytdlpCommand(['-J', '--skip-download', ...extra, target])
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
