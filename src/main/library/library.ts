import { app, shell } from 'electron'
import { readdir, stat, mkdir, unlink } from 'fs/promises'
import { join, extname, basename, dirname } from 'path'
import { parseFile } from 'music-metadata'
import { watch, type FSWatcher } from 'chokidar'
import type { DuplicateGroup, LibraryTrack, TagEdit } from '../../shared/types'
import { SongIndex } from '../../shared/songKey'
import { LibraryDb, type TrackRow } from './db'
import { writeTags } from './tagger'
import { getSettings } from '../settings'
import { emit } from '../events'
import log from '../log'

export const AUDIO_EXT = new Set([
  '.mp3',
  '.m4a',
  '.opus',
  '.ogg',
  '.flac',
  '.wav',
  '.aac',
  '.webm'
])

let db: LibraryDb
let watcher: FSWatcher | null = null
const coverCache = new Map<number, { data: Uint8Array; mime: string } | null>()

export function libraryDb(): LibraryDb {
  if (!db) db = new LibraryDb(join(app.getPath('userData'), 'library.db'))
  return db
}

export function roots(): string[] {
  const s = getSettings()
  return [...new Set([s.libraryDir, ...s.extraDirs].filter(Boolean))]
}

const isAudio = (p: string): boolean =>
  AUDIO_EXT.has(extname(p).toLowerCase()) && !p.includes('.tagging.')

async function walk(dir: string, out: string[]): Promise<void> {
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const e of entries) {
    const p = join(dir, e.name)
    if (e.isDirectory()) await walk(p, out)
    else if (e.isFile() && isAudio(p)) out.push(p)
  }
}

async function readTrack(path: string, videoId?: string): Promise<TrackRow> {
  const st = await stat(path)
  let row: TrackRow = {
    path,
    title: basename(path, extname(path)).replace(/^\d+\s*-\s*/, ''),
    artist: basename(dirname(dirname(path))) || 'Unknown Artist',
    album: basename(dirname(path)) || 'Unknown Album',
    albumArtist: '',
    trackNumber: null,
    year: null,
    durationSec: null,
    videoId: videoId ?? null,
    hasCover: false,
    mtime: st.mtimeMs,
    size: st.size
  }
  try {
    const meta = await parseFile(path, { duration: true, skipCovers: false })
    const c = meta.common
    const comment =
      c.comment?.map((x) => (typeof x === 'string' ? x : (x.text ?? ''))).join(' ') ?? ''
    row = {
      ...row,
      title: c.title || row.title,
      artist: c.artist || c.albumartist || row.artist,
      album: c.album || row.album,
      albumArtist: c.albumartist || c.artist || row.artist,
      trackNumber: c.track?.no ?? null,
      year: c.year ? String(c.year) : (c.date?.slice(0, 4) ?? null),
      durationSec: meta.format.duration ?? null,
      videoId: videoId ?? comment.match(/youtube:([\w-]{11})/)?.[1] ?? null,
      hasCover: Boolean(c.picture?.length)
    }
  } catch (err) {
    log.warn(`Could not read tags of ${path}`, err)
  }
  if (!row.albumArtist) row.albumArtist = row.artist
  return row
}

export async function addFile(path: string, videoId?: string): Promise<void> {
  libraryDb().upsertTrack(await readTrack(path, videoId))
  for (const [id] of coverCache) coverCache.delete(id)
  emit('library:changed', null)
}

let scanning: Promise<void> | null = null

export function scan(): Promise<void> {
  if (!scanning) scanning = doScan().finally(() => (scanning = null))
  return scanning
}

async function doScan(): Promise<void> {
  const started = Date.now()
  const files: string[] = []
  for (const r of roots()) await walk(r, files)
  const stamps = libraryDb().fileStamps()
  const seen = new Set(files)
  let changed = 0
  for (const f of files) {
    const st = await stat(f).catch(() => null)
    if (!st) continue
    const old = stamps.get(f)
    if (old && old.mtime === st.mtimeMs && old.size === st.size) continue
    libraryDb().upsertTrack(await readTrack(f))
    changed++
  }
  for (const p of stamps.keys()) {
    if (!seen.has(p)) {
      libraryDb().removePath(p)
      changed++
    }
  }
  coverCache.clear()
  log.info(`Library scan: ${files.length} files, ${changed} changes in ${Date.now() - started}ms`)
  if (changed) emit('library:changed', null)
}

let debounce: NodeJS.Timeout | null = null
const pendingAdds = new Set<string>()

