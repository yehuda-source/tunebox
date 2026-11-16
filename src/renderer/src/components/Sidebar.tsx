import {
  Home,
  Search,
  Library,
  Download,
  Settings,
  Plus,
  ListMusic,
  AudioLines,
  BellRing,
  Import
} from 'lucide-react'
import { useNav, go, type Route } from '../store/nav'
import { useLibrary } from '../store/library'
import { useDownloads } from '../store/downloads'
import { dialogs } from '../store/dialogs'
import { toast } from '../store/toast'
import { cn } from '../lib/format'

function NavItem({
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
        'flex h-10 w-full items-center gap-3 rounded-lg px-3 text-[14px] font-medium transition-colors',
        active ? 'bg-hover text-fg' : 'text-muted hover:text-fg'
      )}
    >
      <Icon className={cn('h-5 w-5', active && 'text-accent')} />
      <span className="flex-1 text-left">{label}</span>
      {!!badge && (
        <span className="rounded-full bg-accent px-2 py-0.5 text-[11px] font-semibold text-accent-fg">
          {badge}
        </span>
      )}
    </button>
  )
}

export function Sidebar(): React.JSX.Element {
  const route = useNav((s) => s.route)
  const playlists = useLibrary((s) => s.playlists)
  const active = useDownloads(
    (s) =>
      Object.values(s.jobs).filter(
        (j) => j.status === 'queued' || j.status === 'downloading' || j.status === 'processing'
      ).length
  )

  const newPlaylist = async (): Promise<void> => {
    const name = await dialogs.prompt('New playlist', '', 'Playlist name')
    if (!name) return
    try {
      const pl = await window.api.playlists.create(name)
      await useLibrary.getState().loadPlaylists()
      go({ name: 'playlist', id: pl.id })
    } catch (err) {
      toast.error('Could not create playlist', err)
    }
  }

  return (
    <aside className="flex w-60 shrink-0 flex-col gap-2 border-r border-line bg-panel p-3">
      <div className="flex items-center gap-2 px-3 pb-3 pt-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-accent-fg">
          <AudioLines className="h-5 w-5" />
        </div>
        <span className="text-lg font-bold tracking-tight">TuneBox</span>
      </div>
      <nav className="flex flex-col gap-0.5">
        <NavItem icon={Home} label="Home" route={{ name: 'home' }} active={route.name === 'home'} />
        <NavItem
          icon={Search}
          label="Search"
          route={{ name: 'search', q: route.name === 'search' ? route.q : '' }}
          active={['search', 'album', 'artist'].includes(route.name)}
        />
        <NavItem
          icon={Library}
          label="Library"
          route={{ name: 'library', tab: 'songs' }}
          active={route.name === 'library' || route.name === 'libalbum'}
        />
        <NavItem
          icon={Download}
          label="Downloads"
          route={{ name: 'downloads' }}
          active={route.name === 'downloads'}
          badge={active}
        />
        <NavItem
          icon={BellRing}
          label="Following"
          route={{ name: 'following' }}
          active={route.name === 'following'}
        />
        <NavItem
          icon={Import}
          label="Spotify import"
          route={{ name: 'spotify' }}
          active={route.name === 'spotify'}
        />
      </nav>

      <div className="mt-4 flex items-center justify-between px-3">
        <span className="text-xs font-semibold uppercase tracking-wider text-faint">Playlists</span>
        <button
          onClick={newPlaylist}
          className="rounded-full p-1 text-muted hover:bg-hover hover:text-fg"
          title="New playlist"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>
      <div className="-mx-1 flex-1 overflow-y-auto px-1">
        {playlists.length === 0 && (
          <div className="px-3 py-2 text-[13px] text-faint">
            Right-click songs in your library to add them to a playlist.
          </div>
        )}
        {playlists.map((p) => (
          <button
            key={p.id}
            onClick={() => go({ name: 'playlist', id: p.id })}
            className={cn(
              'flex h-9 w-full items-center gap-3 rounded-lg px-3 text-[13px] transition-colors',
              route.name === 'playlist' && route.id === p.id
                ? 'bg-hover text-fg'
                : 'text-muted hover:text-fg'
            )}
          >
            <ListMusic className="h-4 w-4 shrink-0" />
            <span className="truncate">{p.name}</span>
            <span className="ml-auto text-faint">{p.trackCount}</span>
          </button>
        ))}
      </div>

      <NavItem
        icon={Settings}
        label="Settings"
        route={{ name: 'settings' }}
        active={route.name === 'settings'}
      />
    </aside>
  )
}
