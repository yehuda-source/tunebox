// Deterministic fake data for the browser preview. Deliberately includes awkward cases:
// Hebrew/RTL titles, very long names, missing albums/durations/covers, duplicates.
import type {
  AlbumDetails,
  ArtistDetails,
  DownloadJob,
  LibraryTrack,
  SearchResults,
  ToolStatus,
  TrackRef
} from '@shared/types'

let seed = 7
const rand = (): number => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646
const pick = <T>(a: T[]): T => a[Math.floor(rand() * a.length)]

const ARTISTS = [
  'Yaakov Shwekey',
  'Avraham Fried',
  'Daft Punk',
  'Mordechai Ben David',
  'ישי ריבו',
  'Radiohead',
  'A Very Long Artist Name That Keeps Going And Going Feat. Many Guests'
]
const ALBUMS = [
  'The Music of Shabbos',
  'Random Access Memories',
  'שירי נשמה',
  'OK Computer',
  'Live in Jerusalem (Deluxe 25th Anniversary Remastered Edition with Bonus Tracks)',
  'Singles'
]
const WORDS = [
  'Shabbos',
  'Light',
  'אור',
  'Within',
  'Kah Ribon',
  'Nishmas',
  'Echoes',
  'Lecha Dodi',
  'שלום',
  'Paranoid',
  'Android',
  'Home',
  'Yerushalayim',
  'Forever'
]

const title = (i: number): string => {
  if (i % 41 === 0)
    return 'An Extraordinarily Long Song Title (feat. Absolutely Everybody) [Official Live Version From The Concert Of The Century]'
  if (i % 17 === 0) return 'מזמור שיר ליום השבת'
  return `${pick(WORDS)} ${pick(WORDS)}`.trim()
}

export const COLORS = ['#7c3aed', '#db2777', '#0891b2', '#16a34a', '#ea580c', '#4f46e5', '#ca8a04']

/** A small SVG cover so images work offline. */
export function coverSvg(label: string, i: number): string {
  const c = COLORS[i % COLORS.length]
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c}"/><stop offset="1" stop-color="#111"/></linearGradient></defs><rect width="300" height="300" fill="url(#g)"/><text x="20" y="270" font-family="sans-serif" font-size="28" fill="white" opacity="0.85">${label.slice(0, 14).replace(/[<&>]/g, '')}</text></svg>`
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

export function makeLibrary(n: number): LibraryTrack[] {
  seed = 7
  const tracks: LibraryTrack[] = []
  for (let i = 1; i <= n; i++) {
    const artist = pick(ARTISTS)
    const album = i % 23 === 0 ? 'Unknown Album' : pick(ALBUMS)
    tracks.push({
      id: i,
      path: `/home/user/Music/TuneBox/${artist}/${album}/${String((i % 14) + 1).padStart(2, '0')} - ${title(i)}.mp3`,
      title: title(i),
      artist,
      album,
      albumArtist: artist,
      trackNumber: i % 9 === 0 ? null : (i % 14) + 1,
      year: i % 5 === 0 ? null : String(1995 + (i % 30)),
      durationSec: i % 31 === 0 ? null : 90 + Math.floor(rand() * 400),
      videoId: `vid${String(i).padStart(8, '0')}`,
      hasCover: i % 7 !== 0,
      addedAt: Date.now() - i * 3_600_000
    })
  }
  return tracks
}

const ref = (i: number, extra: Partial<TrackRef> = {}): TrackRef => ({
  videoId: `yt${String(i).padStart(9, '0')}`,
  title: title(i),
  artists: i % 6 === 0 ? [pick(ARTISTS), pick(ARTISTS)] : [pick(ARTISTS)],
  album: i % 4 === 0 ? undefined : pick(ALBUMS),
  albumId: i % 4 === 0 ? undefined : `MPREb_album${i % 6}`,
  durationSec: i % 10 === 0 ? undefined : 120 + Math.floor(rand() * 300),
  thumbnail: i % 8 === 0 ? undefined : coverSvg(title(i), i),
  ...extra
})

export function makeSearch(q: string): SearchResults {
  seed = q.length * 31 + 3
  if (/^zzz|nothing/i.test(q))
    return { query: q, songs: [], albums: [], artists: [], videos: [], source: 'ytmusic' }
  return {
    query: q,
    songs: Array.from({ length: 20 }, (_, i) => ref(i + 1)),
    albums: Array.from({ length: 12 }, (_, i) => ({
      browseId: `MPREb_album${i}`,
      title: pick(ALBUMS),
      artist: pick(ARTISTS),
      year: String(2000 + i),
      kind: i % 3 === 0 ? 'single' : 'album',
      thumbnail: i % 5 === 4 ? undefined : coverSvg(`Album ${i}`, i)
    })),
    artists: Array.from({ length: 6 }, (_, i) => ({
      channelId: `UCartist${i}`,
      name: ARTISTS[i % ARTISTS.length],
      subtitle: `Artist • ${(i + 1) * 3}.1M monthly audience`,
      thumbnail: coverSvg(ARTISTS[i % ARTISTS.length], i + 2)
    })),
    videos: Array.from({ length: 10 }, (_, i) =>
      ref(i + 100, { album: undefined, albumId: undefined })
    ),
    source: /fallback/i.test(q) ? 'ytdlp' : 'ytmusic'
  }
}

