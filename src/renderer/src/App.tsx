import { useEffect, useRef, useState } from 'react'
import { Sidebar } from './components/Sidebar'
import { TopBar } from './components/TopBar'
import { PlayerBar } from './components/PlayerBar'
import { QueuePanel } from './components/QueuePanel'
import { Toaster } from './components/Toaster'
import { DialogHost } from './components/Dialogs'
import { CommandPalette } from './components/CommandPalette'
import { FirstRun } from './components/FirstRun'
import { HomeView } from './views/HomeView'
import { SearchView } from './views/SearchView'
import { AlbumView } from './views/AlbumView'
import { ArtistView } from './views/ArtistView'
import { LibraryView } from './views/LibraryView'
import { LibAlbumView } from './views/LibAlbumView'
import { DownloadsView } from './views/DownloadsView'
import { PlaylistView } from './views/PlaylistView'
import { SettingsView } from './views/SettingsView'
import { FollowingView } from './views/FollowingView'
import { SpotifyView } from './views/SpotifyView'
import { ShowView } from './views/ShowView'
import { useNav, type Route } from './store/nav'
import { useApp, initAppStore } from './store/app'
import { initLibraryStore } from './store/library'
import { initDownloadStore } from './store/downloads'
import { initFollowStore } from './store/follows'
import { player } from './store/player'
import { ScrollContext } from './lib/scroll'
import { platform } from './lib/platform'
import { BottomTabs, MiniPlayer, NowPlaying } from './components/PhoneShell'

let initialized = false
function init(): void {
  if (initialized) return
  initialized = true
  initAppStore()
  initLibraryStore()
  initDownloadStore()
  initFollowStore()
}

function View({ route }: { route: Route }): React.JSX.Element {
  switch (route.name) {
    case 'home':
      return <HomeView />
    case 'search':
      return <SearchView q={route.q} />
    case 'album':
      return <AlbumView id={route.id} />
    case 'artist':
      return <ArtistView id={route.id} />
    case 'library':
      return <LibraryView tab={route.tab} artist={route.artist} />
    case 'libalbum':
      return <LibAlbumView artist={route.artist} album={route.album} />
    case 'downloads':
      return <DownloadsView />
    case 'playlist':
      return <PlaylistView id={route.id} />
    case 'settings':
      return <SettingsView />
    case 'following':
      return <FollowingView />
    case 'spotify':
      return <SpotifyView />
    case 'show':
      return <ShowView kind={route.kind} id={route.id} />
  }
}

const typing = (e: KeyboardEvent): boolean => {
  const el = e.target as HTMLElement
  return (
    el.tagName === 'INPUT' ||
    el.tagName === 'TEXTAREA' ||
    el.tagName === 'SELECT' ||
    el.isContentEditable
  )
}

function useShortcuts(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const mod = e.ctrlKey || e.metaKey
      if (mod && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        useApp.setState({ paletteOpen: !useApp.getState().paletteOpen })
      } else if (mod && e.key.toLowerCase() === 'f') {
        e.preventDefault()
        const el = document.getElementById('global-search') as HTMLInputElement | null
        el?.focus()
        el?.select()
      } else if (e.altKey && e.key === 'ArrowLeft') useNav.getState().back()
      else if (e.altKey && e.key === 'ArrowRight') useNav.getState().forward()
      else if (typing(e) || document.querySelector('[role="dialog"],[role="menu"]')) return
      else if (e.key === ' ') {
        e.preventDefault()
        player.toggle()
      } else if (e.key === 'ArrowRight' && !mod) player.seekBy(e.shiftKey ? 30 : 5)
      else if (e.key === 'ArrowLeft' && !mod) player.seekBy(e.shiftKey ? -30 : -5)
      else if (mod && e.key === 'ArrowRight') player.next()
      else if (mod && e.key === 'ArrowLeft') player.prev()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}

export default function App(): React.JSX.Element {
  init()
  const route = useNav((s) => s.route)
  const index = useNav((s) => s.index)
  const scrollRef = useRef<HTMLElement>(null)
  const [scrollEl, setScrollEl] = useState<HTMLElement | null>(null)
  useShortcuts()

  useEffect(() => setScrollEl(scrollRef.current), [])
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 })
  }, [index])

  const content = (
    <main ref={scrollRef} className="relative min-h-0 flex-1 overflow-y-auto">
      <ScrollContext.Provider value={scrollEl}>
        <View key={JSON.stringify(route)} route={route} />
      </ScrollContext.Provider>
    </main>
  )

  if (platform.phone)
    return (
      <div className="flex h-full flex-col pt-[env(safe-area-inset-top)]">
        <TopBar />
        {content}
        <MiniPlayer />
        <BottomTabs />
        <QueuePanel />
        <NowPlaying />
        <Toaster />
        <DialogHost />
      </div>
    )

  return (
    <div className="flex h-full flex-col">
      <div className="flex min-h-0 flex-1">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar />
          {content}
        </div>
        <QueuePanel />
      </div>
      <PlayerBar />
      <Toaster />
      <DialogHost />
      <CommandPalette />
      <FirstRun />
    </div>
  )
}
