import { DatabaseSync } from 'node:sqlite'
import type { DownloadJob, FollowedArtist, LibraryTrack, Playlist } from '../../shared/types'

const MIGRATIONS: string[] = [
  `CREATE TABLE tracks (
     id INTEGER PRIMARY KEY,
     path TEXT NOT NULL UNIQUE,
     title TEXT NOT NULL,
     artist TEXT NOT NULL,
     album TEXT NOT NULL,
     album_artist TEXT NOT NULL,
     track_no INTEGER,
     year TEXT,
     duration REAL,
     video_id TEXT,
     has_cover INTEGER NOT NULL DEFAULT 0,
     mtime REAL NOT NULL,
     size INTEGER NOT NULL,
     added_at INTEGER NOT NULL
   );
   CREATE INDEX tracks_video ON tracks(video_id);
   CREATE TABLE playlists (id INTEGER PRIMARY KEY, name TEXT NOT NULL, created_at INTEGER NOT NULL);
   CREATE TABLE playlist_tracks (
     playlist_id INTEGER NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
     track_id INTEGER NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
     position INTEGER NOT NULL,
     PRIMARY KEY (playlist_id, track_id)
   );
   CREATE TABLE download_jobs (id TEXT PRIMARY KEY, data TEXT NOT NULL, created_at INTEGER NOT NULL);
   CREATE TABLE history (video_id TEXT PRIMARY KEY, path TEXT NOT NULL, downloaded_at INTEGER NOT NULL);`,
  `CREATE TABLE followed_artists (
     channel_id TEXT PRIMARY KEY,
     name TEXT NOT NULL,
     thumbnail TEXT,
     followed_at INTEGER NOT NULL,
     last_checked INTEGER,
     last_new INTEGER
   );
   CREATE TABLE seen_releases (
     channel_id TEXT NOT NULL REFERENCES followed_artists(channel_id) ON DELETE CASCADE,
     browse_id TEXT NOT NULL,
     PRIMARY KEY (channel_id, browse_id)
   );`
]

export interface TrackRow {
  path: string
  title: string
  artist: string
  album: string
  albumArtist: string
  trackNumber: number | null
  year: string | null
  durationSec: number | null
  videoId: string | null
  hasCover: boolean
  mtime: number
  size: number
}

type Row = Record<string, unknown>

function toTrack(r: Row): LibraryTrack {
  return {
    id: Number(r.id),
    path: String(r.path),
    title: String(r.title),
    artist: String(r.artist),
    album: String(r.album),
    albumArtist: String(r.album_artist),
    trackNumber: r.track_no == null ? null : Number(r.track_no),
    year: r.year == null ? null : String(r.year),
    durationSec: r.duration == null ? null : Number(r.duration),
    videoId: r.video_id == null ? null : String(r.video_id),
    hasCover: Boolean(r.has_cover),
    addedAt: Number(r.added_at)
  }
}

export class LibraryDb {
  db: DatabaseSync

  constructor(file: string) {
    this.db = new DatabaseSync(file)
    this.db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;')
    this.migrate()
  }

  get schemaVersion(): number {
    return Number((this.db.prepare('PRAGMA user_version').get() as Row).user_version)
  }

  private migrate(): void {
    for (let v = this.schemaVersion; v < MIGRATIONS.length; v++) {
      this.db.exec('BEGIN')
      try {
        this.db.exec(MIGRATIONS[v])
        this.db.exec(`PRAGMA user_version = ${v + 1}`)
        this.db.exec('COMMIT')
      } catch (err) {
        this.db.exec('ROLLBACK')
        throw err
      }
    }
  }

  close(): void {
    this.db.close()
  }

  // ----- tracks -----

  allTracks(): LibraryTrack[] {
    return (
      this.db.prepare('SELECT * FROM tracks ORDER BY artist, album, track_no, title').all() as Row[]
    ).map(toTrack)
  }

  track(id: number): LibraryTrack | null {
    const r = this.db.prepare('SELECT * FROM tracks WHERE id = ?').get(id) as Row | undefined
    return r ? toTrack(r) : null
  }

  fileStamps(): Map<string, { mtime: number; size: number }> {
    const rows = this.db.prepare('SELECT path, mtime, size FROM tracks').all() as Row[]
    return new Map(
      rows.map((r) => [String(r.path), { mtime: Number(r.mtime), size: Number(r.size) }])
    )
  }

  upsertTrack(t: TrackRow): void {
    this.db
      .prepare(
        `INSERT INTO tracks (path, title, artist, album, album_artist, track_no, year, duration, video_id, has_cover, mtime, size, added_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(path) DO UPDATE SET title=excluded.title, artist=excluded.artist, album=excluded.album,
           album_artist=excluded.album_artist, track_no=excluded.track_no, year=excluded.year, duration=excluded.duration,
           video_id=COALESCE(excluded.video_id, tracks.video_id), has_cover=excluded.has_cover, mtime=excluded.mtime, size=excluded.size`
      )
      .run(
        t.path,
        t.title,
        t.artist,
        t.album,
        t.albumArtist,
        t.trackNumber,
        t.year,
        t.durationSec,
        t.videoId,
        t.hasCover ? 1 : 0,
        t.mtime,
        t.size,
        Date.now()
      )
  }

  removePath(path: string): boolean {
    return this.db.prepare('DELETE FROM tracks WHERE path = ?').run(path).changes > 0
  }

  removeTrack(id: number): void {
    this.db.prepare('DELETE FROM tracks WHERE id = ?').run(id)
  }

