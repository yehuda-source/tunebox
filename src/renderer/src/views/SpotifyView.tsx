import { useEffect, useMemo, useState } from 'react'
import {
  ArrowRight,
  Check,
  CircleHelp,
  CircleX,
  Copy,
  ExternalLink,
  Heart,
  Import,
  Link2,
  LogOut,
  Library as LibraryIcon
} from 'lucide-react'
import type { SpotifyMatch, SpotifyMatchStatus } from '@shared/types'
import {
  useSpotify,
  initSpotify,
  saveClientId,
  signIn,
  signOut,
  open,
  toggle,
  selectMany,
  reset,
  importSelected
} from '../store/spotify'
import { Button, Cover, Empty, ProgressBar, Spinner, Tabs } from '../components/ui'
import { Page } from './common'
import { toast } from '../store/toast'
import { go } from '../store/nav'
import { duration, cn } from '../lib/format'

const STATUS: Record<SpotifyMatchStatus, { label: string; className: string; Icon: typeof Check }> =
  {
    match: { label: 'Ready', className: 'text-ok', Icon: Check },
    check: { label: 'Check', className: 'text-amber-400', Icon: CircleHelp },
    missing: { label: 'Not found', className: 'text-danger', Icon: CircleX },
    library: { label: 'In library', className: 'text-accent', Icon: LibraryIcon }
  }

function CopyField({ value }: { value: string }): React.JSX.Element {
  return (
    <div className="flex items-center gap-2">
      <code className="flex-1 truncate rounded-lg border border-line bg-elev px-3 py-2 text-[13px] select-text">
        {value}
      </code>
      <Button
        size="sm"
        icon={<Copy className="h-3.5 w-3.5" />}
        onClick={() => {
          void navigator.clipboard.writeText(value)
          toast.info('Copied')
        }}
      >
        Copy
      </Button>
    </div>
  )
}

function Setup(): React.JSX.Element {
  const status = useSpotify((s) => s.status)!
  const [id, setId] = useState(status.clientId)
  return (
    <div className="max-w-2xl">
      <p className="text-muted">
        TuneBox reads your Spotify playlists and albums, finds the same songs on YouTube Music and
        downloads them. Spotify requires a free developer app for this. It takes about five minutes,
        once.
      </p>
      <ol className="mt-6 flex flex-col gap-6">
        <li>
          <div className="font-semibold">1. Create a Spotify app</div>
          <p className="mt-1 text-[13px] text-muted">
            Sign in at the Spotify developer dashboard and press <b>Create app</b>. Any name and
            description work. Under “Which API/SDKs are you planning to use?” tick <b>Web API</b>.
          </p>
          <div className="mt-2">
            <Button
              size="sm"
              icon={<ExternalLink className="h-3.5 w-3.5" />}
              onClick={() => window.open('https://developer.spotify.com/dashboard', '_blank')}
            >
              Open developer.spotify.com
            </Button>
          </div>
        </li>
        <li>
          <div className="font-semibold">2. Add this Redirect URI</div>
          <p className="mb-2 mt-1 text-[13px] text-muted">Paste it exactly, then press Add.</p>
          <CopyField value={status.redirectUri} />
        </li>
        <li>
          <div className="font-semibold">3. Paste the app’s Client ID</div>
          <p className="mb-2 mt-1 text-[13px] text-muted">
            Save the app, open its <b>Settings</b>, and copy the <b>Client ID</b>. No client secret
            is needed.
          </p>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              void saveClientId(id)
            }}
          >
            <input
              value={id}
              onChange={(e) => setId(e.target.value)}
              placeholder="32 letters and numbers"
              spellCheck={false}
              className="h-9 flex-1 rounded-lg border border-line bg-elev px-3 font-mono text-[13px] outline-none focus:border-accent"
            />
            <Button type="submit" variant="primary" disabled={!id.trim()}>
              Save
            </Button>
          </form>
        </li>
      </ol>
    </div>
  )
}

function SignIn(): React.JSX.Element {
  const signingIn = useSpotify((s) => s.signingIn)
  return (
    <div className="flex max-w-xl flex-col items-start gap-4">
      <p className="text-muted">
        Sign in so TuneBox can read your playlists and Liked Songs. It only asks to <b>read</b>{' '}
        them; it can’t change anything in your Spotify account.
      </p>
      <div className="flex items-center gap-3">
        <Button
          variant="primary"
          size="lg"
          disabled={signingIn}
          icon={signingIn ? <Spinner /> : undefined}
          onClick={() => void signIn()}
        >
          {signingIn ? 'Finish signing in in your browser…' : 'Sign in with Spotify'}
        </Button>
        <Button variant="ghost" onClick={() => void saveClientId('')}>
          Change Client ID
        </Button>
      </div>
    </div>
  )
}

