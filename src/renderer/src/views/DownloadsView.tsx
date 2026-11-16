import { useMemo, useState } from 'react'
import {
  Download,
  Link2,
  X,
  RotateCcw,
  FolderOpen,
  Trash2,
  Ban,
  CheckCircle2,
  AlertCircle,
  Clock3
} from 'lucide-react'
import type { DownloadJob } from '@shared/types'
import { useDownloads, downloadUrl } from '../store/downloads'
import { useLibrary } from '../store/library'
import { Button, Cover, IconButton, ProgressBar, Empty, Spinner } from '../components/ui'
import { Page } from './common'
import { bytes, cn } from '../lib/format'

function eta(sec?: number | null): string {
  if (!sec) return ''
  return sec > 60 ? `${Math.round(sec / 60)} min left` : `${Math.round(sec)}s left`
}

function JobRow({ job }: { job: DownloadJob }): React.JSX.Element {
  const local = useLibrary((s) => s.byVideo.get(job.track.videoId))
  const active = job.status === 'downloading' || job.status === 'processing'
  return (
    <div className="group flex items-center gap-4 rounded-xl px-3 py-2.5 hover:bg-hover">
      <Cover src={job.track.thumbnail} size={48} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate font-medium">{job.track.title}</span>
          {job.batch && (
            <span className="hidden shrink-0 truncate rounded-full bg-elev px-2 py-0.5 text-[11px] text-muted lg:inline">
              {job.batch}
            </span>
          )}
        </div>
        <div className="truncate text-[13px] text-muted">{job.track.artists.join(', ')}</div>
        {active && (
          <div className="mt-1.5 flex items-center gap-3">
            <ProgressBar value={job.progress} className="max-w-md" />
            <span className="shrink-0 text-xs tabular-nums text-muted">
              {job.status === 'processing'
                ? 'Tagging…'
                : job.progress === 0
                  ? 'Preparing…'
                  : job.progress >= 0.95
                    ? 'Converting…'
                    : `${Math.round(job.progress * 100)}%`}
              {job.speed ? ` · ${bytes(job.speed)}/s` : ''}
              {job.eta ? ` · ${eta(job.eta)}` : ''}
            </span>
          </div>
        )}
        {job.status === 'error' && (
          <div className="mt-1 truncate text-xs text-danger" title={job.error}>
            {job.error}
          </div>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-1 text-[13px]">
        {job.status === 'queued' && (
          <span className="flex items-center gap-1.5 text-muted">
            <Clock3 className="h-4 w-4" />
            Queued
          </span>
        )}
        {job.status === 'done' && (
          <span className="flex items-center gap-1.5 text-ok">
            <CheckCircle2 className="h-4 w-4" />
            Done
          </span>
        )}
        {job.status === 'canceled' && <span className="text-faint">Canceled</span>}
        {job.status === 'error' && <AlertCircle className="h-4 w-4 text-danger" />}
        {active && <Spinner className="h-4 w-4 text-accent" />}
        <div className="ml-2 flex">
          {(job.status === 'error' || job.status === 'canceled') && (
            <IconButton label="Retry" onClick={() => void window.api.downloads.retry(job.id)}>
              <RotateCcw className="h-4 w-4" />
            </IconButton>
          )}
          {job.status === 'done' && local && (
            <IconButton
              label="Show in folder"
              onClick={() => void window.api.library.showInFolder(local.id)}
            >
              <FolderOpen className="h-4 w-4" />
            </IconButton>
          )}
          {(active || job.status === 'queued') && (
            <IconButton label="Cancel" onClick={() => void window.api.downloads.cancel(job.id)}>
              <X className="h-4 w-4" />
            </IconButton>
          )}
          {!active && job.status !== 'queued' && (
            <IconButton
              label="Remove from list"
              className="opacity-0 group-hover:opacity-100"
              onClick={() => void window.api.downloads.remove(job.id)}
            >
              <Trash2 className="h-4 w-4" />
            </IconButton>
          )}
        </div>
      </div>
    </div>
  )
}

export function DownloadsView(): React.JSX.Element {
  const jobs = useDownloads((s) => s.jobs)
  const [url, setUrl] = useState('')

  const resolving = useDownloads((s) => s.resolving)

  const { active, finished } = useMemo(() => {
    const all = Object.values(jobs).sort((a, b) => a.createdAt - b.createdAt)
    return {
      active: all.filter(
        (j) => j.status === 'queued' || j.status === 'downloading' || j.status === 'processing'
      ),
      finished: all
        .filter((j) => j.status === 'done' || j.status === 'error' || j.status === 'canceled')
        .reverse()
    }
  }, [jobs])
  const failed = finished.filter((j) => j.status === 'error')

  return (
    <Page>
      <div className="flex items-end justify-between pb-6 pt-2">
        <div>
          <h1 className="text-4xl font-black tracking-tight">Downloads</h1>
          <div className="mt-1 text-muted">
            {active.length ? `${active.length} in progress` : 'Nothing downloading'} •{' '}
            {finished.filter((j) => j.status === 'done').length} completed
          </div>
        </div>
        <div className="flex gap-2">
          {failed.length > 0 && (
            <Button
              icon={<RotateCcw className="h-4 w-4" />}
              onClick={() => failed.forEach((j) => void window.api.downloads.retry(j.id))}
            >
              Retry failed ({failed.length})
            </Button>
          )}
          {active.length > 0 && (
            <Button
              variant="danger"
              icon={<Ban className="h-4 w-4" />}
              onClick={() => void window.api.downloads.cancelAll()}
            >
              Cancel all
            </Button>
          )}
          {finished.length > 0 && (
            <Button variant="ghost" onClick={() => void window.api.downloads.clearFinished()}>
              Clear finished
            </Button>
          )}
        </div>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          void downloadUrl(url).then((ok) => ok && setUrl(''))
        }}
        className="mb-8 flex gap-2 rounded-2xl border border-line bg-panel p-2"
      >
        <div className="relative flex-1">
          <Link2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="Paste a YouTube or YouTube Music link — song, album or playlist"
            className="h-10 w-full rounded-xl bg-transparent pl-10 pr-3 outline-none placeholder:text-faint"
          />
        </div>
        <Button
          type="submit"
          variant="primary"
          disabled={!url.trim() || resolving}
          icon={resolving ? <Spinner /> : <Download className="h-4 w-4" />}
        >
          {resolving ? 'Reading link…' : 'Download'}
        </Button>
      </form>

      {active.length === 0 && finished.length === 0 ? (
        <Empty icon={<Download className="h-7 w-7" />} title="No downloads yet">
          Downloads you start from search, albums or artist pages show up here.
        </Empty>
      ) : (
        <>
          {active.length > 0 && (
            <section className="mb-8">
              <h2 className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-faint">
                In progress
              </h2>
              {active.map((j) => (
                <JobRow key={j.id} job={j} />
              ))}
            </section>
          )}
          {finished.length > 0 && (
            <section className={cn(active.length > 0 && 'border-t border-line pt-6')}>
              <h2 className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-faint">
                Finished
              </h2>
              {finished.map((j) => (
                <JobRow key={j.id} job={j} />
              ))}
            </section>
          )}
        </>
      )}
    </Page>
  )
}
