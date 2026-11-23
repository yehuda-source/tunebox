// Phone settings (localStorage) and the app's folders.
import type { Settings } from '@shared/types'
import { isIos } from './native'

const KEY = 'tunebox.settings'
const DEFAULTS: Settings = {
  libraryDir: '',
  extraDirs: [],
  format: 'm4a',
  bitrate: 0,
  concurrency: 2,
  skipExisting: true,
  skipDuplicates: true,
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
  firstRunDone: true
}

/** Folders, filled in at startup. */
export const paths = {
  /** Downloaded songs: Android/data/com.tunebox.app/files/Music. */
  music: '',
  /** Cover images, one per track id. */
  covers: '',
  /** Downloads in progress. */
  work: '',
  /** library.json */
  data: ''
}

function load(): Settings {
  try {
    return { ...DEFAULTS, ...(JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Settings>) }
  } catch {
    return { ...DEFAULTS }
  }
}

let current = load()

export const getSettings = (): Settings => ({
  ...current,
  libraryDir: paths.music,
  // iOS keeps YouTube's AAC audio as is (no ffmpeg to convert).
  ...(isIos ? { format: 'm4a' as const, bitrate: 0 } : {})
})

export function setSettings(patch: Partial<Settings>): Settings {
  current = { ...current, ...patch }
  try {
    localStorage.setItem(KEY, JSON.stringify(current))
  } catch {
    /* storage unavailable */
  }
  return getSettings()
}
