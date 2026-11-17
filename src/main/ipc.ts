import { app, dialog, ipcMain, shell, BrowserWindow } from 'electron'
import { writeFile } from 'fs/promises'
import type {
  ArtistRef,
  Settings,
  ShowKind,
  ShowRef,
  SpotifyMatch,
  SpotifyTrack,
  TagEdit,
  TrackRef
} from '../shared/types'
import { getSettings, setSettings } from './settings'
import * as yt from './youtube/search'
import { loadShow, resolveUrl } from './youtube/ytdlp-json'
import { prefetchStream } from './youtube/stream'
import * as queue from './downloads/queue'
import * as library from './library/library'
import * as follows from './follows'
import * as spotifyAuth from './spotify/auth'
import * as spotifyApi from './spotify/api'
import { importMatches, matchTracks } from './spotify/match'
import { getToolStatus, updateTools, selfTest } from './binaries/manager'
import { emit } from './events'
import log from './log'

type Handler = (...args: never[]) => unknown

function handle(ns: string, handlers: Record<string, Handler>): void {
  for (const [name, fn] of Object.entries(handlers)) {
    ipcMain.handle(`${ns}:${name}`, async (_e, ...args) => {
      try {
        return await (fn as (...a: unknown[]) => unknown)(...args)
      } catch (err) {
        log.error(`${ns}:${name} failed`, err)
        throw err
      }
    })
  }
}

const win = (): BrowserWindow | undefined =>
  BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]

export function registerIpc(): void {
  handle('app', {
    info: () => ({
      version: app.getVersion(),
      platform: process.platform,
      userData: app.getPath('userData'),
      logsDir: app.getPath('logs')
    }),
    openPath: async (p: string) => {
      await shell.openPath(p)
    }
  })

  handle('settings', {
    get: () => getSettings(),
    set: (patch: Partial<Settings>) => setSettings(patch),
    pickFolder: async () => {
      const r = await dialog.showOpenDialog(win()!, {
        properties: ['openDirectory', 'createDirectory']
      })
      return r.canceled ? null : r.filePaths[0]
    },
    pickFile: async () => {
      const r = await dialog.showOpenDialog(win()!, { properties: ['openFile'] })
      return r.canceled ? null : r.filePaths[0]
    }
  })

  handle('search', {
    query: (q: string) => yt.search(q),
    suggest: (q: string) => yt.suggest(q),
    album: (id: string) => yt.album(id),
    artist: (id: string) => yt.artist(id),
    resolveUrl: (url: string) => resolveUrl(url),
    show: (kind: ShowKind, id: string, limit?: number) =>
      loadShow(kind, id, Math.min(Math.max(Number(limit) || 100, 1), 1000)),
    prefetch: (videoId: string) => prefetchStream(videoId)
  })

  handle('downloads', {
    list: () => queue.listJobs(),
    enqueue: (tracks: TrackRef[], batch?: string) => queue.enqueue(tracks, batch),
    cancel: (id: string) => queue.cancel(id),
    retry: (id: string) => queue.retry(id),
    remove: (id: string) => queue.remove(id),
    cancelAll: () => queue.cancelAll(),
    clearFinished: () => queue.clearFinished()
  })

  handle('library', {
    tracks: () => library.libraryDb().allTracks(),
    rescan: () => library.scan(),
    remove: (id: number) => library.removeTrack(id),
    showInFolder: (id: number) => {
      const t = library.trackById(id)
      if (t) shell.showItemInFolder(t.path)
    },
    editTags: (id: number, tags: TagEdit) => library.editTags(id, tags),
    duplicates: () => library.findDuplicates(),
    removeDuplicates: (permanent?: boolean) => library.removeDuplicates(permanent === true)
  })

  // Playlist changes are announced like library changes so every view refreshes.
  const changed = <T>(v: T): T => {
    emit('library:changed', null)
    return v
  }

  handle('playlists', {
    list: () => library.libraryDb().playlists(),
    create: (name: string) =>
      changed(library.libraryDb().createPlaylist(name.trim() || 'New playlist')),
    rename: (id: number, name: string) => changed(library.libraryDb().renamePlaylist(id, name)),
    remove: (id: number) => changed(library.libraryDb().deletePlaylist(id)),
    tracks: (id: number) => library.libraryDb().playlistTrackIds(id),
    add: (id: number, trackIds: number[]) =>
      changed(library.libraryDb().addToPlaylist(id, trackIds)),
    removeTrack: (id: number, trackId: number) =>
      changed(library.libraryDb().removeFromPlaylist(id, trackId)),
    exportM3u: async (id: number) => {
      const db = library.libraryDb()
      const pl = db.playlists().find((p) => p.id === id)
      if (!pl) return null
      const r = await dialog.showSaveDialog(win()!, {
        defaultPath: `${pl.name}.m3u8`,
        filters: [{ name: 'Playlist', extensions: ['m3u8'] }]
      })
      if (r.canceled || !r.filePath) return null
      const lines = ['#EXTM3U']
      for (const tid of db.playlistTrackIds(id)) {
        const t = db.track(tid)
        if (!t) continue
        lines.push(`#EXTINF:${Math.round(t.durationSec ?? -1)},${t.artist} - ${t.title}`, t.path)
      }
      await writeFile(r.filePath, lines.join('\n') + '\n', 'utf8')
      return r.filePath
    }
  })

  handle('follows', {
    list: () => follows.listFollowed(),
    follow: (artist: ArtistRef) => follows.follow(artist),
    unfollow: (id: string) => follows.unfollow(id),
    check: () => follows.checkFollowed(),
    shows: () => follows.listFollowedShows(),
    followShow: (show: ShowRef) => follows.followShow(show),
    unfollowShow: (id: string) => follows.unfollowShow(id)
  })

  handle('spotify', {
    status: () => spotifyAuth.status(),
    setClientId: (id: string) => spotifyAuth.setClientId(id),
    signIn: () => spotifyAuth.signIn(),
    signOut: () => spotifyAuth.signOut(),
    myPlaylists: () => spotifyApi.myPlaylists(),
    load: (source: string) => spotifyApi.load(source),
    match: (tracks: SpotifyTrack[]) => matchTracks(tracks),
    import: (matches: SpotifyMatch[], name: string | null) => importMatches(matches, name)
  })

  handle('tools', {
    status: () => getToolStatus(),
    update: () => updateTools(true),
    selfTest: () => selfTest()
  })
}
