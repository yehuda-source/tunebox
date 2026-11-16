import { useMemo, useState } from 'react'
import { Library as LibIcon, Search, RefreshCw, Shuffle, Play, X } from 'lucide-react'
import { useLibrary, groupAlbums, coverUrl } from '../store/library'
import { LibraryTable } from '../components/LibraryTable'
import { Tabs, Empty, Button, Cover } from '../components/ui'
import { Page, Grid } from './common'
import { useNav, go } from '../store/nav'
import { player, fromLibrary, usePlayer } from '../store/player'
import { toast } from '../store/toast'
import { useScrollEl } from '../lib/scroll'

type Tab = 'songs' | 'albums' | 'artists'

export function LibraryView({ tab, artist }: { tab: Tab; artist?: string }): React.JSX.Element {
  const { tracks, loaded } = useLibrary()
  const [filter, setFilter] = useState('')
  const [scanning, setScanning] = useState(false)
  const scrollEl = useScrollEl()

  const filtered = useMemo(() => {
    const f = filter.trim().toLowerCase()
    let list = artist
      ? tracks.filter((t) => t.albumArtist === artist || t.artist === artist)
      : tracks
    if (f) list = list.filter((t) => `${t.title} ${t.artist} ${t.album}`.toLowerCase().includes(f))
    return list
  }, [tracks, filter, artist])

  const albums = useMemo(() => groupAlbums(filtered), [filtered])
  const artists = useMemo(() => {
    const m = new Map<
      string,
      { name: string; tracks: number; albums: Set<string>; coverId: number | null }
    >()
    for (const t of filtered) {
      const a = m.get(t.albumArtist) ?? {
        name: t.albumArtist,
        tracks: 0,
        albums: new Set(),
        coverId: null
      }
      a.tracks++
      a.albums.add(t.album)
      if (a.coverId == null && t.hasCover) a.coverId = t.id
      m.set(t.albumArtist, a)
    }
    return [...m.values()].sort((a, b) => a.name.localeCompare(b.name))
  }, [filtered])

  const rescan = async (): Promise<void> => {
    setScanning(true)
    try {
      await window.api.library.rescan()
      toast.success('Library rescanned')
    } catch (err) {
      toast.error('Rescan failed', err)
    } finally {
      setScanning(false)
    }
  }

  const setTab = (t: Tab): void => useNav.getState().go({ name: 'library', tab: t, artist })

  return (
    <Page>
      <div className="flex items-end justify-between gap-4 pb-4 pt-2">
        <div>
          <h1 className="text-4xl font-black tracking-tight">{artist ?? 'Your library'}</h1>
          <div className="mt-1 text-muted">
            {filtered.length} songs • {albums.length} albums
            {!artist && ` • ${artists.length} artists`}
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            variant="primary"
            icon={<Play className="h-4 w-4 fill-current" />}
            disabled={!filtered.length}
            onClick={() => player.playList(filtered.map(fromLibrary))}
          >
            Play all
          </Button>
          <Button
            icon={<Shuffle className="h-4 w-4" />}
            disabled={!filtered.length}
            onClick={() => {
              usePlayer.setState({ shuffle: true })
              player.playList(
                filtered.map(fromLibrary),
                Math.floor(Math.random() * filtered.length)
              )
            }}
          >
            Shuffle
          </Button>
          <Button
            variant="ghost"
            icon={<RefreshCw className={scanning ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />}
            onClick={rescan}
            disabled={scanning}
          >
            Rescan
          </Button>
        </div>
      </div>

      <div className="mb-4 flex items-center gap-3">
        <Tabs<Tab>
          value={tab}
          onChange={setTab}
          tabs={[
            { id: 'songs', label: 'Songs' },
            { id: 'albums', label: 'Albums' },
            ...(artist ? [] : [{ id: 'artists' as Tab, label: 'Artists' }])
          ]}
        />
        {artist && (
          <Button
            size="sm"
            variant="ghost"
            icon={<X className="h-3.5 w-3.5" />}
            onClick={() => go({ name: 'library', tab })}
          >
            All artists
          </Button>
        )}
        <div className="relative ml-auto w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter library"
            className="h-9 w-full rounded-full border border-line bg-elev pl-9 pr-3 text-[13px] outline-none placeholder:text-faint focus:border-accent"
          />
        </div>
      </div>

      {loaded && tracks.length === 0 ? (
        <Empty icon={<LibIcon className="h-7 w-7" />} title="Your library is empty">
          Search for music and press the download button, or add a folder with existing music in
          Settings.
          <div className="mt-4">
            <Button variant="primary" onClick={() => go({ name: 'search', q: '' })}>
              Find music
            </Button>
          </div>
        </Empty>
      ) : tab === 'songs' ? (
        <LibraryTable tracks={filtered} scrollEl={scrollEl} />
      ) : tab === 'albums' ? (
        <Grid>
          {albums.map((a) => (
            <button
              key={a.key}
              onClick={() => go({ name: 'libalbum', artist: a.artist, album: a.album })}
              className="group relative flex flex-col gap-2 rounded-xl p-3 text-left transition-colors hover:bg-hover"
            >
              <div className="relative">
                <Cover
                  src={coverUrl(a.coverId)}
                  size="100%"
                  rounded="lg"
                  className="aspect-square shadow-lg"
                />
                <span
                  role="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    player.playList(a.tracks.map(fromLibrary))
                  }}
                  className="absolute bottom-2 right-2 flex h-11 w-11 translate-y-2 items-center justify-center rounded-full bg-accent text-accent-fg opacity-0 shadow-xl transition-all group-hover:translate-y-0 group-hover:opacity-100"
                >
                  <Play className="ml-0.5 h-5 w-5 fill-current" />
                </span>
              </div>
              <div className="min-w-0">
                <div className="truncate font-medium">{a.album}</div>
                <div className="truncate text-[13px] text-muted">
                  {[a.year, a.artist].filter(Boolean).join(' • ')}
                </div>
              </div>
            </button>
          ))}
        </Grid>
      ) : (
        <Grid>
          {artists.map((a) => (
            <button
              key={a.name}
              onClick={() => go({ name: 'library', tab: 'albums', artist: a.name })}
              className="flex flex-col items-center gap-2 rounded-xl p-3 text-center transition-colors hover:bg-hover"
            >
              <Cover
                src={coverUrl(a.coverId)}
                size="100%"
                rounded="full"
                className="aspect-square shadow-lg"
              />
              <div className="w-full min-w-0">
                <div className="truncate font-medium">{a.name}</div>
                <div className="text-[13px] text-muted">
                  {a.albums.size} album{a.albums.size === 1 ? '' : 's'} • {a.tracks} songs
                </div>
              </div>
            </button>
          ))}
        </Grid>
      )}
    </Page>
  )
}
