import { create } from 'zustand'
import type { DownloadJob, TrackRef } from '@shared/types'
import { toast } from './toast'

interface DownloadState {
  jobs: Record<string, DownloadJob>
  byVideo: Record<string, DownloadJob>
  /** True while a pasted link is being read. */
  resolving: boolean
}

export const useDownloads = create<DownloadState>(() => ({
  jobs: {},
  byVideo: {},
  resolving: false
}))

function index(jobs: Record<string, DownloadJob>): Record<string, DownloadJob> {
  const out: Record<string, DownloadJob> = {}
  for (const j of Object.values(jobs).sort((a, b) => a.createdAt - b.createdAt))
    out[j.track.videoId] = j
  return out
}

export function initDownloadStore(): void {
  void window.api.downloads.list().then((list) => {
    const jobs = Object.fromEntries(list.map((j) => [j.id, j]))
    useDownloads.setState({ jobs, byVideo: index(jobs) })
  })
  window.api.on('downloads:update', (job) => {
    const prev = useDownloads.getState().jobs[job.id]
    const jobs = { ...useDownloads.getState().jobs, [job.id]: job }
    useDownloads.setState({
      jobs,
      byVideo: { ...useDownloads.getState().byVideo, [job.track.videoId]: job }
    })
    if (prev?.status !== 'error' && job.status === 'error')
      toast.error(`Couldn't download “${job.track.title}”`, job.error)
  })
  window.api.on('downloads:removed', (id) => {
    const jobs = { ...useDownloads.getState().jobs }
    delete jobs[id]
    useDownloads.setState({ jobs, byVideo: index(jobs) })
  })
}

export async function download(tracks: TrackRef[], batch?: string): Promise<void> {
  try {
    const r = await window.api.downloads.enqueue(tracks, batch)
    if (r.queued && r.skipped)
      toast.info(
        `Queued ${r.queued} download${r.queued > 1 ? 's' : ''}`,
        `${r.skipped} already in your library or queue`
      )
    else if (r.queued)
      toast.info(
        r.queued === 1 ? `Downloading “${tracks[0].title}”` : `Queued ${r.queued} downloads`
      )
    else toast.info('Already downloaded', 'Everything is already in your library or queue.')
  } catch (err) {
    toast.error('Could not queue download', err)
  }
}

/** Download everything behind a YouTube / YouTube Music link. Returns true on success. */
export async function downloadUrl(url: string): Promise<boolean> {
  useDownloads.setState({ resolving: true })
  try {
    const tracks = await window.api.search.resolveUrl(url.trim())
    if (!tracks.length) {
      toast.info('Nothing to download at that link')
      return false
    }
    await download(tracks, tracks.length > 1 ? (tracks[0].album ?? 'Playlist') : undefined)
    return true
  } catch (err) {
    toast.error('Could not read that link', err)
    return false
  } finally {
    useDownloads.setState({ resolving: false })
  }
}
