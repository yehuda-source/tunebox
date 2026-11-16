import { useState } from 'react'
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Shuffle,
  Repeat,
  Repeat1,
  Volume2,
  VolumeX,
  Volume1,
  ListMusic,
  Loader2
} from 'lucide-react'
import { usePlayer, player } from '../store/player'
import { useApp } from '../store/app'
import { Cover, IconButton, Slider } from './ui'
import { DownloadButton } from './TrackList'
import { go } from '../store/nav'
import { useLibrary } from '../store/library'
import { duration } from '../lib/format'

function Seek(): React.JSX.Element {
  const position = usePlayer((s) => s.position)
  const total = usePlayer((s) => s.duration)
  const [drag, setDrag] = useState<number | null>(null)
  const shown = drag ?? position
  return (
    <div className="flex w-full items-center gap-2 text-[11px] tabular-nums text-muted">
      <span className="w-10 text-right">{duration(shown)}</span>
      <Slider
        label="Seek"
        value={shown}
        max={total || 1}
        onChange={setDrag}
        onCommit={(v) => {
          player.seek(v)
          setDrag(null)
        }}
        className="flex-1"
      />
      <span className="w-10">{duration(total)}</span>
    </div>
  )
}

export function PlayerBar(): React.JSX.Element {
  const item = usePlayer((s) => s.queue[s.index])
  const { playing, loading, shuffle, repeat, volume, muted, index, queue } = usePlayer()
  const queueOpen = useApp((s) => s.queueOpen)
  const VolIcon = muted || volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2

  return (
    <footer className="grid h-[84px] shrink-0 grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_minmax(0,1fr)] items-center gap-4 border-t border-line bg-panel px-4">
      <div className="flex min-w-0 items-center gap-3">
        {item ? (
          <>
            <Cover src={item.cover} size={56} />
            <div className="min-w-0">
              <div
                className="cursor-pointer truncate font-medium hover:underline"
                onClick={() => {
                  const t =
                    item.trackId != null ? useLibrary.getState().byId.get(item.trackId) : undefined
                  if (t) go({ name: 'libalbum', artist: t.albumArtist, album: t.album })
                  else if (item.ref?.albumId) go({ name: 'album', id: item.ref.albumId })
                }}
              >
                {item.title}
              </div>
              <div className="truncate text-[13px] text-muted">{item.artist}</div>
            </div>
            {item.ref && <DownloadButton track={item.ref} />}
          </>
        ) : (
          <div className="text-[13px] text-faint">Nothing playing</div>
        )}
      </div>

      <div className="flex flex-col items-center gap-1">
        <div className="flex items-center gap-2">
          <IconButton label="Shuffle" active={shuffle} onClick={player.toggleShuffle}>
            <Shuffle className="h-4 w-4" />
          </IconButton>
          <IconButton label="Previous" onClick={player.prev} disabled={!item}>
            <SkipBack className="h-5 w-5 fill-current" />
          </IconButton>
          <button
            onClick={player.toggle}
            disabled={!item}
            aria-label={playing ? 'Pause' : 'Play'}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-fg text-bg transition-transform hover:scale-105 disabled:opacity-40"
          >
            {loading ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : playing ? (
              <Pause className="h-5 w-5 fill-current" />
            ) : (
              <Play className="ml-0.5 h-5 w-5 fill-current" />
            )}
          </button>
          <IconButton
            label="Next"
            onClick={() => player.next()}
            disabled={!item || (index >= queue.length - 1 && repeat === 'off' && !shuffle)}
          >
            <SkipForward className="h-5 w-5 fill-current" />
          </IconButton>
          <IconButton
            label={`Repeat: ${repeat}`}
            active={repeat !== 'off'}
            onClick={player.cycleRepeat}
          >
            {repeat === 'one' ? <Repeat1 className="h-4 w-4" /> : <Repeat className="h-4 w-4" />}
          </IconButton>
        </div>
        <Seek />
      </div>

      <div className="flex items-center justify-end gap-2">
        <IconButton
          label="Queue"
          active={queueOpen}
          onClick={() => useApp.setState({ queueOpen: !queueOpen })}
        >
          <ListMusic className="h-4 w-4" />
        </IconButton>
        <IconButton label={muted ? 'Unmute' : 'Mute'} onClick={player.toggleMute}>
          <VolIcon className="h-4 w-4" />
        </IconButton>
        <Slider
          label="Volume"
          value={muted ? 0 : volume}
          max={1}
          onChange={player.setVolume}
          className="w-28"
        />
      </div>
    </footer>
  )
}
