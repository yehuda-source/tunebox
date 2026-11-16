import { BellRing, RefreshCw, X } from 'lucide-react'
import { useFollows, checkNow, toggleFollow } from '../store/follows'
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

export function FollowingView(): React.JSX.Element {
  const { artists, checking } = useFollows()
  const settings = useApp((s) => s.settings)
  const update = useApp((s) => s.update)

  return (
    <Page>
      <div className="flex items-end justify-between gap-4 pb-6 pt-2">
        <div>
          <h1 className="text-4xl font-black tracking-tight">Following</h1>
          <div className="mt-1 text-muted">
            {settings?.autoDownloadFollowed
              ? `New songs and albums from these artists download automatically. Checked every ${settings.followCheckHours} hours.`
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
            disabled={checking || !artists.length}
            onClick={() => void checkNow()}
          >
            {checking ? 'Checking…' : 'Check now'}
          </Button>
        </div>
      </div>

      {artists.length === 0 ? (
        <Empty icon={<BellRing className="h-7 w-7" />} title="You’re not following anyone yet">
          Open an artist page and press <b>Follow</b>. Their new songs and albums will download to
          your library automatically.
        </Empty>
      ) : (
        <div className="flex flex-col">
          {artists.map((a) => (
            <div
              key={a.channelId}
              className="group flex items-center gap-4 rounded-xl px-3 py-2.5 hover:bg-hover"
            >
              <button
                onClick={() => go({ name: 'artist', id: a.channelId })}
                className="flex min-w-0 flex-1 items-center gap-4 text-left"
              >
                <Cover src={a.thumbnail ?? undefined} size={52} rounded="full" />
                <div className="min-w-0">
                  <div className="truncate font-medium">{a.name}</div>
                  <div className="text-[13px] text-muted">
                    Checked {ago(a.lastChecked)}
                    {a.lastNew ? ` · new music ${ago(a.lastNew)}` : ''}
                  </div>
                </div>
              </button>
              <IconButton
                label={`Unfollow ${a.name}`}
                className="opacity-0 group-hover:opacity-100"
                onClick={() => void toggleFollow({ channelId: a.channelId, name: a.name })}
              >
                <X className="h-4 w-4" />
              </IconButton>
            </div>
          ))}
        </div>
      )}
    </Page>
  )
}
