import { Innertube, Parser } from 'youtubei.js'
import type {
  AlbumDetails,
  AlbumRef,
  ArtistDetails,
  ArtistRef,
  SearchResults,
  TrackRef
} from '../../shared/types'
import { ytdlpSearch } from './ytdlp-json'
import log from '../log'

/* eslint-disable @typescript-eslint/no-explicit-any */
// youtubei.js node types are very loose; mapping is done defensively with `any`.

// youtubei.js's default handler for unparseable YouTube responses reads its own package.json
// "bugs" field, which electron-builder strips when packaging, so a harmless parse warning
// crashed the whole request. Log it instead; the rest of the response still parses.
Parser.setParserErrorHandler(({ classname, ...ctx }) => {
  log.debug(`youtubei.js could not parse ${classname} (${ctx.error_type})`)
})

let client: Promise<Innertube> | null = null

function yt(): Promise<Innertube> {
  if (!client) {
    client = Innertube.create({ retrieve_player: false, generate_session_locally: true }).catch(
      (err) => {
        client = null
        throw err
      }
    )
  }
  return client
}

/** Retry once with a fresh session; YouTube occasionally rejects stale ones. */
async function withClient<T>(fn: (c: Innertube) => Promise<T>): Promise<T> {
  try {
    return await fn(await yt())
  } catch (err) {
    log.warn('YouTube Music request failed, retrying with a new session', err)
    client = null
    return fn(await yt())
  }
}

const text = (v: any): string =>
  v == null ? '' : typeof v === 'string' ? v : (v.toString?.() ?? '')

/** googleusercontent thumbnails can be resized by rewriting the size suffix. */
export function bigThumb(url?: string, size = 544): string | undefined {
  if (!url) return undefined
  if (/googleusercontent\.com|ggpht\.com/.test(url))
    return url.replace(/=w\d+-h\d+[^&]*$/, `=w${size}-h${size}-l90-rj`)
  return url
}

function bestThumb(list: any): string | undefined {
  const arr: any[] = Array.isArray(list) ? list : (list?.contents ?? [])
  if (!arr.length) return undefined
  const best = [...arr].sort((a, b) => (b.width ?? 0) - (a.width ?? 0))[0]
  return bigThumb(best?.url)
}

const names = (list: any): string[] =>
  Array.isArray(list) ? list.map((a) => text(a.name)).filter(Boolean) : []

function mapSong(it: any, extra: Partial<TrackRef> = {}): TrackRef | null {
  if (!it?.id) return null
  const artists = names(it.artists).length
    ? names(it.artists)
    : names(it.authors).length
      ? names(it.authors)
      : it.author?.name
        ? [text(it.author.name)]
        : (extra.artists ?? [])
  return {
    videoId: it.id,
    title: text(it.title) || 'Unknown title',
    artists: artists.length ? artists : ['Unknown artist'],
    album: it.album?.name ? text(it.album.name) : extra.album,
    albumId: it.album?.id ?? extra.albumId,
    albumArtist: extra.albumArtist,
    durationSec: it.duration?.seconds || undefined,
    thumbnail: bestThumb(it.thumbnails ?? it.thumbnail) ?? extra.thumbnail,
    trackNumber: extra.trackNumber,
    year: extra.year
  }
}

function mapAlbum(it: any): AlbumRef | null {
  if (!it?.id) return null
  return {
    browseId: it.id,
    title: text(it.title) || 'Unknown album',
    artist: text(it.author?.name) || names(it.artists)[0] || '',
    year: it.year ? String(it.year) : undefined,
    thumbnail: bestThumb(it.thumbnails ?? it.thumbnail),
    kind: it.item_type ?? undefined
  }
}

function mapArtist(it: any): ArtistRef | null {
  if (!it?.id) return null
  return {
    channelId: it.id,
    name: text(it.name ?? it.title) || 'Unknown artist',
    thumbnail: bestThumb(it.thumbnails ?? it.thumbnail),
    subtitle: text(it.subtitle) || undefined
  }
}

const compact = <T>(arr: (T | null)[]): T[] => arr.filter((x): x is T => x !== null)

async function shelf(
  c: Innertube,
  q: string,
  type: 'song' | 'album' | 'artist' | 'video'
): Promise<any[]> {
  const res: any = await c.music.search(q, { type })
  return res.contents?.flatMap((s: any) => s.contents ?? []) ?? []
}

export async function search(q: string): Promise<SearchResults> {
  const query = q.trim()
  try {
    return await withClient(async (c) => {
      const [songs, albums, artists, videos] = await Promise.all([
        shelf(c, query, 'song'),
        shelf(c, query, 'album'),
        shelf(c, query, 'artist'),
        shelf(c, query, 'video')
      ])
      return {
        query,
        songs: compact(songs.map((s) => mapSong(s))),
        albums: compact(albums.map(mapAlbum)),
        artists: compact(artists.map(mapArtist)),
        videos: compact(videos.map((s) => mapSong(s))),
        source: 'ytmusic' as const
      }
    })
  } catch (err) {
    log.warn('YouTube Music search failed, falling back to yt-dlp', err)
    return {
      query,
      songs: await ytdlpSearch(query),
      albums: [],
      artists: [],
      videos: [],
      source: 'ytdlp'
    }
  }
}

