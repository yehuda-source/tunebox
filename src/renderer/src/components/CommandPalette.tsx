import { useMemo, useState } from 'react'
import { Command } from 'cmdk'
import * as Dialog from '@radix-ui/react-dialog'
import {
  Search,
  Home,
  Library,
  Download,
  Settings,
  ListMusic,
  Music,
  Link2,
  Play,
  Pause,
  SkipForward
} from 'lucide-react'
import { useApp } from '../store/app'
import { downloadUrl } from '../store/downloads'
import { useLibrary } from '../store/library'
import { go } from '../store/nav'
import { player, fromLibrary, usePlayer } from '../store/player'

const itemCls =
  'flex h-10 cursor-default items-center gap-3 rounded-lg px-3 text-[14px] data-[selected=true]:bg-hover'
const groupCls =
  '[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-faint'

export function CommandPalette(): React.JSX.Element {
  const open = useApp((s) => s.paletteOpen)
  const tracks = useLibrary((s) => s.tracks)
  const playlists = useLibrary((s) => s.playlists)
  const playing = usePlayer((s) => s.playing)
  const [q, setQ] = useState('')

  const matches = useMemo(() => {
    const f = q.trim().toLowerCase()
    if (f.length < 2) return []
    return tracks
      .filter((t) => `${t.title} ${t.artist} ${t.album}`.toLowerCase().includes(f))
      .slice(0, 8)
  }, [q, tracks])

  const close = (): void => {
    useApp.setState({ paletteOpen: false })
    setQ('')
  }
  const run = (fn: () => void) => () => {
    fn()
    close()
  }
  const isUrl = /^https?:\/\//.test(q.trim())

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(o) => (o ? useApp.setState({ paletteOpen: true }) : close())}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-[15%] z-50 w-[min(640px,92vw)] -translate-x-1/2 overflow-hidden rounded-2xl border border-line bg-panel shadow-2xl outline-none">
          <Dialog.Title className="sr-only">Command palette</Dialog.Title>
          <Command shouldFilter={!isUrl} loop>
            <div className="flex items-center gap-3 border-b border-line px-4">
              <Search className="h-4 w-4 text-faint" />
              <Command.Input
                value={q}
                onValueChange={setQ}
                placeholder="Type a command, search, or paste a link…"
                className="h-14 flex-1 bg-transparent outline-none placeholder:text-faint"
                autoFocus
              />
            </div>
            <Command.List className="max-h-[420px] overflow-y-auto p-2">
              <Command.Empty className="px-3 py-6 text-center text-[13px] text-muted">
                No matches
              </Command.Empty>
              {q.trim() && (
                <Command.Group heading="Search" className={groupCls} forceMount>
                  {isUrl ? (
                    <Command.Item
                      value={`link ${q}`}
                      className={itemCls}
                      forceMount
                      onSelect={run(() => {
                        go({ name: 'downloads' })
                        void downloadUrl(q)
                      })}
                    >
                      <Link2 className="h-4 w-4 text-accent" /> Download from this link
                    </Command.Item>
                  ) : (
                    <Command.Item
                      value={`search youtube ${q}`}
                      className={itemCls}
                      forceMount
                      onSelect={run(() => go({ name: 'search', q: q.trim() }))}
                    >
                      <Search className="h-4 w-4 text-accent" /> Search YouTube Music for “
                      {q.trim()}”
                    </Command.Item>
                  )}
                </Command.Group>
              )}
              {matches.length > 0 && (
                <Command.Group heading="In your library" className={groupCls}>
                  {matches.map((t) => (
                    <Command.Item
                      key={t.id}
                      value={`track ${t.id} ${t.title} ${t.artist} ${t.album}`}
                      className={itemCls}
                      onSelect={run(() => player.playOne(fromLibrary(t)))}
                    >
                      <Music className="h-4 w-4 text-faint" />
                      <span className="truncate">{t.title}</span>
                      <span className="truncate text-[13px] text-muted">{t.artist}</span>
                    </Command.Item>
                  ))}
                </Command.Group>
              )}
              <Command.Group heading="Playback" className={groupCls}>
                <Command.Item className={itemCls} onSelect={run(player.toggle)}>
                  {playing ? (
                    <Pause className="h-4 w-4 text-faint" />
                  ) : (
                    <Play className="h-4 w-4 text-faint" />
                  )}{' '}
                  {playing ? 'Pause' : 'Play'}
                </Command.Item>
                <Command.Item className={itemCls} onSelect={run(() => player.next())}>
                  <SkipForward className="h-4 w-4 text-faint" /> Next track
                </Command.Item>
              </Command.Group>
              <Command.Group heading="Go to" className={groupCls}>
                <Command.Item className={itemCls} onSelect={run(() => go({ name: 'home' }))}>
                  <Home className="h-4 w-4 text-faint" /> Home
                </Command.Item>
                <Command.Item
                  className={itemCls}
                  onSelect={run(() => go({ name: 'library', tab: 'songs' }))}
                >
                  <Library className="h-4 w-4 text-faint" /> Library: songs
                </Command.Item>
                <Command.Item
                  className={itemCls}
                  onSelect={run(() => go({ name: 'library', tab: 'albums' }))}
                >
                  <Library className="h-4 w-4 text-faint" /> Library: albums
                </Command.Item>
                <Command.Item className={itemCls} onSelect={run(() => go({ name: 'downloads' }))}>
                  <Download className="h-4 w-4 text-faint" /> Downloads
                </Command.Item>
                <Command.Item className={itemCls} onSelect={run(() => go({ name: 'settings' }))}>
                  <Settings className="h-4 w-4 text-faint" /> Settings
                </Command.Item>
                {playlists.map((p) => (
                  <Command.Item
                    key={p.id}
                    value={`playlist ${p.name}`}
                    className={itemCls}
                    onSelect={run(() => go({ name: 'playlist', id: p.id }))}
                  >
                    <ListMusic className="h-4 w-4 text-faint" /> {p.name}
                  </Command.Item>
                ))}
              </Command.Group>
            </Command.List>
          </Command>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
