import type { ArtistRef, SearchResults, ShowRef } from '@shared/types'

/** "6.96M subscribers" / "66.1M monthly audience" / "1.5K subscribers" → a number (0 if none). */
export function audience(text: string | undefined): number {
  const m = text?.match(/([\d.,]+)\s*([KMB])?\s*(subscribers|monthly audience|monthly listeners)/i)
  if (!m) return 0
  const n = parseFloat(m[1].replace(/,/g, ''))
  const mult = { K: 1e3, M: 1e6, B: 1e9 }[(m[2] ?? '').toUpperCase() as 'K' | 'M' | 'B'] ?? 1
  return Math.round(n * mult)
}

const norm = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()

export type Top = { kind: 'artist'; artist: ArtistRef } | { kind: 'show'; show: ShowRef }

/**
 * The best "Top result": among the first artist and the channels/podcasts named exactly like the
 * query, the one with the biggest audience. So "ben shapiro" shows his 7M-subscriber channel, not a
 * small music artist with the same name, while "daft punk" still shows the artist.
 */
export function pickTopResult(r: SearchResults): Top | null {
  const q = norm(r.query)
  const artist = r.artists[0]
  const candidates: { top: Top; score: number }[] = []
  if (artist) candidates.push({ top: { kind: 'artist', artist }, score: audience(artist.subtitle) })
  for (const c of r.channels.slice(0, 3)) {
    if (norm(c.title) === q)
      candidates.push({ top: { kind: 'show', show: c }, score: audience(c.subtitle) })
  }
  const podcast = r.podcasts.find((p) => norm(p.author ?? '') === q || norm(p.title).includes(q))
  if (!candidates.length && podcast) return { kind: 'show', show: podcast }
  if (!candidates.length) return null
  // Ties keep the artist (it comes first), so music searches behave as before.
  return candidates.reduce((best, c) => (c.score > best.score ? c : best)).top
}
