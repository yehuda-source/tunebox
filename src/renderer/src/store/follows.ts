import { create } from 'zustand'
import type { ArtistRef, FollowedArtist, FollowedShow, ShowRef } from '@shared/types'
import { toast } from './toast'

interface FollowState {
  artists: FollowedArtist[]
  shows: FollowedShow[]
  /** Followed artist channel ids and podcast/channel ids. */
  ids: Set<string>
  checking: boolean
}

export const useFollows = create<FollowState>(() => ({
  artists: [],
  shows: [],
  ids: new Set(),
  checking: false
}))

async function load(): Promise<void> {
  const [artists, shows] = await Promise.all([
    window.api.follows.list(),
    window.api.follows.shows()
  ])
  useFollows.setState({
    artists,
    shows,
    ids: new Set([...artists.map((a) => a.channelId), ...shows.map((s) => s.id)])
  })
}

export async function toggleFollowShow(show: ShowRef): Promise<void> {
  const following = useFollows.getState().ids.has(show.id)
  try {
    if (following) {
      await window.api.follows.unfollowShow(show.id)
      toast.info(`Unfollowed ${show.title}`)
    } else {
      await window.api.follows.followShow(show)
      toast.success(`Following ${show.title}`, 'New episodes will download automatically.')
    }
  } catch (err) {
    toast.error(following ? 'Could not unfollow' : 'Could not follow', err)
  }
}

export function initFollowStore(): void {
  void load()
  window.api.on('follows:changed', () => void load())
}

export async function toggleFollow(artist: ArtistRef): Promise<void> {
  const following = useFollows.getState().ids.has(artist.channelId)
  try {
    if (following) {
      await window.api.follows.unfollow(artist.channelId)
      toast.info(`Unfollowed ${artist.name}`)
    } else {
      await window.api.follows.follow(artist)
      toast.success(`Following ${artist.name}`, 'New songs and albums will download automatically.')
    }
  } catch (err) {
    toast.error(following ? 'Could not unfollow' : 'Could not follow', err)
  }
}

export async function checkNow(): Promise<void> {
  useFollows.setState({ checking: true })
  try {
    const r = await window.api.follows.check()
    if (r.releases)
      toast.success(
        `${r.releases} new release${r.releases === 1 ? '' : 's'} or episode${r.releases === 1 ? '' : 's'} found`,
        `${r.tracks} songs queued`
      )
    else
      toast.info(
        'No new releases',
        r.errors.length ? `Couldn't check: ${r.errors.join(', ')}` : 'You’re up to date.'
      )
  } catch (err) {
    toast.error('Check failed', err)
  } finally {
    useFollows.setState({ checking: false })
  }
}
