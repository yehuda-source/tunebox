import { app } from 'electron'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import type { Settings } from '../shared/types'
import log from './log'

const file = (): string => join(app.getPath('userData'), 'settings.json')

function defaults(): Settings {
  return {
    libraryDir: join(app.getPath('music'), 'TuneBox'),
    extraDirs: [],
    format: 'mp3',
    bitrate: 0,
    concurrency: 3,
    skipExisting: true,
    cookiesFile: '',
    cookiesBrowser: '',
    theme: 'dark',
    closeToTray: false,
    autoUpdateTools: true,
    ytdlpPath: '',
    ffmpegPath: '',
    notifyOnFinish: true,
    autoDownloadFollowed: true,
    followCheckHours: 6,
    firstRunDone: false
  }
}

let current: Settings | null = null
const listeners = new Set<(s: Settings, prev: Settings) => void>()

export function getSettings(): Settings {
  if (current) return current
  current = defaults()
  try {
    if (existsSync(file())) current = { ...current, ...JSON.parse(readFileSync(file(), 'utf8')) }
  } catch (err) {
    log.warn('Could not read settings, using defaults', err)
  }
  return current!
}

export function setSettings(patch: Partial<Settings>): Settings {
  const prev = getSettings()
  const next = { ...prev, ...patch }
  next.concurrency = Math.min(8, Math.max(1, Math.round(next.concurrency)))
  current = next
  mkdirSync(app.getPath('userData'), { recursive: true })
  writeFileSync(file(), JSON.stringify(next, null, 2))
  for (const l of listeners) l(next, prev)
  return next
}

export function onSettingsChanged(cb: (s: Settings, prev: Settings) => void): void {
  listeners.add(cb)
}
