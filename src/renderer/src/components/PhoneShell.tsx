// Phone-only chrome: bottom tabs, a mini player above them, and a full-screen "now playing" view.
import { useState } from 'react'
import {
  ChevronDown,
  Download,
  Home,
  Library,
  ListMusic,
  Loader2,
  Pause,
  Play,
  Repeat,
  Repeat1,
  Search,
  Settings,
  Shuffle,
  SkipBack,
  SkipForward
} from 'lucide-react'
import { usePlayer, player } from '../store/player'
import { useApp } from '../store/app'
import { useNav, go, type Route } from '../store/nav'
import { useDownloads } from '../store/downloads'
import { useLibrary } from '../store/library'
import { Cover, IconButton, Slider } from './ui'
import { DownloadButton } from './TrackList'
import { cn, duration } from '../lib/format'

function Tab({
  icon: Icon,
  label,
  route,
  active,
  badge
}: {
  icon: typeof Home
  label: string
  route: Route
  active: boolean
  badge?: number
}): React.JSX.Element {
  return (
    <button
      onClick={() => go(route)}
      className={cn(
        'relative flex flex-1 flex-col items-center justify-center gap-1 text-[11px] font-medium',
        active ? 'text-fg' : 'text-muted'
      )}
    >
      <Icon className={cn('h-6 w-6', active && 'text-accent')} />
      {label}
      {!!badge && (
        <span className="absolute left-1/2 top-1 ml-2 min-w-5 rounded-full bg-accent px-1.5 text-center text-[10px] font-semibold leading-5 text-accent-fg">
          {badge}
        </span>
      )}
    </button>
  )
}

export function BottomTabs(): React.JSX.Element {
  const route = useNav((s) => s.route)
  const active = useDownloads(
    (s) =>
      Object.values(s.jobs).filter(
        (j) => j.status === 'queued' || j.status === 'downloading' || j.status === 'processing'
      ).length
  )
  return (
    <nav className="flex h-[calc(4rem+env(safe-area-inset-bottom))] shrink-0 border-t border-line bg-panel pb-[env(safe-area-inset-bottom)]">
      <Tab icon={Home} label="Home" route={{ name: 'home' }} active={route.name === 'home'} />
      <Tab
        icon={Search}
        label="Search"
        route={{ name: 'search', q: route.name === 'search' ? route.q : '' }}
        active={['search', 'album', 'artist', 'show'].includes(route.name)}
      />
      <Tab
        icon={Library}
        label="Library"
        route={{ name: 'library', tab: 'songs' }}
        active={['library', 'libalbum', 'playlist'].includes(route.name)}
      />
      <Tab
        icon={Download}
        label="Downloads"
        route={{ name: 'downloads' }}
        active={route.name === 'downloads'}
        badge={active}
      />
      <Tab
        icon={Settings}
        label="Settings"
        route={{ name: 'settings' }}
        active={route.name === 'settings'}
      />
    </nav>
  )
}

function PlayButton({ big = false }: { big?: boolean }): React.JSX.Element {
  const playing = usePlayer((s) => s.playing)
  const loading = usePlayer((s) => s.loading)
  const icon = big ? 'h-8 w-8' : 'h-6 w-6'
  return (
    <button
      onClick={(e) => {
        e.stopPropagation()
        player.toggle()
      }}
      aria-label={playing ? 'Pause' : 'Play'}
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full',
        big ? 'h-[72px] w-[72px] bg-fg text-bg' : 'h-11 w-11 text-fg'
      )}
    >
      {loading ? (
        <Loader2 className={cn(icon, 'animate-spin')} />
      ) : playing ? (
        <Pause className={cn(icon, 'fill-current')} />
      ) : (
        <Play className={cn(icon, 'ml-0.5 fill-current')} />
      )}
    </button>
  )
}