function Picker(): React.JSX.Element {
  const playlists = useSpotify((s) => s.playlists)
  const phase = useSpotify((s) => s.phase)
  const [link, setLink] = useState('')
  const busy = phase === 'loading' || phase === 'matching'
  return (
    <>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (link.trim()) void open(link)
        }}
        className="mb-8 flex gap-2 rounded-2xl border border-line bg-panel p-2"
      >
        <div className="relative flex-1">
          <Link2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
          <input
            value={link}
            onChange={(e) => setLink(e.target.value)}
            placeholder="Paste a Spotify playlist, album or song link"
            className="h-10 w-full rounded-xl bg-transparent pl-10 pr-3 outline-none placeholder:text-faint"
          />
        </div>
        <Button
          type="submit"
          variant="primary"
          disabled={!link.trim() || busy}
          icon={<Import className="h-4 w-4" />}
        >
          Load
        </Button>
      </form>

      <h2 className="mb-3 text-xl font-bold">Your playlists</h2>
      {!playlists ? (
        <Spinner />
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(170px,1fr))] gap-1">
          {playlists.map((p) => (
            <button
              key={p.id}
              disabled={busy}
              onClick={() => void open(p.id)}
              className="flex flex-col gap-2 rounded-xl p-3 text-left transition-colors hover:bg-hover disabled:opacity-50"
            >
              {p.kind === 'liked' ? (
                <div className="flex aspect-square w-full items-center justify-center rounded-xl bg-gradient-to-br from-accent to-indigo-700 text-white shadow-lg">
                  <Heart className="h-12 w-12 fill-current" />
                </div>
              ) : (
                <Cover src={p.cover} size="100%" rounded="lg" className="aspect-square shadow-lg" />
              )}
              <div className="min-w-0">
                <div className="truncate font-medium">{p.name}</div>
                <div className="truncate text-[13px] text-muted">
                  {p.total} songs{p.owner ? ` • ${p.owner}` : ''}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </>
  )
}

function Row({ m, checked }: { m: SpotifyMatch; checked: boolean }): React.JSX.Element {
  const s = STATUS[m.status]
  const selectable = m.status !== 'library' && Boolean(m.candidate)
  return (
    <label
      className={cn(
        'grid h-16 grid-cols-[28px_minmax(0,1fr)_20px_minmax(0,1fr)_110px] items-center gap-3 rounded-lg px-3 [contain-intrinsic-size:auto_64px] [content-visibility:auto] hover:bg-hover',
        selectable && 'cursor-pointer'
      )}
    >
      <input
        type="checkbox"
        className="h-4 w-4 accent-[var(--accent)]"
        checked={m.status === 'library' || checked}
        disabled={!selectable}
        onChange={() => toggle(m.spotify.id)}
        aria-label={`Include ${m.spotify.title}`}
      />
      <div className="flex min-w-0 items-center gap-3">
        <Cover src={m.spotify.cover} size={40} />
        <div className="min-w-0">
          <div className="truncate font-medium">{m.spotify.title}</div>
          <div className="truncate text-[13px] text-muted">
            {m.spotify.artists.join(', ')} • {duration(m.spotify.durationSec)}
          </div>
        </div>
      </div>
      <ArrowRight className="h-4 w-4 text-faint" />
      <div className="min-w-0">
        {m.status === 'library' ? (
          <div className="text-[13px] text-muted">Already in your library</div>
        ) : m.candidate ? (
          <>
            <div className="truncate text-[13px]">{m.candidate.title}</div>
            <div className="truncate text-xs text-muted">
              {m.candidate.artists.join(', ')} • {duration(m.candidate.durationSec)}
              {m.status === 'missing' && ' • best guess'}
            </div>
          </>
        ) : (
          <div className="text-[13px] text-faint">No YouTube upload found</div>
        )}
      </div>
      <div
        className={cn('flex items-center justify-end gap-1.5 text-[13px] font-medium', s.className)}
      >
        <s.Icon className="h-4 w-4" />
        {s.label}
      </div>
    </label>
  )
}

type Filter = 'all' | SpotifyMatchStatus

function Review(): React.JSX.Element {
  const { collection, matches, selected } = useSpotify()
  const [filter, setFilter] = useState<Filter>('all')
  const [makePlaylist, setMakePlaylist] = useState(
    collection?.kind === 'playlist' || collection?.kind === 'liked'
  )
  const [name, setName] = useState(collection?.name ?? '')
  const [busy, setBusy] = useState(false)

  const counts = useMemo(() => {
    const c: Record<SpotifyMatchStatus, number> = { match: 0, check: 0, missing: 0, library: 0 }
    for (const m of matches) c[m.status]++
    return c
  }, [matches])
  const shown = filter === 'all' ? matches : matches.filter((m) => m.status === filter)
  const selectable = shown.filter((m) => m.status !== 'library' && m.candidate)
  const toDownload = matches.filter(
    (m) => m.status !== 'library' && m.candidate && selected.has(m.spotify.id)
  ).length

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Tabs<Filter>
          value={filter}
          onChange={setFilter}
          tabs={[
            { id: 'all', label: 'All', count: matches.length },
            { id: 'match', label: 'Ready', count: counts.match },
            { id: 'check', label: 'Check', count: counts.check },
            { id: 'missing', label: 'Not found', count: counts.missing },
            { id: 'library', label: 'In library', count: counts.library }
          ]}
        />
        {selectable.length > 0 && (
          <div className="ml-auto flex gap-1">
            <Button
              size="sm"
              variant="ghost"
              onClick={() =>
                selectMany(
                  selectable.map((m) => m.spotify.id),
                  true
                )
              }
            >
              Select all
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() =>
                selectMany(
                  selectable.map((m) => m.spotify.id),
                  false
                )
              }
            >
              Select none
            </Button>
          </div>
        )}
      </div>
      {filter === 'check' && counts.check > 0 && (
        <p className="mb-3 text-[13px] text-muted">
          Same song, but the length differs by 5–30 seconds, usually a music video with an intro.
          Untick any that look wrong.
        </p>
      )}
      {filter === 'missing' && counts.missing > 0 && (
        <p className="mb-3 text-[13px] text-muted">
          No upload with the same title and artist was found. The top search result is shown as a
          guess; tick it only if it’s right.
        </p>
      )}

      <div className="flex flex-col pb-28">
        {shown.map((m) => (
          <Row key={m.spotify.id} m={m} checked={selected.has(m.spotify.id)} />
        ))}
      </div>

      <div className="sticky bottom-0 -mx-8 flex flex-wrap items-center gap-4 border-t border-line bg-bg/95 px-8 py-4 backdrop-blur max-sm:-mx-4 max-sm:px-4">
        <label className="flex items-center gap-2 text-[14px]">
          <input
            type="checkbox"
            className="h-4 w-4 accent-[var(--accent)]"
            checked={makePlaylist}
            onChange={(e) => setMakePlaylist(e.target.checked)}
          />
          Create a TuneBox playlist
        </label>
        {makePlaylist && (
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-label="Playlist name"
            className="h-9 w-64 rounded-lg border border-line bg-elev px-3 text-[13px] outline-none focus:border-accent"
          />
        )}
        <div className="ml-auto flex items-center gap-2">
          <Button variant="ghost" onClick={reset}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={
              busy ||
              (!toDownload && !(makePlaylist && counts.library)) ||
              (makePlaylist && !name.trim())
            }
            icon={busy ? <Spinner /> : <Import className="h-4 w-4" />}
            onClick={async () => {
              setBusy(true)
              const ok = await importSelected(makePlaylist ? name.trim() : null)
              setBusy(false)
              if (ok) {
                reset()
                go({ name: 'downloads' })
              }
            }}
          >
            {toDownload
              ? `Download ${toDownload} song${toDownload === 1 ? '' : 's'}`
              : 'Create playlist'}
          </Button>
        </div>
      </div>
    </>
  )
}

