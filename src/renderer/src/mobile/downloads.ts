// The phone download queue: a port of src/main/downloads/queue.ts on top of the Ytdlp plugin.
import type { DownloadJob, EnqueueResult, TrackRef } from '@shared/types'
import { formatArgs } from '@shared/format'
import { PROGRESS_TEMPLATE, parseProgressLine } from '@shared/progress'
import { chooseDestination, formatUploadDate, libraryPath } from '@shared/organizer'
import { friendlyError, OUTDATED_PATTERN } from '@shared/errors'
import { findAlternative, SIGN_IN_PATTERN } from '@shared/alternatives'
import { SongIndex } from '@shared/songKey'
import { db } from './db'
import { emit } from './events'
import { addDownloaded } from './library'
import { Files } from './native'
import { getSettings, paths } from './settings'
import { prepareCover, writeTags } from './tags'
import { cancelYtdlp, ytdlp, YtdlpError } from './ytdlp'

const MAX_ATTEMPTS = 3
const jobs = new Map<string, DownloadJob>()
const running = new Set<string>()
const canceled = new Set<string>()
const reservedPaths = new Map<string, string>()
let updateIfOutdated: () => Promise<void> = async () => undefined

function update(job: DownloadJob, patch: Partial<DownloadJob>, persist = true): void {
  Object.assign(job, patch)
  if (persist) db.saveJob(job)
  emit('downloads:update', { ...job })
}

export const listJobs = (): DownloadJob[] => [...jobs.values()].map((j) => ({ ...j }))

export async function initQueue(opts: { updateIfOutdated: () => Promise<void> }): Promise<void> {
  updateIfOutdated = opts.updateIfOutdated
  await Files.remove({ path: paths.work }).catch(() => undefined)
  for (const job of db.loadJobs()) {
    // Anything interrupted (the app was closed) goes back into the queue.
    if (job.status === 'downloading' || job.status === 'processing') {
      job.status = 'queued'
      job.progress = 0
    }
    jobs.set(job.id, job)
  }
  pump()
}

const isActive = (j: DownloadJob): boolean =>
  j.status === 'queued' || j.status === 'downloading' || j.status === 'processing'

