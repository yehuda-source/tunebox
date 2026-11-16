import { useMemo, useState } from 'react'
import { Search, Download, Library, AlertTriangle, Play } from 'lucide-react'
import { useLibrary, groupAlbums, coverUrl } from '../store/library'
import { useDownloads, downloadUrl } from '../store/downloads'
import { useApp } from '../store/app'
import { Cover, SectionTitle, Button } from '../components/ui'
import { Page, Grid } from './common'
import { go } from '../store/nav'
import { player, fromLibrary } from '../store/player'

const IDEAS = [
  'Daft Punk',
  'Lo-fi beats',
  'Fleetwood Mac Rumours',
  'Hans Zimmer',
  'Taylor Swift',
  'Jazz classics',
  'Radiohead',
  'Synthwave'
]

function greeting(): string {
  const h = new Date().getHours()
  return h < 5 ? 'Good night' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
}

export function HomeView(): React.JSX.Element {
  const tracks = useLibrary((s) => s.tracks)
  const jobs = useDownloads((s) => s.jobs)
  const tools = useApp((s) => s.tools)
  const [query, setQuery] = useState('')
  const active = Object.values(jobs).filter(
    (j) => j.status === 'downloading' || j.status === 'queued' || j.status === 'processing'
  ).length

  const recent = useMemo(() => {
    const albums = groupAlbums(tracks)
    return albums
      .map((a) => ({ ...a, added: Math.max(...a.tracks.map((t) => t.addedAt)) }))
      .sort((a, b) => b.added - a.added)
      .slice(0, 12)
  }, [tracks])

  const toolsBroken =
    tools &&
    !tools.busy &&
    (tools.ytdlp.source === 'missing' ||
      tools.ffmpeg.source === 'missing' ||
      tools.selfTest?.ok === false)

  return (
    <Page>
      <div className="relative -mx-8 mb-6 overflow-hidden px-8 pb-10 pt-6">
        <div className="pointer-events-none absolute -left-20 -top-40 h-96 w-[60rem] rounded-full bg-accent/20 blur-3xl" />
        <h1 className="relative text-5xl font-black tracking-tight">{greeting()}</h1>
        <p className="relative mt-2 text-lg text-muted">What do you want to listen to?</p>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            const v = query.trim()
            if (!v) return
            if (/^https?:\/\//.test(v)) {
              go({ name: 'downloads' })
              void downloadUrl(v)
            } else go({ name: 'search', q: v })
          }}
          className="relative mt-6 flex h-14 w-full max-w-2xl items-center gap-3 rounded-2xl border border-line bg-panel px-5 shadow-xl transition-colors focus-within:border-accent/60 hover:border-accent/60"
        >
          <Search className="h-5 w-5 shrink-0 text-muted" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search songs, albums and artists — or paste a link"
            className="h-full flex-1 bg-transparent text-[15px] outline-none placeholder:text-faint"
            spellCheck={false}
          />
          <kbd className="rounded-md border border-line px-2 py-0.5 text-xs text-muted">Enter</kbd>
        </form>
        <div className="relative mt-4 flex flex-wrap gap-2">
          {IDEAS.map((q) => (
            <button
              key={q}
              onClick={() => go({ name: 'search', q })}
              className="rounded-full bg-elev px-3.5 py-1.5 text-[13px] text-muted hover:bg-hover hover:text-fg"
            >
              {q}
            </button>
          ))}
        </div>
      </div>

      {toolsBroken && (
        <div className="mb-6 flex items-center gap-4 rounded-2xl border border-danger/40 bg-danger/10 p-4">
          <AlertTriangle className="h-5 w-5 shrink-0 text-danger" />
          <div className="flex-1">
            <div className="font-medium">Downloads may not work right now</div>
            <div className="text-[13px] text-muted">
              {tools?.selfTest?.message ?? 'A required tool is missing.'}
            </div>
          </div>
          <Button onClick={() => go({ name: 'settings' })}>Open tools</Button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <button
          onClick={() => go({ name: 'library', tab: 'songs' })}
          className="flex items-center gap-4 rounded-2xl bg-panel p-5 text-left transition-colors hover:bg-hover"
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent-soft text-accent">
            <Library className="h-6 w-6" />
          </div>
          <div>
            <div className="text-2xl font-bold">{tracks.length}</div>
            <div className="text-[13px] text-muted">songs in your library</div>
          </div>
        </button>
        <button
          onClick={() => go({ name: 'downloads' })}
          className="flex items-center gap-4 rounded-2xl bg-panel p-5 text-left transition-colors hover:bg-hover"
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent-soft text-accent">
            <Download className="h-6 w-6" />
          </div>
          <div>
            <div className="text-2xl font-bold">{active}</div>
            <div className="text-[13px] text-muted">
              {active === 1 ? 'download' : 'downloads'} in progress
            </div>
          </div>
        </button>
        <button
          disabled={!tracks.length}
          onClick={() => {
            const shuffled = [...tracks].sort(() => Math.random() - 0.5).slice(0, 200)
            player.playList(shuffled.map(fromLibrary))
          }}
          className="flex items-center gap-4 rounded-2xl bg-panel p-5 text-left transition-colors hover:bg-hover disabled:opacity-50"
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent text-accent-fg">
            <Play className="ml-0.5 h-6 w-6 fill-current" />
          </div>
          <div>
            <div className="text-lg font-bold">Shuffle library</div>
            <div className="text-[13px] text-muted">Play a random mix</div>
          </div>
        </button>
      </div>

      {recent.length > 0 && (
        <>
          <SectionTitle
            action={
              <button
                className="text-[13px] font-semibold text-muted hover:text-fg"
                onClick={() => go({ name: 'library', tab: 'albums' })}
              >
                Show all
              </button>
            }
          >
            Recently added
          </SectionTitle>
          <Grid>
            {recent.map((a) => (
              <button
                key={a.key}
                onClick={() => go({ name: 'libalbum', artist: a.artist, album: a.album })}
                className="flex flex-col gap-2 rounded-xl p-3 text-left transition-colors hover:bg-hover"
              >
                <Cover
                  src={coverUrl(a.coverId)}
                  size="100%"
                  rounded="lg"
                  className="aspect-square shadow-lg"
                />
                <div className="min-w-0">
                  <div className="truncate font-medium">{a.album}</div>
                  <div className="truncate text-[13px] text-muted">{a.artist}</div>
                </div>
              </button>
            ))}
          </Grid>
        </>
      )}
    </Page>
  )
}