export function SpotifyView(): React.JSX.Element {
  const { status, phase, collection, progress } = useSpotify()
  useEffect(() => void initSpotify(), [])

  return (
    <Page>
      <div className="flex items-end justify-between gap-4 pb-6 pt-2">
        <div className="flex min-w-0 items-center gap-5">
          {collection && phase !== 'idle' && (
            <Cover src={collection.cover} size={96} rounded="lg" className="shadow-xl" />
          )}
          <div className="min-w-0">
            <h1 className="truncate text-4xl font-black tracking-tight">
              {collection && phase !== 'idle' ? collection.name : 'Import from Spotify'}
            </h1>
            <div className="mt-1 text-muted">
              {collection && phase !== 'idle'
                ? `${collection.kind === 'album' ? 'Album' : collection.kind === 'track' ? 'Song' : 'Playlist'}${collection.owner ? ` by ${collection.owner}` : ''} • ${collection.total} songs`
                : 'Bring playlists, albums and Liked Songs into your library.'}
            </div>
          </div>
        </div>
        {status?.signedIn && phase === 'idle' && (
          <Button
            variant="ghost"
            icon={<LogOut className="h-4 w-4" />}
            onClick={() => void signOut()}
          >
            {status.user ? `Sign out ${status.user}` : 'Sign out'}
          </Button>
        )}
      </div>

      {!status ? (
        <Spinner />
      ) : !status.clientId ? (
        <Setup />
      ) : !status.signedIn ? (
        <SignIn />
      ) : phase === 'idle' ? (
        <Picker />
      ) : phase === 'loading' ? (
        <Empty icon={<Spinner className="h-7 w-7" />} title="Reading from Spotify…" />
      ) : phase === 'matching' ? (
        <div className="mx-auto mt-16 flex max-w-md flex-col items-center gap-4 text-center">
          <Spinner className="h-7 w-7 text-accent" />
          <div className="text-lg font-semibold">Finding songs on YouTube Music…</div>
          <ProgressBar value={progress.total ? progress.done / progress.total : 0} />
          <div className="text-[13px] text-muted">
            {progress.done} of {progress.total}
          </div>
        </div>
      ) : (
        <Review key={collection?.id} />
      )}
    </Page>
  )
}
