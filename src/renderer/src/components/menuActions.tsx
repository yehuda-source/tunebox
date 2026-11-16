import type { LibraryTrack, TrackRef } from '@shared/types'
import { player, fromLibrary, fromRef } from '../store/player'
import { findLocal, useLibrary } from '../store/library'
import { download } from '../store/downloads'
import { dialogs } from '../store/dialogs'
import { toast } from '../store/toast'
import { go } from '../store/nav'

export interface MenuAction {
  label: string
  onSelect?: () => void
  danger?: boolean
  disabled?: boolean
  sub?: MenuAction[]
  separator?: boolean
}

async function addToPlaylist(trackIds: number[], playlistId?: number): Promise<void> {
  let id = playlistId
  if (id == null) {
    const name = await dialogs.prompt('New playlist', '', 'Playlist name')
    if (!name) return
    id = (await window.api.playlists.create(name)).id
  }
  await window.api.playlists.add(id, trackIds)
  await useLibrary.getState().loadPlaylists()
  const pl = useLibrary.getState().playlists.find((p) => p.id === id)
  toast.success(`Added to ${pl?.name ?? 'playlist'}`)
}

function playlistSub(trackIds: number[]): MenuAction[] {
  const pls = useLibrary.getState().playlists
  return [
    { label: 'New playlist…', onSelect: () => void addToPlaylist(trackIds) },
    ...(pls.length ? [{ label: '', separator: true }] : []),
    ...pls.map((p) => ({ label: p.name, onSelect: () => void addToPlaylist(trackIds, p.id) }))
  ]
}

export function libraryActions(t: LibraryTrack, extra: MenuAction[] = []): MenuAction[] {
  return [
    { label: 'Play', onSelect: () => player.playOne(fromLibrary(t)) },
    { label: 'Play next', onSelect: () => player.playNext([fromLibrary(t)]) },
    { label: 'Add to queue', onSelect: () => player.addToQueue([fromLibrary(t)]) },
    { label: 'Add to playlist', sub: playlistSub([t.id]) },
    { label: '', separator: true },
    {
      label: 'Go to album',
      onSelect: () => go({ name: 'libalbum', artist: t.albumArtist, album: t.album })
    },
    { label: 'Edit tags…', onSelect: () => void dialogs.editTags(t) },
    { label: 'Show in folder', onSelect: () => void window.api.library.showInFolder(t.id) },
    ...extra,
    { label: '', separator: true },
    {
      label: 'Move to trash',
      danger: true,
      onSelect: async () => {
        const ok = await dialogs.confirm(
          'Move to trash?',
          <>“{t.title}” will be moved to your system trash and removed from the library.</>,
          'Move to trash',
          true
        )
        if (ok)
          await window.api.library.remove(t.id).catch((err) => toast.error('Could not remove', err))
      }
    }
  ]
}

export function refActions(t: TrackRef): MenuAction[] {
  const local = findLocal(t)
  return [
    { label: 'Play', onSelect: () => player.playOne(fromRef(t)) },
    { label: 'Play next', onSelect: () => player.playNext([fromRef(t)]) },
    { label: 'Add to queue', onSelect: () => player.addToQueue([fromRef(t)]) },
    { label: '', separator: true },
    local
      ? { label: 'Show in folder', onSelect: () => void window.api.library.showInFolder(local.id) }
      : { label: 'Download', onSelect: () => void download([t]) },
    ...(local ? [{ label: 'Add to playlist', sub: playlistSub([local.id]) }] : []),
    ...(t.albumId
      ? [{ label: 'Go to album', onSelect: () => go({ name: 'album', id: t.albumId! }) }]
      : []),
    { label: `Search “${t.artists[0]}”`, onSelect: () => go({ name: 'search', q: t.artists[0] }) },
    {
      label: 'Copy link',
      onSelect: () => {
        void navigator.clipboard.writeText(`https://music.youtube.com/watch?v=${t.videoId}`)
        toast.info('Link copied')
      }
    }
  ]
}
