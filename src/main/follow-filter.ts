import type { AlbumRef } from '../shared/types'

/**
 * Split an artist's releases into ones to download and ones to just mark as seen.
 * Only releases from the year the artist was followed onwards count as new; YouTube also adds old
 * albums to artist pages over time, and those must not trigger a back-catalogue download.
 */
export function splitNewReleases(
  releases: AlbumRef[],
  seen: Set<string>,
  followedAt: number
): { fresh: AlbumRef[]; old: AlbumRef[] } {
  const followedYear = new Date(followedAt).getFullYear()
  const unseen = releases.filter((a) => !seen.has(a.browseId))
  const isRecent = (a: AlbumRef): boolean => {
    const year = Number(a.year)
    return !year || year >= followedYear
  }
  return { fresh: unseen.filter(isRecent), old: unseen.filter((a) => !isRecent(a)) }
}

/**
 * New episodes of a followed show, newest first. At most `cap` are downloaded per check; any
 * extra unseen ones (e.g. a back catalogue suddenly made public) are only marked as seen.
 */
export function splitNewEpisodes<T extends { videoId: string }>(
  newestFirst: T[],
  seen: Set<string>,
  cap = 10
): { fresh: T[]; skipped: T[] } {
  const unseen = newestFirst.filter((e) => !seen.has(e.videoId))
  return { fresh: unseen.slice(0, cap), skipped: unseen.slice(cap) }
}
