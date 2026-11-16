// Recognise the same song across albums, compilations and video uploads, which YouTube gives
// different video ids. Matching is on normalized title + main artist, plus length when known.

const VIDEO_TAGS =
  /\s*[([]\s*(official\s+)?(music\s+)?(video|audio|lyrics?(\s+video)?|visuali[sz]er|hd|hq|4k(\s+remaster(ed)?)?|video\s+oficial|clip\s+officiel)\s*[)\]]/gi
const FEATURING = /\s*[([]?\s*\b(feat\.?|ft\.?|featuring)\s+[^)\]]*[)\]]?/gi

function clean(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // accents
    .toLowerCase()
    .replace(/[’‘`´]/g, "'")
    .replace(/[^\p{L}\p{N}\s']/gu, ' ')
    .replace(/'/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Main artist only: "A, B" / "A & B" / "A feat. B" → "a". */
export function mainArtist(artist: string): string {
  return clean(artist.split(/\s*(?:,|&|\bfeat\.?|\bft\.?|\bx\b|\/)\s*/i)[0] ?? '')
}

export function songKey(title: string, artist: string): string {
  const a = mainArtist(artist)
  let t = title.replace(VIDEO_TAGS, '').replace(FEATURING, '')
  // Video uploads are often titled "Artist - Song".
  const dash = t.match(/^(.+?)\s+[-–—]\s+(.+)$/)
  if (dash && mainArtist(dash[1]) === a) t = dash[2]
  return `${a}\u0000${clean(t)}`
}

export interface SongIndexEntry {
  durationSec?: number | null
}

/** A lookup of songs you already have, keyed by songKey. */
export class SongIndex<T extends SongIndexEntry> {
  private map = new Map<string, T[]>()

  add(title: string, artist: string, item: T): void {
    const key = songKey(title, artist)
    const list = this.map.get(key)
    if (list) list.push(item)
    else this.map.set(key, [item])
  }

  /** The existing copy of this song, if any. Lengths must agree within 3s when both are known. */
  find(title: string, artist: string, durationSec: number | null | undefined): T | undefined {
    const list = this.map.get(songKey(title, artist))
    if (!list) return undefined
    return list.find(
      (x) => !x.durationSec || !durationSec || Math.abs(x.durationSec - durationSec) <= 3
    )
  }
}

/** Keys a title could match under: as given, and without an "Anything - " prefix (e.g. "SHWEKEY - I Can Be"). */
function looseKeys(title: string, artist: string): Set<string> {
  const keys = new Set([songKey(title, artist)])
  const dash = title.match(/^.+?\s+[-–—]\s+(.+)$/)
  if (dash) keys.add(songKey(dash[1], artist))
  return keys
}

export interface AlternativeCandidate {
  videoId: string
  title: string
  artists: string[]
  durationSec?: number
}

/**
 * Another upload of the same song, for when YouTube blocks the original (e.g. a music video that
 * needs a sign-in while the official audio doesn't). Requires the same title and main artist,
 * so live versions, remixes, "2.0"s and covers never match. Lengths may differ a little because
 * videos often have intros.
 */
export function pickAlternative<T extends AlternativeCandidate>(
  original: AlternativeCandidate,
  candidates: T[],
  toleranceSec = 30
): T | undefined {
  const artist = original.artists.join(', ')
  const wanted = looseKeys(original.title, artist)
  return candidates.find((c) => {
    if (c.videoId === original.videoId) return false
    const keys = looseKeys(c.title, c.artists.join(', '))
    if (![...keys].some((k) => wanted.has(k))) return false
    if (!c.durationSec || !original.durationSec) return true
    return Math.abs(c.durationSec - original.durationSec) <= toleranceSec
  })
}
