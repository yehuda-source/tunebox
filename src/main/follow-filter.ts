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