function queueWatchEvent(path: string, removed: boolean): void {
  if (!isAudio(path)) return
  if (removed) {
    pendingAdds.delete(path)
    if (libraryDb().removePath(path)) emit('library:changed', null)
    return
  }
  pendingAdds.add(path)
  if (debounce) clearTimeout(debounce)
  debounce = setTimeout(async () => {
    const paths = [...pendingAdds]
    pendingAdds.clear()
    for (const p of paths) {
      try {
        libraryDb().upsertTrack(await readTrack(p))
      } catch {
        /* file vanished meanwhile */
      }
    }
    emit('library:changed', null)
  }, 1500)
}

export async function startLibrary(): Promise<void> {
  await mkdir(getSettings().libraryDir, { recursive: true }).catch(() => undefined)
  await scan()
  await restartWatcher()
}

export async function restartWatcher(): Promise<void> {
  await watcher?.close()
  watcher = watch(roots(), {
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 1500, pollInterval: 300 },
    ignored: (p, st) => Boolean(st?.isFile() && !isAudio(p))
  })
  watcher.on('add', (p) => queueWatchEvent(p, false))
  watcher.on('change', (p) => queueWatchEvent(p, false))
  watcher.on('unlink', (p) => queueWatchEvent(p, true))
  watcher.on('error', (err) => log.warn('Library watcher error', err))
}

export async function stopLibrary(): Promise<void> {
  await watcher?.close()
  db?.close()
}

export async function cover(id: number): Promise<{ data: Uint8Array; mime: string } | null> {
  if (coverCache.has(id)) return coverCache.get(id)!
  const t = libraryDb().track(id)
  let result: { data: Uint8Array; mime: string } | null = null
  if (t?.hasCover) {
    try {
      const meta = await parseFile(t.path, { duration: false })
      const pic = meta.common.picture?.[0]
      if (pic)
        result = {
          data: pic.data,
          mime: pic.format.includes('/') ? pic.format : `image/${pic.format}`
        }
    } catch {
      /* unreadable */
    }
  }
  if (coverCache.size > 300) coverCache.delete(coverCache.keys().next().value!)
  coverCache.set(id, result)
  return result
}

export function trackById(id: number): LibraryTrack | null {
  return libraryDb().track(id)
}

export async function removeTrack(id: number): Promise<void> {
  const t = libraryDb().track(id)
  if (!t) return
  // Move to the OS trash rather than deleting permanently. If that fails, keep the track:
  // dropping only the database row would make it reappear on the next scan.
  try {
    await shell.trashItem(t.path)
  } catch (err) {
    log.warn(`Could not move ${t.path} to the trash`, err)
    throw new Error(
      'This file couldn’t be moved to the trash. Its drive may not have a trash folder (common for USB and Windows-formatted drives).',
      { cause: err }
    )
  }
  libraryDb().removeTrack(id)
  emit('library:changed', null)
}

export async function editTags(id: number, tags: TagEdit): Promise<void> {
  const t = libraryDb().track(id)
  if (!t) throw new Error('Track not found')
  await writeTags(
    t.path,
    { ...tags, trackNumber: tags.trackNumber, year: tags.year, videoId: t.videoId },
    null
  )
  coverCache.delete(id)
  await addFile(t.path, t.videoId ?? undefined)
}

/** Groups of the same song stored more than once; the first-downloaded copy is kept. */
export function findDuplicates(): DuplicateGroup[] {
  const tracks = [...libraryDb().allTracks()].sort((a, b) => a.id - b.id)
  const index = new SongIndex<LibraryTrack>()
  const groups = new Map<number, DuplicateGroup>()
  for (const t of tracks) {
    const keep = index.find(t.title, t.artist, t.durationSec)
    if (!keep) {
      index.add(t.title, t.artist, t)
      continue
    }
    const g = groups.get(keep.id) ?? { keep, extras: [] }
    g.extras.push(t)
    groups.set(keep.id, g)
  }
  return [...groups.values()]
}

/**
 * Remove the extra copies of duplicate songs. They go to the OS trash; with `permanent`
 * (offered when the drive has no trash) they are deleted. Playlists that used an extra copy
 * now point at the kept one.
 */
export async function removeDuplicates(
  permanent = false
): Promise<{ removed: number; failed: number }> {
  const db = libraryDb()
  let removed = 0
  let failed = 0
  for (const g of findDuplicates()) {
    for (const extra of g.extras) {
      try {
        if (permanent) await unlink(extra.path)
        else await shell.trashItem(extra.path)
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
          log.warn(`Could not remove ${extra.path}`, err)
          failed++
          continue
        }
      }
      db.replaceInPlaylists(extra.id, g.keep.id)
      db.removeTrack(extra.id)
      removed++
    }
  }
  if (removed) emit('library:changed', null)
  log.info(`Removed ${removed} duplicate songs${failed ? `, ${failed} failed` : ''}`)
  return { removed, failed }
}
