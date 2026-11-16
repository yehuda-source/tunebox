import { memo } from 'react'
import { Play, Download, Check, MoreHorizontal, AlertCircle, Clock3 } from 'lucide-react'
import type { TrackRef } from '@shared/types'
import { Cover, IconButton, ProgressRing, Eq, LinkText } from './ui'
import { ContextMenu, DropdownMenu } from './menus'
import { refActions } from './menuActions'
import { usePlayer, player, fromRef } from '../store/player'
import { findLocal, useLibrary } from '../store/library'
import { useDownloads, download } from '../store/downloads'
import { go } from '../store/nav'
import { duration, cn } from '../lib/format'

export function DownloadButton({ track }: { track: TrackRef }): React.JSX.Element {
  const inLib = useLibrary((s) => findLocal(track, s) !== undefined)
  const job = useDownloads((s) => s.byVideo[track.videoId])
  if (inLib)
    return (
      <span title="In your library" className="flex h-8 w-8 items-center justify-center text-ok">
        <Check className="h-4 w-4" />
      </span>
    )
  if (job && (job.status === 'downloading' || job.status === 'processing'))
    return (
      <span
        title={`${Math.round(job.progress * 100)}%`}
        className="flex h-8 w-8 items-center justify-center"
      >
        <ProgressRing value={job.progress} />
      </span>
    )
  if (job?.status === 'queued')
    return (
      <span title="Queued" className="flex h-8 w-8 items-center justify-center text-muted">
        <Clock3 className="h-4 w-4" />
      </span>
    )
  return (
    <IconButton
      label={job?.status === 'error' ? `Failed: ${job.error ?? ''}. Click to retry` : 'Download'}
      onClick={(e) => {
        e.stopPropagation()
        if (job?.status === 'error') void window.api.downloads.retry(job.id)
        else void download([track])
      }}
    >
      {job?.status === 'error' ? (
        <AlertCircle className="h-4 w-4 text-danger" />
      ) : (
        <Download className="h-4 w-4" />
      )}
    </IconButton>
  )
}

const Row = memo(function Row({
  track,
  i,
  numbered,
  showAlbum,
  showCover,
  onPlay
}: {
  track: TrackRef
  i: number
  numbered: boolean
  showAlbum: boolean
  showCover: boolean
  onPlay: (i: number) => void
}) {
  const isCurrent = usePlayer((s) => s.queue[s.index]?.videoId === track.videoId)
  const playing = usePlayer((s) => s.playing)
  return (
    <ContextMenu actions={() => refActions(track)}>
      <div
        className={cn(
          'group grid h-14 items-center gap-3 rounded-lg px-3 hover:bg-hover',
          showAlbum
            ? 'grid-cols-[28px_minmax(0,4fr)_minmax(0,3fr)_64px_72px]'
            : 'grid-cols-[28px_minmax(0,1fr)_64px_72px]'
        )}
        onDoubleClick={() => onPlay(i)}
        onMouseEnter={() => !findLocal(track) && void window.api.search.prefetch(track.videoId)}
      >
        <div className="flex justify-center text-muted tabular-nums">
          {isCurrent ? (
            <Eq paused={!playing} />
          ) : (
            <>
              <span className="group-hover:hidden">
                {numbered ? (track.trackNumber ?? i + 1) : i + 1}
              </span>
              <button
                className="hidden text-fg group-hover:block"
                onClick={() => onPlay(i)}
                aria-label="Play"
              >
                <Play className="h-4 w-4 fill-current" />
              </button>
            </>
          )}
        </div>
        <div className="flex min-w-0 items-center gap-3">
          {showCover && <Cover src={track.thumbnail} size={40} />}
          <div className="min-w-0">
            <div className={cn('truncate font-medium', isCurrent && 'text-accent')}>
              {track.title}
            </div>
            <div className="truncate text-[13px] text-muted">
              {track.artists.map((a, k) => (
                <span key={k}>
                  {k > 0 && ', '}
                  <LinkText onClick={() => go({ name: 'search', q: a })}>{a}</LinkText>
                </span>
              ))}
            </div>
          </div>
        </div>
        {showAlbum && (
          <div className="truncate text-[13px] text-muted">
            {track.albumId ? (
              <LinkText onClick={() => go({ name: 'album', id: track.albumId! })}>
                {track.album}
              </LinkText>
            ) : (
              track.album
            )}
          </div>
        )}
        <div className="text-right text-[13px] tabular-nums text-muted">
          {track.durationSec ? duration(track.durationSec) : ''}
        </div>
        <div className="flex items-center justify-end">
          <DownloadButton track={track} />
          <DropdownMenu actions={() => refActions(track)}>
            <IconButton
              label="More"
              className="opacity-0 group-hover:opacity-100 data-[state=open]:opacity-100"
            >
              <MoreHorizontal className="h-4 w-4" />
            </IconButton>
          </DropdownMenu>
        </div>
      </div>
    </ContextMenu>
  )
})

export function TrackList({
  tracks,
  numbered = false,
  showAlbum = true,
  showCover = true,
  limit
}: {
  tracks: TrackRef[]
  numbered?: boolean
  showAlbum?: boolean
  showCover?: boolean
  limit?: number
}): React.JSX.Element {
  const list = limit ? tracks.slice(0, limit) : tracks
  const onPlay = (i: number): void => player.playList(tracks.map(fromRef), i)
  return (
    <div className="flex flex-col">
      {list.map((t, i) => (
        <Row
          key={`${t.videoId}-${i}`}
          track={t}
          i={i}
          numbered={numbered}
          showAlbum={showAlbum}
          showCover={showCover}
          onPlay={onPlay}
        />
      ))}
    </div>
  )
}
