import { describe, expect, it } from 'vitest'
import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { LibraryDb, type TrackRow } from '../src/main/library/db'

const row = (path: string, extra: Partial<TrackRow> = {}): TrackRow => ({
  path,
  title: 'T',
  artist: 'A',
  album: 'B',
  albumArtist: 'A',
  trackNumber: 1,
  year: '2020',
  durationSec: 100,
  videoId: null,
  hasCover: false,
  mtime: 1,
  size: 1,
  ...extra
})

describe('LibraryDb', () => {
  const file = join(mkdtempSync(join(tmpdir(), 'tunebox-')), 'lib.db')

  it('migrates a new database to the latest schema', () => {
    const db = new LibraryDb(file)
    expect(db.schemaVersion).toBe(2)
    db.close()
    // Re-opening must not re-run migrations.
    const again = new LibraryDb(file)
    expect(again.schemaVersion).toBe(2)
    again.close()
  })

  it('upserts tracks and keeps a known video id', () => {
    const db = new LibraryDb(file)
    db.upsertTrack(row('/a.mp3', { videoId: 'abcdefghijk' }))
    db.upsertTrack(row('/a.mp3', { title: 'New', videoId: null }))
    const [t] = db.allTracks()
    expect(t.title).toBe('New')
    expect(t.videoId).toBe('abcdefghijk')
    expect(db.videoIdsInLibrary().has('abcdefghijk')).toBe(true)
    db.close()
  })

  it('keeps playlist order and cascades track deletion', () => {
    const db = new LibraryDb(file)
    db.upsertTrack(row('/b.mp3'))
    const [a, b] = db.allTracks()
    const pl = db.createPlaylist('Mix')
    db.addToPlaylist(pl.id, [b.id, a.id])
    db.addToPlaylist(pl.id, [b.id])
    expect(db.playlistTrackIds(pl.id)).toEqual([b.id, a.id])
    db.removePath('/b.mp3')
    expect(db.playlistTrackIds(pl.id)).toEqual([a.id])
    expect(db.playlists()[0].trackCount).toBe(1)
    db.close()
  })

  it('persists download jobs', () => {
    const db = new LibraryDb(file)
    const job = {
      id: 'j1',
      track: { videoId: 'v', title: 't', artists: ['a'] },
      status: 'queued' as const,
      progress: 0,
      attempts: 0,
      createdAt: 5
    }
    db.saveJob(job)
    expect(db.loadJobs()).toEqual([job])
    db.deleteJob('j1')
    expect(db.loadJobs()).toEqual([])
    db.close()
  })
})

describe('followed artists', () => {
  const file = join(mkdtempSync(join(tmpdir(), 'tunebox-')), 'lib.db')

  it('migrates to v2 and tracks seen releases', () => {
    const db = new LibraryDb(file)
    expect(db.schemaVersion).toBe(2)
    db.follow('UC1', 'Artist', null, ['A1', 'A2'])
    expect(db.followedArtists().map((a) => a.name)).toEqual(['Artist'])
    expect([...db.seenReleases('UC1')].sort()).toEqual(['A1', 'A2'])
    db.markSeen('UC1', ['A3'])
    db.markChecked('UC1', true)
    expect(db.seenReleases('UC1').has('A3')).toBe(true)
    expect(db.followedArtists()[0].lastNew).not.toBeNull()
    db.unfollow('UC1')
    expect(db.followedArtists()).toEqual([])
    expect(db.seenReleases('UC1').size).toBe(0)
    db.close()
  })
})
