import { app, Notification } from 'electron'
import { mkdir, rm, readdir } from 'fs/promises'
import { existsSync } from 'fs'
import { join, dirname, extname } from 'path'
import { randomUUID } from 'crypto'
import type { DownloadJob, EnqueueResult, TrackRef } from '../../shared/types'
import { formatArgs } from './format'
import { ytdlpCommand, forceUpdateIfStale, OUTDATED_PATTERN } from '../binaries/manager'
import { run, AbortedError, ProcError } from '../proc'
import { PROGRESS_TEMPLATE, parseProgressLine } from './progress'
import { libraryPath } from '../library/organizer'
import { prepareCover, writeTags, moveFile } from '../library/tagger'
import { addFile, libraryDb } from '../library/library'
import { getSettings } from '../settings'
import { emit } from '../events'
import log from '../log'

const MAX_ATTEMPTS = 3
const jobs = new Map<string, DownloadJob>()
const controllers = new Map<string, AbortController>()
let completedThisRun = 0
let failedThisRun = 0

const tmpRoot = (): string => join(app.getPath('userData'), 'tmp')

function update(job: DownloadJob, patch: Partial<DownloadJob>, persist = true): void {
  Object.assign(job, patch)
  if (persist) libraryDb().saveJob(job)
  emit('downloads:update', job)
}

export function listJobs(): DownloadJob[] {
  return [...jobs.values()]
}

export async function initQueue(): Promise<void> {
  await rm(tmpRoot(), { recursive: true, force: true })
  for (const job of libraryDb().loadJobs()) {
    // Anything interrupted by a restart goes back into the queue.
    if (job.status === 'downloading' || job.status === 'processing') {
      job.status = 'queued'
      job.progress = 0
    }
    jobs.set(job.id, job)
  }
  pump()
}

export function enqueue(tracks: TrackRef[], batch?: string): EnqueueResult {
  const s = getSettings()
  const inLibrary = s.skipExisting ? libraryDb().videoIdsInLibrary() : new Set<string>()
  const active = new Set(
    [...jobs.values()]
      .filter(
        (j) => j.status === 'queued' || j.status === 'downloading' || j.status === 'processing'
      )
      .map((j) => j.track.videoId)
  )
  let queued = 0
  let skipped = 0
  for (const track of tracks) {
    if (inLibrary.has(track.videoId) || active.has(track.videoId)) {
      skipped++
      continue
    }
    active.add(track.videoId)
    const job: DownloadJob = {
      id: randomUUID(),
      track,
      status: 'queued',
      progress: 0,
      attempts: 0,
      createdAt: Date.now() + queued,
      batch
    }
    jobs.set(job.id, job)
    update(job, {})
    queued++
  }
  pump()
  return { queued, skipped }
}

export function cancel(id: string): void {
  const job = jobs.get(id)
  if (!job) return
  controllers.get(id)?.abort()
  if (job.status === 'queued' || job.status === 'downloading' || job.status === 'processing') {
    update(job, { status: 'canceled', speed: null, eta: null })
  }
}

/** On quit: stop running jobs without marking them canceled, so they resume next launch. */
export function stopAll(): void {
  for (const c of controllers.values()) c.abort()
}

export function cancelAll(): void {
  for (const j of jobs.values()) cancel(j.id)
}

export function retry(id: string): void {
  const job = jobs.get(id)
  if (!job || (job.status !== 'error' && job.status !== 'canceled')) return
  update(job, { status: 'queued', progress: 0, attempts: 0, error: undefined })
  pump()
}

export function remove(id: string): void {
  cancel(id)
  jobs.delete(id)
  libraryDb().deleteJob(id)
  emit('downloads:removed', id)
}

export function clearFinished(): void {
  for (const j of [...jobs.values()]) {
    if (j.status === 'done' || j.status === 'canceled' || j.status === 'error') remove(j.id)
  }
}

function pump(): void {
  const limit = getSettings().concurrency
  const running = [...jobs.values()].filter(
    (j) => j.status === 'downloading' || j.status === 'processing'
  ).length
  const next = [...jobs.values()]
    .filter((j) => j.status === 'queued' && !controllers.has(j.id))
    .sort((a, b) => a.createdAt - b.createdAt)
    .slice(0, Math.max(0, limit - running))
  for (const job of next) void start(job)
  if (running === 0 && next.length === 0) onIdle()
}

function onIdle(): void {
  if (!completedThisRun && !failedThisRun) return
  if (getSettings().notifyOnFinish && Notification.isSupported()) {
    const body = failedThisRun
      ? `${completedThisRun} downloaded, ${failedThisRun} failed`
      : `${completedThisRun} track${completedThisRun === 1 ? '' : 's'} added to your library`
    new Notification({ title: 'Downloads finished', body }).show()
  }
  completedThisRun = 0
  failedThisRun = 0
}

