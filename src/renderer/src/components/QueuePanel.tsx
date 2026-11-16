import { useState } from 'react'
import { X, GripVertical, Trash2 } from 'lucide-react'
import { usePlayer, player } from '../store/player'
import { useApp } from '../store/app'
import { Cover, IconButton, Eq } from './ui'
import { duration, cn } from '../lib/format'

export function QueuePanel(): React.JSX.Element | null {
  const open = useApp((s) => s.queueOpen)
  const { queue, index, playing } = usePlayer()
  const [dragFrom, setDragFrom] = useState<number | null>(null)
  const [dragOver, setDragOver] = useState<number | null>(null)
  if (!open) return null

  const upcoming = queue.map((it, i) => ({ it, i })).filter(({ i }) => i > index)
  const now = queue[index]

  const row = (it: (typeof queue)[number], i: number): React.JSX.Element => (
    <div
      key={`${it.key}-${i}`}
      draggable
      onDragStart={() => setDragFrom(i)}
      onDragOver={(e) => {
        e.preventDefault()
        setDragOver(i)
      }}
      onDragEnd={() => {
        setDragFrom(null)
        setDragOver(null)
      }}
      onDrop={() => {
        if (dragFrom != null) player.move(dragFrom, i)
        setDragFrom(null)
        setDragOver(null)
      }}
      onDoubleClick={() => player.jump(i)}
      className={cn(
        'group flex h-14 items-center gap-2 rounded-lg px-2 hover:bg-hover',
        dragOver === i && dragFrom !== i && 'border-t-2 border-accent'
      )}
    >
      <GripVertical className="h-4 w-4 shrink-0 cursor-grab text-faint opacity-0 group-hover:opacity-100" />
      <Cover src={it.cover} size={40} />
      <div className="min-w-0 flex-1">
        <div className={cn('truncate text-[13px] font-medium', i === index && 'text-accent')}>
          {it.title}
        </div>
        <div className="truncate text-xs text-muted">{it.artist}</div>
      </div>
      <span className="text-xs tabular-nums text-faint group-hover:hidden">
        {duration(it.durationSec)}
      </span>
      <IconButton
        label="Remove"
        size={28}
        className="hidden group-hover:inline-flex"
        onClick={() => player.removeAt(i)}
      >
        <X className="h-3.5 w-3.5" />
      </IconButton>
    </div>
  )

  return (
    <aside className="flex w-80 shrink-0 flex-col border-l border-line bg-panel">
      <div className="flex h-16 items-center justify-between px-4">
        <h2 className="text-lg font-bold">Queue</h2>
        <div className="flex gap-1">
          {upcoming.length > 0 && (
            <IconButton label="Clear upcoming" onClick={player.clearUpcoming}>
              <Trash2 className="h-4 w-4" />
            </IconButton>
          )}
          <IconButton label="Close" onClick={() => useApp.setState({ queueOpen: false })}>
            <X className="h-4 w-4" />
          </IconButton>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-2 pb-4">
        {now ? (
          <>
            <div className="flex items-center gap-2 px-2 pb-2 pt-1 text-xs font-semibold uppercase tracking-wider text-faint">
              Now playing {playing && <Eq />}
            </div>
            {row(now, index)}
            <div className="px-2 pb-2 pt-5 text-xs font-semibold uppercase tracking-wider text-faint">
              Next up · {upcoming.length}
            </div>
            {upcoming.length === 0 && (
              <div className="px-2 text-[13px] text-faint">
                Nothing queued. Use “Add to queue” on any song.
              </div>
            )}
            {upcoming.map(({ it, i }) => row(it, i))}
          </>
        ) : (
          <div className="px-2 pt-6 text-[13px] text-faint">
            The queue is empty. Play something to get started.
          </div>
        )}
      </div>
    </aside>
  )
}