export function MiniPlayer(): React.JSX.Element | null {
  const item = usePlayer((s) => s.queue[s.index])
  const progress = usePlayer((s) => (s.duration ? s.position / s.duration : 0))
  if (!item) return null
  return (
    <div
      role="button"
      aria-label="Open player"
      onClick={() => useApp.setState({ nowPlayingOpen: true })}
      className="relative mx-2 mb-2 flex h-14 shrink-0 items-center gap-3 overflow-hidden rounded-xl bg-elev pl-2 pr-1 shadow-lg"
    >
      <Cover src={item.cover} size={40} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[14px] font-medium">{item.title}</div>
        <div className="truncate text-[12px] text-muted">{item.artist}</div>
      </div>
      <PlayButton />
      <button
        aria-label="Next"
        onClick={(e) => {
          e.stopPropagation()
          player.next()
        }}
        className="flex h-11 w-11 shrink-0 items-center justify-center"
      >
        <SkipForward className="h-5 w-5 fill-current" />
      </button>
      <div className="absolute bottom-0 left-2 right-2 h-0.5 rounded-full bg-line">
        <div className="h-full rounded-full bg-fg" style={{ width: `${progress * 100}%` }} />
      </div>
    </div>
  )
}

function Seek(): React.JSX.Element {
  const position = usePlayer((s) => s.position)
  const total = usePlayer((s) => s.duration)
  const [drag, setDrag] = useState<number | null>(null)
  const shown = drag ?? position
  return (
    <div className="flex flex-col gap-1">
      <Slider
        label="Seek"
        value={shown}
        max={total || 1}
        onChange={setDrag}
        onCommit={(v) => {
          player.seek(v)
          setDrag(null)
        }}
      />
      <div className="flex justify-between text-[12px] tabular-nums text-muted">
        <span>{duration(shown)}</span>
        <span>{duration(total)}</span>
      </div>
    </div>
  )
}

export function NowPlaying(): React.JSX.Element | null {
  const open = useApp((s) => s.nowPlayingOpen)
  const item = usePlayer((s) => s.queue[s.index])
  const { shuffle, repeat, index, queue } = usePlayer()
  if (!open || !item) return null
  const close = (): void => useApp.setState({ nowPlayingOpen: false })
  const toAlbum = (): void => {
    const t = item.trackId != null ? useLibrary.getState().byId.get(item.trackId) : undefined
    if (t) go({ name: 'libalbum', artist: t.albumArtist, album: t.album })
    else if (item.ref?.albumId) go({ name: 'album', id: item.ref.albumId })
    else return
    close()
  }
  return (
    <div
      role="dialog"
      aria-label="Now playing"
      className="fixed inset-0 z-40 flex flex-col bg-bg px-6 pb-[max(24px,env(safe-area-inset-bottom))] pt-[max(12px,env(safe-area-inset-top))]"
    >
      <div className="flex h-12 items-center justify-between">
        <IconButton label="Close" size={44} onClick={close}>
          <ChevronDown className="h-6 w-6" />
        </IconButton>
        <span className="truncate px-4 text-[12px] font-semibold uppercase tracking-wider text-muted">
          {item.album || 'Now playing'}
        </span>
        <IconButton
          label="Queue"
          size={44}
          onClick={() => useApp.setState({ queueOpen: true, nowPlayingOpen: false })}
        >
          <ListMusic className="h-5 w-5" />
        </IconButton>
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center py-6">
        <Cover
          src={item.cover}
          size="100%"
          rounded="lg"
          className="aspect-square max-h-full max-w-[min(100%,420px)] shadow-2xl"
        />
      </div>
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1" onClick={toAlbum}>
          <div className="truncate text-xl font-bold">{item.title}</div>
          <div className="truncate text-muted">{item.artist}</div>
        </div>
        {item.ref && <DownloadButton track={item.ref} />}
      </div>
      <div className="mt-5">
        <Seek />
      </div>
      <div className="mt-3 flex items-center justify-between">
        <IconButton label="Shuffle" size={48} active={shuffle} onClick={player.toggleShuffle}>
          <Shuffle className="h-5 w-5" />
        </IconButton>
        <IconButton label="Previous" size={56} className="text-fg" onClick={player.prev}>
          <SkipBack className="h-7 w-7 fill-current" />
        </IconButton>
        <PlayButton big />
        <IconButton
          label="Next"
          size={56}
          className="text-fg"
          onClick={() => player.next()}
          disabled={index >= queue.length - 1 && repeat === 'off' && !shuffle}
        >
          <SkipForward className="h-7 w-7 fill-current" />
        </IconButton>
        <IconButton
          label={`Repeat: ${repeat}`}
          size={48}
          active={repeat !== 'off'}
          onClick={player.cycleRepeat}
        >
          {repeat === 'one' ? <Repeat1 className="h-5 w-5" /> : <Repeat className="h-5 w-5" />}
        </IconButton>
      </div>
    </div>
  )
}