async function start(job: DownloadJob): Promise<void> {
  const ctrl = new AbortController()
  controllers.set(job.id, ctrl)
  const work = join(tmpRoot(), job.id)
  try {
    for (;;) {
      update(job, {
        status: 'downloading',
        progress: 0,
        attempts: job.attempts + 1,
        error: undefined
      })
      try {
        const path = await pipeline(job, work, ctrl.signal)
        update(job, { status: 'done', progress: 1, path, speed: null, eta: null })
        completedThisRun++
        break
      } catch (err) {
        if (err instanceof AbortedError || ctrl.signal.aborted) break
        const msg = err instanceof Error ? err.message : String(err)
        const stderr = err instanceof ProcError ? err.result.stderr : msg
        log.warn(`Download ${job.track.videoId} attempt ${job.attempts} failed: ${msg}`)
        if (OUTDATED_PATTERN.test(stderr)) await forceUpdateIfStale()
        if (job.attempts >= MAX_ATTEMPTS) {
          update(job, { status: 'error', error: friendlyError(msg), speed: null, eta: null })
          failedThisRun++
          break
        }
        await new Promise((r) => setTimeout(r, 2000 * job.attempts))
        if (ctrl.signal.aborted) break
      }
    }
  } finally {
    controllers.delete(job.id)
    await rm(work, { recursive: true, force: true }).catch(() => undefined)
    pump()
  }
}

function friendlyError(msg: string): string {
  if (/Video unavailable|Private video|removed/i.test(msg)) return 'This video is unavailable.'
  if (/Sign in to confirm your age|age.restricted/i.test(msg))
    return 'Age-restricted. Add cookies in Settings → Network.'
  if (/not a bot|Sign in to confirm/i.test(msg))
    return 'YouTube asked to sign in. Add cookies in Settings → Network.'
  if (/getaddrinfo|network|timed out|Connection/i.test(msg))
    return 'Network problem. Check your connection.'
  return msg.slice(0, 300)
}

async function pipeline(job: DownloadJob, work: string, signal: AbortSignal): Promise<string> {
  const s = getSettings()
  const t = job.track
  await rm(work, { recursive: true, force: true })
  await mkdir(work, { recursive: true })

  let lastEmit = 0
  const { cmd, args, env } = ytdlpCommand([
    ...formatArgs(s.format, s.bitrate),
    '--no-playlist',
    '--newline',
    '--progress',
    '--progress-template',
    PROGRESS_TEMPLATE,
    '--print',
    'after_move:TBFILE|%(filepath)s',
    '-o',
    join(work, 'audio.%(ext)s'),
    `https://www.youtube.com/watch?v=${t.videoId}`
  ])
  let produced: string | null = null
  await run(cmd, args, {
    env,
    signal,
    onLine: (line) => {
      if (line.startsWith('TBFILE|')) produced = line.slice(7).trim()
      const p = parseProgressLine(line)
      if (p && Date.now() - lastEmit > 200) {
        lastEmit = Date.now()
        update(job, { progress: p.progress * 0.95, speed: p.speed, eta: p.eta }, false)
      }
    }
  })

  if (!produced || !existsSync(produced)) {
    const files = (await readdir(work)).filter(
      (f) => f.startsWith('audio.') && extname(f) === `.${s.format}`
    )
    produced = files[0] ? join(work, files[0]) : null
  }
  if (!produced) throw new Error('yt-dlp finished but no audio file was produced.')

  update(job, { status: 'processing', progress: 0.96, speed: null, eta: null })
  // Ask googleusercontent for a large cover instead of the list-size thumbnail.
  const thumb = t.thumbnail?.replace(/=w\d+-h\d+[^&]*$/, '=w1200-h1200-l90-rj')
  const cover = await prepareCover(
    thumb ?? `https://i.ytimg.com/vi/${t.videoId}/hqdefault.jpg`,
    work
  )
  if (signal.aborted) throw new AbortedError()
  await writeTags(
    produced,
    {
      title: t.title,
      artist: t.artists.join(', '),
      album: t.album,
      albumArtist: t.albumArtist || t.artists[0],
      trackNumber: t.album ? t.trackNumber : null,
      year: t.year,
      videoId: t.videoId
    },
    cover
  )

  let dest = libraryPath(s.libraryDir, t, s.format)
  const owner = existsSync(dest)
    ? libraryDb()
        .allTracks()
        .find((x) => x.path === dest)
    : null
  if (owner && owner.videoId && owner.videoId !== t.videoId) {
    // A different song already has this name: keep both.
    dest = dest.replace(/(\.\w+)$/, ` [${t.videoId}]$1`)
  }
  await mkdir(dirname(dest), { recursive: true })
  await moveFile(produced, dest)
  libraryDb().recordDownload(t.videoId, dest)
  await addFile(dest, t.videoId)
  return dest
}
