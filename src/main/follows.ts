import { Notification } from 'electron'
import type { ArtistRef, FollowCheckResult, TrackRef } from '../shared/types'
import { libraryDb } from './library/library'
import * as yt from './youtube/search'
import { enqueue } from './downloads/queue'
import { getSettings } from './settings'
import { emit } from './events'
import { splitNewReleases } from './follow-filter'
import log from './log'

const HOUR = 60 * 60 * 1000
let checking: Promise<FollowCheckResult> | null = null
let timer: NodeJS.Timeout | null = null

export function listFollowed(): ReturnType<ReturnType<typeof libraryDb>['followedArtists']> {
  return libraryDb().followedArtists()
}

/** Follow an artist. Their existing releases are marked as seen, so only future ones download. */
export async function follow(artist: ArtistRef): Promise<void> {
  const details = await yt.artist(artist.channelId)
  const releases = [...details.albums, ...details.singles].map((a) => a.browseId)
  libraryDb().follow(
    artist.channelId,
    details.name || artist.name,
    details.thumbnail ?? artist.thumbnail ?? null,
    releases
  )
  emit('follows:changed', null)
}

export function unfollow(channelId: string): void {
  libraryDb().unfollow(channelId)
  emit('follows:changed', null)
}

async function checkOne(
  channelId: string,
  name: string,
  followedAt: number,
  result: FollowCheckResult
): Promise<void> {
  const db = libraryDb()
  const details = await yt.artist(channelId)
  const { fresh, old } = splitNewReleases(
    [...details.albums, ...details.singles],
    db.seenReleases(channelId),
    followedAt
  )
  db.markSeen(
    channelId,
    old.map((a) => a.browseId)
  )
  const tracks: TrackRef[] = []
  for (const release of fresh) {
    const album = await yt.album(release.browseId)
    tracks.push(...album.tracks)
  }
  if (tracks.length && getSettings().autoDownloadFollowed)
    enqueue(tracks, `New from ${details.name || name}`)
  // Only mark releases as seen once they have been queued (or auto-download is off).
  db.markSeen(
    channelId,
    fresh.map((a) => a.browseId)
  )
  db.markChecked(channelId, fresh.length > 0)
  result.releases += fresh.length
  result.tracks += tracks.length
  if (fresh.length)
    log.info(`${fresh.length} new release(s) from ${name}: ${fresh.map((a) => a.title).join(', ')}`)
}

/** Look for new albums/singles from every followed artist and queue them. */
export function checkFollowed(): Promise<FollowCheckResult> {
  if (checking) return checking
  checking = (async () => {
    const result: FollowCheckResult = { releases: 0, tracks: 0, errors: [] }
    for (const a of libraryDb().followedArtists()) {
      try {
        await checkOne(a.channelId, a.name, a.followedAt, result)
      } catch (err) {
        log.warn(`Could not check ${a.name} for new releases`, err)
        result.errors.push(a.name)
      }
    }
    emit('follows:changed', null)
    if (result.releases && Notification.isSupported()) {
      const verb = getSettings().autoDownloadFollowed ? 'downloading' : 'found'
      new Notification({
        title: 'New music from artists you follow',
        body: `${result.releases} new release${result.releases === 1 ? '' : 's'}, ${verb} ${result.tracks} songs`
      }).show()
    }
    return result
  })().finally(() => (checking = null))
  return checking
}

/** Check on startup (after a short delay) and then every `followCheckHours`. */
export function startFollowChecks(): void {
  const tick = (): void => {
    const hours = Math.max(1, getSettings().followCheckHours)
    const due = libraryDb()
      .followedArtists()
      .some((a) => !a.lastChecked || Date.now() - a.lastChecked > hours * HOUR)
    if (due) void checkFollowed()
  }
  setTimeout(tick, 30_000)
  timer = setInterval(tick, 15 * 60 * 1000)
  timer.unref()
}