/** Songs and videos only (2 requests instead of 4), for matching many tracks quickly. */
export async function searchTracks(q: string): Promise<TrackRef[]> {
  return withClient(async (c) => {
    const [songs, videos] = await Promise.all([shelf(c, q, 'song'), shelf(c, q, 'video')])
    return compact<TrackRef>([...songs, ...videos].map((s) => mapSong(s)))
  })
}

export async function suggest(q: string): Promise<string[]> {
  if (!q.trim()) return []
  try {
    const sections: any[] = await withClient((c) => c.music.getSearchSuggestions(q))
    return sections
      .flatMap((s) => s.contents ?? [])
      .map((s: any) => text(s.suggestion))
      .filter(Boolean)
      .slice(0, 8)
  } catch {
    return []
  }
}

export async function album(browseId: string): Promise<AlbumDetails> {
  return withClient(async (c) => {
    const a: any = await c.music.getAlbum(browseId)
    const h = a.header ?? {}
    const title = text(h.title) || 'Unknown album'
    const artist = text(h.strapline_text_one) || text(h.author?.name) || ''
    const subtitle = text(h.subtitle)
    const year = subtitle.match(/\b(19|20)\d{2}\b/)?.[0]
    const thumbnail = bestThumb(h.thumbnail)
    const tracks = compact<TrackRef>(
      (a.contents ?? []).map((t: any, i: number) =>
        mapSong(t, {
          album: title,
          albumId: browseId,
          albumArtist: artist,
          artists: artist ? [artist] : undefined,
          trackNumber: Number(text(t.index)) || i + 1,
          thumbnail,
          year
        })
      )
    ).map((t: TrackRef) => ({ ...t, album: title, albumId: browseId, thumbnail, year }))
    return {
      browseId,
      title,
      artist,
      year,
      thumbnail,
      subtitle: [subtitle, text(h.second_subtitle)].filter(Boolean).join(' • '),
      kind: subtitle.split('•')[0]?.trim().toLowerCase(),
      tracks
    }
  })
}

/**
 * The artist page only shows the first 10 albums/singles. Follow the section's "More" link to the
 * discography page (and its continuation pages) to get every release.
 */
async function fullShelf(c: Innertube, section: any): Promise<AlbumRef[]> {
  const preview = compact<AlbumRef>((section?.contents ?? []).map(mapAlbum))
  const endpoint = section?.header?.more_content?.endpoint ?? section?.header?.endpoint
  if (!endpoint?.payload?.browseId) return preview
  try {
    const res: any = await endpoint.call(c.actions, { client: 'YTMUSIC', parse: true })
    const items: any[] = [...(res.contents_memo?.get('MusicTwoRowItem') ?? [])]
    let continuation: string | undefined = res.contents_memo?.get('Grid')?.[0]?.continuation
    for (let page = 0; continuation && page < 20; page++) {
      const more: any = await c.actions.execute('/browse', {
        continuation,
        client: 'YTMUSIC',
        parse: true
      })
      items.push(
        ...(more.contents_memo?.get('MusicTwoRowItem') ??
          more.continuation_contents?.contents ??
          [])
      )
      continuation =
        more.continuation_contents?.continuation ??
        more.contents_memo?.get('Grid')?.[0]?.continuation
    }
    const all = compact<AlbumRef>(items.map(mapAlbum))
    const seen = new Set<string>()
    const unique = all.filter((a) => !seen.has(a.browseId) && seen.add(a.browseId))
    return unique.length >= preview.length ? unique : preview
  } catch (err) {
    log.warn('Could not load the full discography, using the artist page preview', err)
    return preview
  }
}

export async function artist(channelId: string): Promise<ArtistDetails> {
  return withClient(async (c) => {
    const a: any = await c.music.getArtist(channelId)
    const h = a.header ?? {}
    const sections: any[] = a.sections ?? []
    const byTitle = (re: RegExp): any =>
      sections.find((s) => re.test(text(s.header?.title ?? s.title)))
    const top = byTitle(/top songs|songs/i)
    const albums = byTitle(/^albums/i)
    const singles = byTitle(/singles/i)
    return {
      channelId,
      name: text(h.title) || 'Unknown artist',
      description: text(h.description) || undefined,
      thumbnail: bestThumb(h.thumbnail),
      banner: bestThumb(h.thumbnail)?.replace(/=w\d+-h\d+[^&]*$/, '=w1600-h600-p-l90-rj'),
      topSongs: compact((top?.contents ?? []).map((s: any) => mapSong(s))),
      albums: await fullShelf(c, albums),
      singles: await fullShelf(c, singles)
    }
  })
}
