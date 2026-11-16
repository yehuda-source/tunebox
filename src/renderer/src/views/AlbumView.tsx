import { Play, Download, Shuffle } from 'lucide-react'
import { useCached } from '../lib/useCached'
import { TrackList } from '../components/TrackList'
import { Button, Cover, Skeleton } from '../components/ui'
import { Page, ListSkeleton, ErrorState } from './common'
import { player, fromRef, usePlayer } from '../store/player'
import { download } from '../store/downloads'
import { findLocal, useLibrary } from '../store/library'
import { go } from '../store/nav'
import { totalDuration } from '../lib/format'

export function AlbumView({ id }: { id: string }): React.JSX.Element {
  const { data, error, loading, reload } = useCached(`album:${id}`, () =>
    window.api.search.album(id)
  )
  const byVideo = useLibrary((s) => s.byVideo)
  const songs = useLibrary((s) => s.songs)

  if (error)
    return (
      <Page>
        <ErrorState error={error} retry={reload} />
      </Page>
    )

  const owned = data ? data.tracks.filter((t) => findLocal(t, { byVideo, songs })).length : 0

  return (
    <Page>
      <div className="flex items-end gap-8 pb-8 pt-4">
        {loading || !data ? (
          <>
            <Skeleton className="h-56 w-56 rounded-xl" />
            <div className="flex flex-1 flex-col gap-3">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-12 w-2/3" />
              <Skeleton className="h-4 w-1/3" />
            </div>
          </>
        ) : (
          <>
            <Cover src={data.thumbnail} size={224} rounded="lg" className="shadow-2xl" />
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-semibold uppercase tracking-wider text-muted">
                {data.kind || 'Album'}
              </div>
              <h1 className="mt-2 line-clamp-2 text-5xl font-black tracking-tight">{data.title}</h1>
              <div className="mt-4 flex flex-wrap items-center gap-x-2 text-[14px] text-muted">
                <button
                  className="font-semibold text-fg hover:underline"
                  onClick={() => go({ name: 'search', q: data.artist })}
                >
                  {data.artist}
                </button>
                {data.year && <span>• {data.year}</span>}
                <span>
                  • {data.tracks.length} songs,{' '}
                  {totalDuration(data.tracks.map((t) => t.durationSec))}
                </span>
                {owned > 0 && (
                  <span className="text-ok">
                    • {owned === data.tracks.length ? 'In your library' : `${owned} in library`}
                  </span>
                )}
              </div>
              <div className="mt-6 flex gap-3">
                <Button
                  variant="primary"
                  size="lg"
                  icon={<Play className="h-5 w-5 fill-current" />}
                  onClick={() => player.playList(data.tracks.map(fromRef))}
                >
                  Play
                </Button>
                <Button
                  size="lg"
                  icon={<Shuffle className="h-4 w-4" />}
                  onClick={() => {
                    usePlayer.setState({ shuffle: true })
                    player.playList(
                      data.tracks.map(fromRef),
                      Math.floor(Math.random() * data.tracks.length)
                    )
                  }}
                >
                  Shuffle
                </Button>
                <Button
                  size="lg"
                  icon={<Download className="h-4 w-4" />}
                  disabled={owned === data.tracks.length}
                  onClick={() => void download(data.tracks, `${data.artist} — ${data.title}`)}
                >
                  {owned === data.tracks.length ? 'Downloaded' : 'Download album'}
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
      {loading || !data ? (
        <ListSkeleton />
      ) : (
        <TrackList tracks={data.tracks} numbered showAlbum={false} showCover={false} />
      )}
    </Page>
  )
}
