import { useMemo, useRef, useState, memo } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { Play, MoreHorizontal, ArrowUp, ArrowDown } from 'lucide-react'
import type { LibraryTrack } from '@shared/types'
import { Cover, IconButton, Eq } from './ui'
import { ContextMenu, DropdownMenu } from './menus'
import { libraryActions, type MenuAction } from './menuActions'
import { usePlayer, player, fromLibrary } from '../store/player'
import { coverUrl } from '../store/library'
import { go } from '../store/nav'
import { duration, cn } from '../lib/format'

type SortKey = 'default' | 'title' | 'artist' | 'album' | 'duration' | 'added'

const Row = memo(function Row({
  t,
  i,
  showAlbum,
  numberBy,
  onPlay,
  extraActions
}: {
  t: LibraryTrack
  i: number
  showAlbum: boolean
  numberBy: 'index' | 'track'
  onPlay: (i: number) => void
  extraActions?: (t: LibraryTrack) => MenuAction[]
}) {
  const isCurrent = usePlayer((s) => s.queue[s.index]?.trackId === t.id)
  const playing = usePlayer((s) => s.playing)
  const actions = (): MenuAction[] => libraryActions(t, extraActions?.(t))
  return (
    <ContextMenu actions={actions}>
      <div
        onDoubleClick={() => onPlay(i)}
        className={cn(
          'group grid h-14 items-center gap-3 rounded-lg px-3 hover:bg-hover',
          showAlbum
            ? 'grid-cols-[28px_minmax(0,4fr)_minmax(0,3fr)_64px_40px]'
            : 'grid-cols-[28px_minmax(0,1fr)_64px_40px]'
        )}
      >
        <div className="flex justify-center text-muted tabular-nums">
          {isCurrent ? (
            <Eq paused={!playing} />
          ) : (
            <>
              <span className="group-hover:hidden">
                {numberBy === 'track' ? (t.trackNumber ?? '–') : i + 1}
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
          {showAlbum && <Cover src={t.hasCover ? coverUrl(t.id) : undefined} size={40} />}
          <div className="min-w-0">
            <div className={cn('truncate font-medium', isCurrent && 'text-accent')}>{t.title}</div>
            <div className="truncate text-[13px] text-muted">
              <button
                className="hover:text-fg hover:underline"
                onClick={() => go({ name: 'library', tab: 'albums', artist: t.albumArtist })}
              >
                {t.artist}
              </button>
            </div>
          </div>
        </div>
        {showAlbum && (
          <div className="truncate text-[13px] text-muted">
            <button
              className="hover:text-fg hover:underline"
              onClick={() => go({ name: 'libalbum', artist: t.albumArtist, album: t.album })}
            >
              {t.album}
            </button>
          </div>
        )}
        <div className="text-right text-[13px] tabular-nums text-muted">
          {duration(t.durationSec)}
        </div>
        <DropdownMenu actions={actions}>
          <IconButton
            label="More"
            className="opacity-0 group-hover:opacity-100 data-[state=open]:opacity-100"
          >
            <MoreHorizontal className="h-4 w-4" />
          </IconButton>
        </DropdownMenu>
      </div>
    </ContextMenu>
  )
})

/** Virtualized, sortable table of library tracks. Renders inside the page's scroll container. */
export function LibraryTable({
  tracks,
  scrollEl,
  showAlbum = true,
  sortable = true,
  numberBy = 'index',
  extraActions
}: {
  tracks: LibraryTrack[]
  scrollEl: HTMLElement | null
  showAlbum?: boolean
  sortable?: boolean
  numberBy?: 'index' | 'track'
  extraActions?: (t: LibraryTrack) => MenuAction[]
}): React.JSX.Element {
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'default', dir: 1 })
  const listRef = useRef<HTMLDivElement>(null)

  const sorted = useMemo(() => {
    if (sort.key === 'default') return tracks
    const val = (t: LibraryTrack): string | number =>
      sort.key === 'duration'
        ? (t.durationSec ?? 0)
        : sort.key === 'added'
          ? t.addedAt
          : String(t[sort.key]).toLowerCase()
    return [...tracks].sort((a, b) =>
      val(a) < val(b) ? -sort.dir : val(a) > val(b) ? sort.dir : 0
    )
  }, [tracks, sort])

  const v = useVirtualizer({
    count: sorted.length,
    getScrollElement: () => scrollEl,
    estimateSize: () => 56,
    overscan: 12,
    scrollMargin: listRef.current?.offsetTop ?? 0
  })

  const onPlay = (i: number): void => player.playList(sorted.map(fromLibrary), i)

  const header = (key: SortKey, label: string, className?: string): React.JSX.Element => (
    <button
      disabled={!sortable}
      className={cn('flex items-center gap-1 hover:text-fg disabled:hover:text-faint', className)}
      onClick={() =>
        setSort((s) =>
          s.key === key
            ? s.dir === 1
              ? { key, dir: -1 }
              : { key: 'default', dir: 1 }
            : { key, dir: 1 }
        )
      }
    >
      {label}
      {sort.key === key &&
        (sort.dir === 1 ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
    </button>
  )

  return (
    <div>
      <div
        className={cn(
          'sticky top-0 z-[5] grid h-10 items-center gap-3 border-b border-line bg-bg px-3 text-xs font-medium uppercase tracking-wider text-faint',
          showAlbum
            ? 'grid-cols-[28px_minmax(0,4fr)_minmax(0,3fr)_64px_40px]'
            : 'grid-cols-[28px_minmax(0,1fr)_64px_40px]'
        )}
      >
        <span className="text-center">#</span>
        {header('title', 'Title')}
        {showAlbum && header('album', 'Album')}
        {header('duration', 'Time', 'justify-end')}
        <span />
      </div>
      <div ref={listRef} className="relative mt-1" style={{ height: v.getTotalSize() }}>
        {v.getVirtualItems().map((item) => (
          <div
            key={sorted[item.index].id}
            className="absolute left-0 right-0"
            style={{ top: 0, transform: `translateY(${item.start - v.options.scrollMargin}px)` }}
          >
            <Row
              t={sorted[item.index]}
              i={item.index}
              showAlbum={showAlbum}
              numberBy={numberBy}
              onPlay={onPlay}
              extraActions={extraActions}
            />
          </div>
        ))}
      </div>
    </div>
  )
}
