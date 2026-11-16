import type { DownloadJob } from '@shared/types'

const WINDOW = 20

/**
 * Estimated seconds until the whole download queue is done, from how fast jobs have actually
 * been finishing (so concurrency, connection speed and song length are all accounted for).
 * Returns null until there's enough history to say anything sensible.
 */
export function queueEta(
  jobs: DownloadJob[],
  completions: number[],
  now = Date.now()
): number | null {
  const remaining = jobs.filter(
    (j) => j.status === 'queued' || j.status === 'downloading' || j.status === 'processing'
  )
  if (!remaining.length) return 0
  const recent = completions.slice(-WINDOW)
  if (recent.length < 3) return null
  // Jobs finished per second over the recent window, including the quiet time since the last one.
  const span = Math.max(now, recent[recent.length - 1]) - recent[0]
  if (span <= 0) return null
  const rate = (recent.length - 1) / (span / 1000)
  // Jobs already underway count as partly done.
  const work = remaining.reduce(
    (n, j) => n + (j.status === 'queued' ? 1 : Math.max(0.05, 1 - j.progress)),
    0
  )
  return work / rate
}

export function formatEta(sec: number | null): string {
  if (sec == null) return 'estimating time left…'
  if (sec < 60) return 'less than a minute left'
  const min = Math.round(sec / 60)
  if (min < 60) return `about ${min} min left`
  const h = Math.floor(min / 60)
  const m = min % 60
  return `about ${h} hr${m ? ` ${m} min` : ''} left`
}
