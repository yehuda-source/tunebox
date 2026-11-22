import { useMemo } from 'react'
import { Play, Shuffle, FolderOpen } from 'lucide-react'
import { useLibrary, groupAlbums, coverUrl } from '../store/library'
import { LibraryTable } from '../components/LibraryTable'
import { Button, Cover, Empty } from '../components/ui'
import { Page } from './common'
import { player, fromLibrary, usePlayer } from '../store/player'
import { go } from '../store/nav'
import { totalDuration } from '../lib/format'
import { useScrollEl } from '../lib/scroll'

export function LibAlbumView({
  artist,
  album
}: {
  artist: string
  album: string
}): React.JSX.Element {
  const tracks = useLibrary((s) => s.tracks)
  const scrollEl = useScrollEl()
  const group = useMemo(
    () => groupAlbums(tracks.filter((t) => t.albumArtist === artist && t.album === album))[0],
    [tracks, artist, album]
  )
  if (!group)
    return (
      <Page>
        <Empty icon={<FolderOpen className="h-7 w-7" />} title="Album not found">
          It may have been removed from your library.
        </Empty>
      </Page>
    )

  return (
    <Page>
      <div className="flex items-end gap-8 pb-8 pt-4 max-sm:flex-col max-sm:items-start max-sm:gap-5 max-sm:pb-6">
        <Cover
          src={coverUrl(group.coverId)}
          size={224}
          rounded="lg"
          className="shadow-2xl max-sm:h-44! max-sm:w-44!"
        />
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-semibold uppercase tracking-wider text-muted">
            Album · In your library
          </div>
          <h1 className="mt-2 line-clamp-2 text-5xl font-black tracking-tight max-sm:text-3xl">
            {group.album}
          </h1>
          <div className="mt-4 flex flex-wrap gap-x-2 text-muted">
            <button
              className="font-semibold text-fg hover:underline"
              onClick={() => go({ name: 'library', tab: 'albums', artist })}
            >
              {artist}
            </button>
            {group.year && <span>• {group.year}</span>}
            <span>
              • {group.tracks.length} songs, {totalDuration(group.tracks.map((t) => t.durationSec))}
            </span>
          </div>
          <div className="mt-6 flex flex-wrap gap-3">
            <Button
              variant="primary"
              size="lg"
              icon={<Play className="h-5 w-5 fill-current" />}
              onClick={() => player.playList(group.tracks.map(fromLibrary))}
            >
              Play
            </Button>
            <Button
              size="lg"
              icon={<Shuffle className="h-4 w-4" />}
              onClick={() => {
                usePlayer.setState({ shuffle: true })
                player.playList(
                  group.tracks.map(fromLibrary),
                  Math.floor(Math.random() * group.tracks.length)
                )
              }}
            >
              Shuffle
            </Button>
            <Button
              size="lg"
              variant="ghost"
              icon={<FolderOpen className="h-4 w-4" />}
              onClick={() => void window.api.library.showInFolder(group.tracks[0].id)}
            >
              Open folder
            </Button>
          </div>
        </div>
      </div>
      <LibraryTable
        tracks={group.tracks}
        scrollEl={scrollEl}
        showAlbum={false}
        sortable={false}
        numberBy="track"
      />
    </Page>
  )
}
