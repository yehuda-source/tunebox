// Library operations on the phone. Songs live in the app's Music folder, filed like on desktop
// (Artist/Album/NN - Title.ext), with each track's cover saved separately for the UI.
import { Capacitor } from '@capacitor/core'
import type { DuplicateGroup, LibraryTrack, TagEdit } from '@shared/types'
import { SongIndex } from '@shared/songKey'
import { db } from './db'
import { emit } from './events'
import { Files } from './native'
import { paths } from './settings'
import { writeTags } from './tags'

export const coverFile = (id: number): string => `${paths.covers}/${id}.jpg`
export const coverUrl = (id: number): string => Capacitor.convertFileSrc(coverFile(id))

/** file:// URL for the native player (each segment encoded, so '#' or '%' in names survive). */
export const fileUrl = (path: string): string =>
  'file://' + path.split('/').map(encodeURIComponent).join('/')

let changedTimer: ReturnType<typeof setTimeout> | null = null
/** Tell the UI, batching the bursts a running album download produces. */
export function libraryChanged(): void {
  if (changedTimer) return
  changedTimer = setTimeout(() => {
    changedTimer = null
    emit('library:changed', null)
  }, 300)
}

export async function addDownloaded(
  track: Omit<LibraryTrack, 'id' | 'addedAt' | 'hasCover'>,
  cover: string | null
): Promise<LibraryTrack> {
  const row = db.upsertTrack({ ...track, hasCover: false })
  if (cover) {
    try {
      await Files.move({ from: cover, to: coverFile(row.id) })
      db.updateTrack(row.id, { hasCover: true })
    } catch (err) {
      console.warn('Could not save the cover', err)
    }
  }
  libraryChanged()
  return row
}

async function deleteFiles(t: LibraryTrack): Promise<void> {
  await Files.remove({ path: t.path, pruneUpTo: paths.music })
  if (t.hasCover) await Files.remove({ path: coverFile(t.id) }).catch(() => undefined)
}

export async function removeTrack(id: number): Promise<void> {
  const t = db.track(id)
  if (!t) return
  await deleteFiles(t)
  db.removeTracks(new Set([id]))
  libraryChanged()
}

export async function editTags(id: number, tags: TagEdit): Promise<void> {
  const t = db.track(id)
  if (!t) throw new Error('Track not found')
  await writeTags(t.path, { ...tags, videoId: t.videoId }, null)
  db.updateTrack(id, {
    title: tags.title,
    artist: tags.artist,
    album: tags.album,
    albumArtist: tags.albumArtist,
    trackNumber: tags.trackNumber,
    year: tags.year
  })
  libraryChanged()
}

/** Drop tracks whose files are gone (deleted with a file manager, or by a reinstall). */
export async function rescan(): Promise<void> {
  const tracks = db.allTracks()
  const { paths: present } = await Files.existing({ paths: tracks.map((t) => t.path) })
  const keep = new Set(present)
  const gone = new Set(tracks.filter((t) => !keep.has(t.path)).map((t) => t.id))
  if (gone.size) {
    db.removeTracks(gone)
    libraryChanged()
  }
}

/** Groups of the same song stored more than once; the first-downloaded copy is kept. */
export function findDuplicates(): DuplicateGroup[] {
  const tracks = db.allTracks().sort((a, b) => a.id - b.id)
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

/** Deletes the extra copies (phones have no trash); playlists switch to the kept copy. */
export async function removeDuplicates(): Promise<{ removed: number; failed: number }> {
  let removed = 0
  let failed = 0
  for (const g of findDuplicates()) {
    for (const extra of g.extras) {
      try {
        await deleteFiles(extra)
      } catch (err) {
        console.warn(`Could not remove ${extra.path}`, err)
        failed++
        continue
      }
      db.replaceInPlaylists(extra.id, g.keep.id)
      db.removeTracks(new Set([extra.id]))
      removed++
    }
  }
  if (removed) libraryChanged()
  return { removed, failed }
}