export function enqueue(tracks: TrackRef[], batch?: string): EnqueueResult {
  const s = getSettings()
  const inLibrary = s.skipExisting ? db.videoIdsInLibrary() : new Set<string>()
  const activeJobs = [...jobs.values()].filter(isActive)
  const active = new Set(activeJobs.map((j) => j.track.videoId))
  // The same song often appears on several albums/compilations under different video ids.
  const songs = new SongIndex<{ durationSec?: number | null }>()
  if (s.skipDuplicates) {
    for (const t of db.allTracks()) songs.add(t.title, t.artist, t)
    for (const j of activeJobs) songs.add(j.track.title, j.track.artists.join(', '), j.track)
  }
  let queued = 0
  let skipped = 0
  for (const track of tracks) {
    const artist = track.artists.join(', ')
    if (
      inLibrary.has(track.videoId) ||
      active.has(track.videoId) ||
      (s.skipDuplicates && songs.find(track.title, artist, track.durationSec))
    ) {
      skipped++
      continue
    }
    active.add(track.videoId)
    if (s.skipDuplicates) songs.add(track.title, artist, track)
    const job: DownloadJob = {
      id: crypto.randomUUID(),
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
  if (running.has(id)) {
    canceled.add(id)
    void cancelYtdlp(id)
  }
  if (isActive(job)) update(job, { status: 'canceled', speed: null, eta: null })
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
  db.deleteJob(id)
  emit('downloads:removed', id)
}

export function clearFinished(): void {
  for (const j of [...jobs.values()])
    if (j.status === 'done' || j.status === 'canceled' || j.status === 'error') remove(j.id)
}

function pump(): void {
  const limit = Math.max(1, getSettings().concurrency)
  const next = [...jobs.values()]
    .filter((j) => j.status === 'queued' && !running.has(j.id))
    .sort((a, b) => a.createdAt - b.createdAt)
    .slice(0, Math.max(0, limit - running.size))
  for (const job of next) void start(job)
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

async function start(job: DownloadJob): Promise<void> {
  running.add(job.id)
  canceled.delete(job.id)
  const work = `${paths.work}/${job.id}`
  const stopped = (): boolean => canceled.has(job.id)
  try {
    for (;;) {
      update(job, {
        status: 'downloading',
        progress: 0,
        attempts: job.attempts + 1,
        error: undefined
      })
      try {
        const path = await pipeline(job, work, stopped)
        update(job, { status: 'done', progress: 1, path, speed: null, eta: null })
        break
      } catch (err) {
        if (stopped() || (err instanceof YtdlpError && err.canceled)) break
        const msg = err instanceof Error ? err.message : String(err)
        const stderr = err instanceof YtdlpError ? err.stderr : msg
        console.warn(`Download ${job.track.videoId} attempt ${job.attempts} failed: ${msg}`)
        // Retrying a sign-in block never helps; try another upload of the same song instead.
        if (SIGN_IN_PATTERN.test(stderr) && !job.substitute) {
          const alt = await findAlternative(job.track)
          if (stopped()) break
          if (alt && db.videoIdsInLibrary().has(alt.videoId)) {
            update(job, {
              status: 'done',
              progress: 1,
              substitute:
                'This upload needs a YouTube sign-in; you already have another upload of the song.'
            })
            break
          }
          if (alt) {
            update(job, {
              track: { ...alt },
              attempts: 0,
              substitute: `The original upload needs a YouTube sign-in, so another upload of the same song was used (“${alt.title}”).`
            })
            continue
          }
          update(job, { status: 'error', error: friendlyError(msg), speed: null, eta: null })
          break
        }
        if (OUTDATED_PATTERN.test(stderr)) await updateIfOutdated()
        if (job.attempts >= MAX_ATTEMPTS) {
          update(job, { status: 'error', error: friendlyError(msg), speed: null, eta: null })
          break
        }
        await sleep(2000 * job.attempts)
        if (stopped()) break
      }
    }
  } finally {
    running.delete(job.id)
    canceled.delete(job.id)
    await Files.remove({ path: work }).catch(() => undefined)
    pump()
  }
}

async function pipeline(job: DownloadJob, work: string, stopped: () => boolean): Promise<string> {
  const s = getSettings()
  const t = job.track
  await Files.remove({ path: work })
  await Files.mkdirs({ path: work })
  const infoFile = `${work}/info.txt`

  let lastEmit = 0
  await ytdlp(
    [
      ...formatArgs(s.format, s.bitrate),
      '--no-playlist',
      '--newline',
      '--progress',
      '--progress-template',
      PROGRESS_TEMPLATE,
      // --print would silence the progress lines, so details go to a file instead.
      '--print-to-file',
      'after_move:%(filepath)s\t%(upload_date)s\t%(duration)s',
      infoFile,
      '-o',
      `${work}/audio.%(ext)s`,
      `https://www.youtube.com/watch?v=${t.videoId}`
    ],
    {
      id: job.id,
      onLine: (line) => {
        const p = parseProgressLine(line)
        if (p && Date.now() - lastEmit > 300) {
          lastEmit = Date.now()
          update(job, { progress: p.progress * 0.95, speed: p.speed, eta: p.eta }, false)
        }
      }
    }
  )

  const info =
    ((await Files.readText({ path: infoFile })).text ?? '').trim().split('\n').at(-1) ?? ''
  const [filepath, rawDate, rawDuration] = info.split('\t')
  let produced: string | null =
    filepath && (await Files.stat({ path: filepath })).exists ? filepath : null
  if (!produced) {
    const { names } = await Files.list({ path: work })
    const name = names.find((n) => n.startsWith('audio.') && n.endsWith(`.${s.format}`))
    produced = name ? `${work}/${name}` : null
  }
  if (!produced) throw new Error('yt-dlp finished but no audio file was produced.')
  const uploadDate = formatUploadDate(rawDate)
  const ext = produced.slice(produced.lastIndexOf('.') + 1)

  update(job, { status: 'processing', progress: 0.96, speed: null, eta: null })
  // Ask googleusercontent for a large cover instead of the list-size thumbnail.
  const thumb = t.thumbnail?.replace(/=w\d+-h\d+[^&]*$/, '=w1200-h1200-l90-rj')
  const cover = await prepareCover(
    thumb ?? `https://i.ytimg.com/vi/${t.videoId}/hqdefault.jpg`,
    work
  )
  if (stopped()) throw new YtdlpError('Canceled', '', true)
  const episode = Boolean(t.show)
  const tags = {
    title: t.title,
    artist: t.artists.join(', '),
    album: episode ? t.show : t.album,
    albumArtist: episode ? t.show : t.albumArtist || t.artists[0],
    trackNumber: episode ? null : t.album ? t.trackNumber : null,
    year: episode ? (uploadDate ?? t.year) : (t.year ?? uploadDate?.slice(0, 4)),
    videoId: t.videoId
  }
  await writeTags(produced, tags, cover)

  // Concurrent jobs can target the same name, so paths are reserved until the file is in place.
  const target = libraryPath(paths.music, t, ext, uploadDate)
  const exists = new Set<string>()
  if ((await Files.stat({ path: target })).exists) exists.add(target)
  const dest = chooseDestination(
    target,
    t.videoId,
    (p) => exists.has(p),
    (p) => db.trackForPath(p)?.videoId ?? null,
    reservedPaths
  )
  reservedPaths.set(dest, t.videoId)
  try {
    await Files.move({ from: produced, to: dest })
  } finally {
    reservedPaths.delete(dest)
  }
  const duration = Number(rawDuration)
  await addDownloaded(
    {
      path: dest,
      title: tags.title,
      artist: tags.artist,
      album: tags.album ?? '',
      albumArtist: tags.albumArtist ?? '',
      trackNumber: tags.trackNumber ?? null,
      year: tags.year ?? null,
      durationSec:
        Number.isFinite(duration) && duration > 0 ? Math.round(duration) : (t.durationSec ?? null),
      videoId: t.videoId
    },
    cover
  )
  return dest
}