export function makeAlbum(id: string): AlbumDetails {
  seed = id.length * 13
  const n = id.endsWith('0') ? 1 : 14
  const albumTitle = pick(ALBUMS)
  const artist = pick(ARTISTS)
  const thumb = coverSvg(albumTitle, id.length)
  return {
    browseId: id,
    title: albumTitle,
    artist,
    year: '2013',
    kind: n === 1 ? 'single' : 'album',
    subtitle: `Album • 2013 • ${n} songs`,
    thumbnail: thumb,
    tracks: Array.from({ length: n }, (_, i) =>
      ref(i + 300, {
        album: albumTitle,
        albumId: id,
        albumArtist: artist,
        trackNumber: i + 1,
        thumbnail: thumb
      })
    )
  }
}

export function makeArtist(id: string): ArtistDetails {
  seed = id.length * 17
  const name = ARTISTS[Number(id.replace(/\D/g, '') || 0) % ARTISTS.length]
  return {
    channelId: id,
    name,
    subtitle: 'Artist • 1.2M monthly audience',
    description:
      'A fake artist biography for the preview.\n\nIt has several paragraphs so the About section can be checked for wrapping, long lines and spacing. '.repeat(
        3
      ),
    thumbnail: coverSvg(name, 3),
    banner: coverSvg(name, 4),
    topSongs: Array.from({ length: 10 }, (_, i) => ref(i + 500)),
    albums: Array.from({ length: 36 }, (_, i) => ({
      browseId: `MPREb_a${i}`,
      title: `${pick(ALBUMS)} ${i + 1}`,
      artist: name,
      year: String(1990 + i),
      kind: 'album',
      thumbnail: coverSvg(`A${i}`, i)
    })),
    singles: Array.from({ length: 12 }, (_, i) => ({
      browseId: `MPREb_s${i}`,
      title: `${pick(WORDS)}`,
      artist: name,
      year: String(2015 + i),
      kind: 'single',
      thumbnail: coverSvg(`S${i}`, i + 1)
    }))
  }
}

export function makeJobs(): DownloadJob[] {
  const base = Date.now() - 600_000
  const statuses: DownloadJob['status'][] = [
    'downloading',
    'downloading',
    'processing',
    'queued',
    'queued',
    'queued',
    'done',
    'done',
    'error',
    'canceled'
  ]
  return statuses.map((status, i) => ({
    id: `job${i}`,
    track: ref(i + 700),
    status,
    progress:
      status === 'done'
        ? 1
        : status === 'downloading'
          ? ([0, 0.42][i] ?? 0.42)
          : status === 'processing'
            ? 0.97
            : 0,
    speed: status === 'downloading' ? 2_400_000 : null,
    eta: status === 'downloading' ? 12 : null,
    error:
      status === 'error'
        ? 'YouTube wants you to sign in. Turn on Settings → YouTube sign-in, then retry.'
        : undefined,
    attempts: status === 'error' ? 3 : 1,
    createdAt: base + i * 1000,
    batch: i < 5 ? 'Yaakov Shwekey — The Music of Shabbos' : undefined
  }))
}

export function makeTools(scenario: string): ToolStatus {
  const broken = scenario === 'broken'
  return {
    ytdlp: broken
      ? { path: null, version: null, source: 'missing' }
      : { path: '/home/user/.config/TuneBox/bin/yt-dlp', version: '2026.10.26', source: 'managed' },
    ffmpeg: {
      path: '/opt/TuneBox/resources/bin/ffmpeg',
      version: '7.0.2-static',
      source: 'bundled'
    },
    jsRuntime: { mode: 'electron', detail: 'Built-in (Node 24.22.2 via Electron)' },
    selfTest: broken
      ? {
          ok: false,
          message: 'YouTube wants you to sign in. Turn on Settings → YouTube sign-in, then retry.',
          at: Date.now()
        }
      : {
          ok: true,
          message: 'yt-dlp can reach YouTube and solve its JS challenges.',
          at: Date.now()
        },
    busy: null,
    lastUpdateCheck: Date.now() - 3_600_000,
    latestYtdlp: '2026.10.26'
  }
}
