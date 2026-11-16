import { useEffect, useState, useCallback } from 'react'
import { Play, Shuffle, Pencil, Trash2, FileDown, ListMusic } from 'lucide-react'
import type { LibraryTrack } from '@shared/types'
import { useLibrary, coverUrl } from '../store/library'
import { LibraryTable } from '../components/LibraryTable'
import { Button, Cover, Empty } from '../components/ui'
import { dialogs } from '../store/dialogs'
import { Page } from './common'
import { player, fromLibrary, usePlayer } from '../store/player'
import { go } from '../store/nav'
import { toast } from '../store/toast'
import { totalDuration } from '../lib/format'
import { useScrollEl } from '../lib/scroll'

export function PlaylistView({ id }: { id: number }): React.JSX.Element {
  const playlist = useLibrary((s) => s.playlists.find((p) => p.id === id))
  const byId = useLibrary((s) => s.byId)
  const [ids, setIds] = useState<number[]>([])
  const scrollEl = useScrollEl()

  const load = useCallback(() => void window.api.playlists.tracks(id).then(setIds), [id])
  useEffect(load, [load, playlist?.trackCount])

  const tracks = ids.map((i) => byId.get(i)).filter((t): t is LibraryTrack => !!t)

  if (!playlist)
    return (
      <Page>
        <Empty icon={<ListMusic className="h-7 w-7" />} title="Playlist not found" />
      </Page>
    )

  const rename = async (): Promise<void> => {
    const name = await dialogs.prompt('Rename playlist', playlist.name)
    if (!name) return
    await window.api.playlists.rename(id, name)
    await useLibrary.getState().loadPlaylists()
  }
  const remove = async (): Promise<void> => {
    if (
      !(await dialogs.confirm(
        `Delete “${playlist.name}”?`,
        'The songs stay in your library.',
        'Delete',
        true
      ))
    )
      return
    await window.api.playlists.remove(id)
    await useLibrary.getState().loadPlaylists()
    go({ name: 'library', tab: 'songs' })
  }
  const exportM3u = async (): Promise<void> => {
    try {
      const path = await window.api.playlists.exportM3u(id)
      if (path) toast.success('Playlist exported', path)
    } catch (err) {
      toast.error('Export failed', err)
    }
  }

  const coverId = tracks.find((t) => t.hasCover)?.id

  return (
    <Page>
      <div className="flex items-end gap-8 pb-8 pt-4">
        <Cover src={coverUrl(coverId)} size={224} rounded="lg" className="shadow-2xl" />
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-semibold uppercase tracking-wider text-muted">
            Playlist
          </div>
          <h1 className="mt-2 line-clamp-2 text-5xl font-black tracking-tight">{playlist.name}</h1>
          <div className="mt-4 text-muted">
            {tracks.length} songs
            {tracks.length > 0 && `, ${totalDuration(tracks.map((t) => t.durationSec))}`}
          </div>
          <div className="mt-6 flex flex-wrap gap-3">
            <Button
              variant="primary"
              size="lg"
              disabled={!tracks.length}
              icon={<Play className="h-5 w-5 fill-current" />}
              onClick={() => player.playList(tracks.map(fromLibrary))}
            >
              Play
            </Button>
            <Button
              size="lg"
              disabled={!tracks.length}
              icon={<Shuffle className="h-4 w-4" />}
              onClick={() => {
                usePlayer.setState({ shuffle: true })
                player.playList(tracks.map(fromLibrary), Math.floor(Math.random() * tracks.length))
              }}
            >
              Shuffle
            </Button>
            <Button variant="ghost" icon={<Pencil className="h-4 w-4" />} onClick={rename}>
              Rename
            </Button>
            <Button
              variant="ghost"
              icon={<FileDown className="h-4 w-4" />}
              onClick={exportM3u}
              disabled={!tracks.length}
            >
              Export .m3u8
            </Button>
            <Button variant="ghost" icon={<Trash2 className="h-4 w-4" />} onClick={remove}>
              Delete
            </Button>
          </div>
        </div>
      </div>
      {tracks.length ? (
        <LibraryTable
          tracks={tracks}
          scrollEl={scrollEl}
          sortable={false}
          extraActions={(t) => [
            {
              label: 'Remove from playlist',
              onSelect: async () => {
                await window.api.playlists.removeTrack(id, t.id)
                await useLibrary.getState().loadPlaylists()
                load()
              }
            }
          ]}
        />
      ) : (
        <Empty icon={<ListMusic className="h-7 w-7" />} title="This playlist is empty">
          Right-click any song in your library and choose “Add to playlist”.
        </Empty>
      )}
    </Page>
  )
}
