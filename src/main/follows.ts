import { Notification } from 'electron'
import type { ArtistRef, FollowCheckResult, FollowedShow, ShowRef, TrackRef } from '../shared/types'
import { libraryDb } from './library/library'
import * as yt from './youtube/search'
import { enqueue } from './downloads/queue'
import { getSettings } from './settings'
import { emit } from './events'
import { splitNewEpisodes, splitNewReleases } from './follow-filter'
import { loadShow } from './youtube/ytdlp-json'
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

export function listFollowedShows(): ReturnType<ReturnType<typeof libraryDb>['followedShows']> {
  return libraryDb().followedShows()
}

/** Follow a podcast or channel. Current episodes are marked seen; only new ones download. */
export async function followShow(show: ShowRef): Promise<void> {
  const details = await loadShow(show.kind, show.id, 50)
  libraryDb().followShow(
    show.kind,
    show.id,
    details.title || show.title,
    show.thumbnail ?? details.thumbnail ?? null,
    details.episodes.map((e) => e.videoId)
  )
  emit('follows:changed', null)
}

export function unfollowShow(id: string): void {
  libraryDb().unfollowShow(id)
  emit('follows:changed', null)
}

async function checkShow(show: FollowedShow, result: FollowCheckResult): Promise<void> {
  const db = libraryDb()
  const details = await loadShow(show.kind, show.id, 30)
  const { fresh, skipped } = splitNewEpisodes(details.episodes, db.seenEpisodes(show.id))
  if (fresh.length && getSettings().autoDownloadFollowed)
    enqueue(fresh, `New from ${details.title}`)
  db.markEpisodesSeen(
    show.id,
    [...fresh, ...skipped].map((e) => e.videoId)
  )
  db.markShowChecked(show.id, fresh.length > 0)
  result.releases += fresh.length
  result.tracks += fresh.length
  if (fresh.length) log.info(`${fresh.length} new episode(s) of ${details.title}`)
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
    for (const show of libraryDb().followedShows()) {
      try {
        await checkShow(show, result)
      } catch (err) {
        log.warn(`Could not check ${show.title} for new episodes`, err)
        result.errors.push(show.title)
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
    const db = libraryDb()
    const due = [...db.followedArtists(), ...db.followedShows()].some(
      (a) => !a.lastChecked || Date.now() - a.lastChecked > hours * HOUR
    )
    if (due) void checkFollowed()
  }
  setTimeout(tick, 30_000)
  timer = setInterval(tick, 15 * 60 * 1000)
  timer.unref()
}
