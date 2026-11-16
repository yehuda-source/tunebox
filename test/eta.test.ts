import { describe, expect, it } from 'vitest'
import type { DownloadJob } from '../src/shared/types'
import { formatEta, queueEta } from '../src/renderer/src/lib/eta'

const job = (status: DownloadJob['status'], progress = 0): DownloadJob => ({
  id: Math.random().toString(),
  track: { videoId: 'x', title: 't', artists: ['a'] },
  status,
  progress,
  attempts: 1,
  createdAt: 0
})

describe('queueEta', () => {
  const now = 100_000
  // One song finished every 10 seconds.
  const steady = [40_000, 50_000, 60_000, 70_000, 80_000, 90_000, 100_000]

  it('is zero when nothing is left', () => {
    expect(queueEta([job('done')], steady, now)).toBe(0)
  })
  it('waits for a few completions before estimating', () => {
    expect(queueEta([job('queued')], [90_000, 100_000], now)).toBeNull()
  })
  it('uses the observed finishing rate', () => {
    expect(
      queueEta(
        Array.from({ length: 6 }, () => job('queued')),
        steady,
        now
      )
    ).toBeCloseTo(60, 5)
  })
  it('counts running jobs as partly done', () => {
    expect(queueEta([job('downloading', 0.5), job('queued')], steady, now)).toBeCloseTo(15, 5)
  })
  it('slows the estimate down when nothing has finished for a while', () => {
    const later = queueEta([job('queued')], steady, now + 60_000)!
    expect(later).toBeGreaterThan(10)
  })
})

describe('formatEta', () => {
  it('reads naturally', () => {
    expect(formatEta(null)).toBe('estimating time left…')
    expect(formatEta(30)).toBe('less than a minute left')
    expect(formatEta(12 * 60)).toBe('about 12 min left')
    expect(formatEta(80 * 60)).toBe('about 1 hr 20 min left')
    expect(formatEta(120 * 60)).toBe('about 2 hr left')
  })
})