  videoIdsInLibrary(): Set<string> {
    const rows = this.db
      .prepare('SELECT video_id FROM tracks WHERE video_id IS NOT NULL')
      .all() as Row[]
    return new Set(rows.map((r) => String(r.video_id)))
  }

  // ----- download history -----

  recordDownload(videoId: string, path: string): void {
    this.db
      .prepare('INSERT OR REPLACE INTO history (video_id, path, downloaded_at) VALUES (?, ?, ?)')
      .run(videoId, path, Date.now())
  }

  // ----- jobs -----

  loadJobs(): DownloadJob[] {
    const rows = this.db
      .prepare('SELECT data FROM download_jobs ORDER BY created_at')
      .all() as Row[]
    return rows.map((r) => JSON.parse(String(r.data)) as DownloadJob)
  }

  saveJob(job: DownloadJob): void {
    this.db
      .prepare('INSERT OR REPLACE INTO download_jobs (id, data, created_at) VALUES (?, ?, ?)')
      .run(job.id, JSON.stringify(job), job.createdAt)
  }

  deleteJob(id: string): void {
    this.db.prepare('DELETE FROM download_jobs WHERE id = ?').run(id)
  }

  // ----- playlists -----

  playlists(): Playlist[] {
    const rows = this.db
      .prepare(
        `SELECT p.id, p.name, p.created_at, COUNT(pt.track_id) AS n
         FROM playlists p LEFT JOIN playlist_tracks pt ON pt.playlist_id = p.id
         GROUP BY p.id ORDER BY p.name COLLATE NOCASE`
      )
      .all() as Row[]
    return rows.map((r) => ({
      id: Number(r.id),
      name: String(r.name),
      trackCount: Number(r.n),
      createdAt: Number(r.created_at)
    }))
  }

  createPlaylist(name: string): Playlist {
    const now = Date.now()
    const r = this.db
      .prepare('INSERT INTO playlists (name, created_at) VALUES (?, ?)')
      .run(name, now)
    return { id: Number(r.lastInsertRowid), name, trackCount: 0, createdAt: now }
  }

  renamePlaylist(id: number, name: string): void {
    this.db.prepare('UPDATE playlists SET name = ? WHERE id = ?').run(name, id)
  }

  deletePlaylist(id: number): void {
    this.db.prepare('DELETE FROM playlists WHERE id = ?').run(id)
  }

  playlistTrackIds(id: number): number[] {
    const rows = this.db
      .prepare('SELECT track_id FROM playlist_tracks WHERE playlist_id = ? ORDER BY position')
      .all(id) as Row[]
    return rows.map((r) => Number(r.track_id))
  }

  addToPlaylist(id: number, trackIds: number[]): void {
    const max = this.db
      .prepare('SELECT COALESCE(MAX(position), -1) AS m FROM playlist_tracks WHERE playlist_id = ?')
      .get(id) as Row
    let pos = Number(max.m) + 1
    const stmt = this.db.prepare(
      'INSERT OR IGNORE INTO playlist_tracks (playlist_id, track_id, position) VALUES (?, ?, ?)'
    )
    for (const t of trackIds) stmt.run(id, t, pos++)
  }

  removeFromPlaylist(id: number, trackId: number): void {
    this.db
      .prepare('DELETE FROM playlist_tracks WHERE playlist_id = ? AND track_id = ?')
      .run(id, trackId)
  }

  // ----- followed artists -----

  followedArtists(): FollowedArtist[] {
    const rows = this.db
      .prepare('SELECT * FROM followed_artists ORDER BY name COLLATE NOCASE')
      .all() as Row[]
    return rows.map((r) => ({
      channelId: String(r.channel_id),
      name: String(r.name),
      thumbnail: r.thumbnail == null ? null : String(r.thumbnail),
      followedAt: Number(r.followed_at),
      lastChecked: r.last_checked == null ? null : Number(r.last_checked),
      lastNew: r.last_new == null ? null : Number(r.last_new)
    }))
  }

  follow(channelId: string, name: string, thumbnail: string | null, seen: string[]): void {
    this.db.exec('BEGIN')
    try {
      this.db
        .prepare(
          `INSERT INTO followed_artists (channel_id, name, thumbnail, followed_at, last_checked) VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(channel_id) DO UPDATE SET name = excluded.name, thumbnail = excluded.thumbnail`
        )
        .run(channelId, name, thumbnail, Date.now(), Date.now())
      this.markSeen(channelId, seen)
      this.db.exec('COMMIT')
    } catch (err) {
      this.db.exec('ROLLBACK')
      throw err
    }
  }

  unfollow(channelId: string): void {
    this.db.prepare('DELETE FROM followed_artists WHERE channel_id = ?').run(channelId)
  }

  seenReleases(channelId: string): Set<string> {
    const rows = this.db
      .prepare('SELECT browse_id FROM seen_releases WHERE channel_id = ?')
      .all(channelId) as Row[]
    return new Set(rows.map((r) => String(r.browse_id)))
  }

  markSeen(channelId: string, browseIds: string[]): void {
    const stmt = this.db.prepare(
      'INSERT OR IGNORE INTO seen_releases (channel_id, browse_id) VALUES (?, ?)'
    )
    for (const id of browseIds) stmt.run(channelId, id)
  }

  markChecked(channelId: string, foundNew: boolean): void {
    this.db
      .prepare(
        `UPDATE followed_artists SET last_checked = ?, last_new = CASE WHEN ? THEN ? ELSE last_new END WHERE channel_id = ?`
      )
      .run(Date.now(), foundNew ? 1 : 0, Date.now(), channelId)
  }
}
