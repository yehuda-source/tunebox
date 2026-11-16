import { create } from 'zustand'
import type { ArtistRef, FollowedArtist } from '@shared/types'
import { toast } from './toast'

interface FollowState {
  artists: FollowedArtist[]
  ids: Set<string>
  checking: boolean
}

export const useFollows = create<FollowState>(() => ({
  artists: [],
  ids: new Set(),
  checking: false
}))

async function load(): Promise<void> {
  const artists = await window.api.follows.list()
  useFollows.setState({ artists, ids: new Set(artists.map((a) => a.channelId)) })
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
        `${r.releases} new release${r.releases === 1 ? '' : 's'} found`,
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
