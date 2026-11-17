import { BellRing, RefreshCw, X } from 'lucide-react'
import { useFollows, checkNow, toggleFollow, toggleFollowShow } from '../store/follows'
import { useApp } from '../store/app'
import { Button, Cover, Empty, IconButton } from '../components/ui'
import { Page } from './common'
import { go } from '../store/nav'

function ago(ts: number | null): string {
  if (!ts) return 'never'
  const m = Math.round((Date.now() - ts) / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m} min ago`
  const h = Math.round(m / 60)
  return h < 48 ? `${h} hr ago` : `${Math.round(h / 24)} days ago`
}

function FollowRow({
  name,
  thumbnail,
  round,
  detail,
  open,
  unfollow
}: {
  name: string
  thumbnail: string | null
  round: boolean
  detail: string
  open: () => void
  unfollow: () => void
}): React.JSX.Element {
  return (
    <div className="group flex items-center gap-4 rounded-xl px-3 py-2.5 hover:bg-hover">
      <button onClick={open} className="flex min-w-0 flex-1 items-center gap-4 text-left">
        <Cover src={thumbnail ?? undefined} size={52} rounded={round ? 'full' : 'lg'} />
        <div className="min-w-0">
          <div className="truncate font-medium">{name}</div>
          <div className="truncate text-[13px] text-muted">{detail}</div>
        </div>
      </button>
      <IconButton
        label={`Unfollow ${name}`}
        className="opacity-0 group-hover:opacity-100 focus:opacity-100"
        onClick={unfollow}
      >
        <X className="h-4 w-4" />
      </IconButton>
    </div>
  )
}

export function FollowingView(): React.JSX.Element {
  const { artists, shows, checking } = useFollows()
  const settings = useApp((s) => s.settings)
  const update = useApp((s) => s.update)

  return (
    <Page>
      <div className="flex items-end justify-between gap-4 pb-6 pt-2">
        <div>
          <h1 className="text-4xl font-black tracking-tight">Following</h1>
          <div className="mt-1 text-muted">
            {settings?.autoDownloadFollowed
              ? `New songs, albums and episodes download automatically. Checked every ${settings.followCheckHours} hours.`
              : 'Auto-download is off. New releases are only noted when you check.'}
          </div>
        </div>
        <div className="flex gap-2">
          {settings && (
            <Button
              onClick={() => void update({ autoDownloadFollowed: !settings.autoDownloadFollowed })}
            >
              Auto-download: {settings.autoDownloadFollowed ? 'On' : 'Off'}
            </Button>
          )}
          <Button
            variant="primary"
            icon={<RefreshCw className={checking ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />}
            disabled={checking || !(artists.length + shows.length)}
            onClick={() => void checkNow()}
          >
            {checking ? 'Checking…' : 'Check now'}
          </Button>
        </div>
      </div>

      {artists.length === 0 && shows.length === 0 ? (
        <Empty icon={<BellRing className="h-7 w-7" />} title="You’re not following anyone yet">
          Press <b>Follow</b> on an artist, podcast or channel. New songs, albums and episodes will
          download to your library automatically.
        </Empty>
      ) : (
        <>
          {artists.length > 0 && (
            <section className="mb-8">
              <h2 className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-faint">
                Artists
              </h2>
              {artists.map((a) => (
                <FollowRow
                  key={a.channelId}
                  name={a.name}
                  thumbnail={a.thumbnail}
                  round
                  detail={`Checked ${ago(a.lastChecked)}${a.lastNew ? ` · new music ${ago(a.lastNew)}` : ''}`}
                  open={() => go({ name: 'artist', id: a.channelId })}
                  unfollow={() => void toggleFollow({ channelId: a.channelId, name: a.name })}
                />
              ))}
            </section>
          )}
          {shows.length > 0 && (
            <section>
              <h2 className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-faint">
                Podcasts & channels
              </h2>
              {shows.map((sh) => (
                <FollowRow
                  key={sh.id}
                  name={sh.title}
                  thumbnail={sh.thumbnail}
                  round={sh.kind === 'channel'}
                  detail={`${sh.kind === 'channel' ? 'Channel' : 'Podcast'} · checked ${ago(sh.lastChecked)}${sh.lastNew ? ` · new episode ${ago(sh.lastNew)}` : ''}`}
                  open={() => go({ name: 'show', kind: sh.kind, id: sh.id })}
                  unfollow={() =>
                    void toggleFollowShow({ kind: sh.kind, id: sh.id, title: sh.title })
                  }
                />
              ))}
            </section>
          )}
        </>
      )}
    </Page>
  )
}
