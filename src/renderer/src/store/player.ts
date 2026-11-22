import { create } from 'zustand'
import type { LibraryTrack, TrackRef } from '@shared/types'
import { coverUrl, findLocal } from './library'
import { toast } from './toast'
import { pickShuffle } from './shuffle'
import { platform } from '../lib/platform'

export interface PlayItem {
  key: string
  title: string
  artist: string
  album?: string
  cover?: string
  src: string
  durationSec?: number | null
  videoId?: string | null
  trackId?: number
  /** Present for online tracks so they can be downloaded from the player. */
  ref?: TrackRef
}

export type Repeat = 'off' | 'all' | 'one'

interface PlayerState {
  queue: PlayItem[]
  index: number
  playing: boolean
  loading: boolean
  position: number
  duration: number
  volume: number
  muted: boolean
  shuffle: boolean
  repeat: Repeat
}

const STORAGE_KEY = 'tunebox.player'
const audio = platform.createAudio?.() ?? new Audio()
audio.preload = 'auto'
if (import.meta.env.DEV) Object.assign(window, { __audio: audio })

function restore(): Partial<PlayerState> {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}')
    const queue: PlayItem[] = Array.isArray(saved.queue) ? saved.queue : []
    const index = typeof saved.index === 'number' && saved.index < queue.length ? saved.index : -1
    return {
      queue,
      index,
      duration: queue[index]?.durationSec ?? 0,
      volume: typeof saved.volume === 'number' ? saved.volume : 0.8,
      shuffle: Boolean(saved.shuffle),
      repeat: saved.repeat ?? 'off',
      position: saved.position ?? 0
    }
  } catch {
    return {}
  }
}

export const usePlayer = create<PlayerState>(() => ({
  queue: [],
  index: -1,
  playing: false,
  loading: false,
  position: 0,
  duration: 0,
  volume: 0.8,
  muted: false,
  shuffle: false,
  repeat: 'off',
  ...restore()
}))

const get = usePlayer.getState
const set = usePlayer.setState

export const current = (): PlayItem | undefined => get().queue[get().index]

// ---------- conversions ----------

export function fromLibrary(t: LibraryTrack): PlayItem {
  return {
    key: `lib:${t.id}`,
    title: t.title,
    artist: t.artist,
    album: t.album,
    cover: t.hasCover ? coverUrl(t.id) : undefined,
    src: `tunebox-media://track/${t.id}`,
    durationSec: t.durationSec,
    videoId: t.videoId,
    trackId: t.id
  }
}

/** Online track → play item. Plays the local copy when it is already downloaded. */
export function fromRef(t: TrackRef): PlayItem {
  const local = findLocal(t)
  if (local) return { ...fromLibrary(local), ref: t }
  return {
    key: `yt:${t.videoId}`,
    title: t.title,
    artist: t.artists.join(', '),
    album: t.album,
    cover: t.thumbnail,
    src: `tunebox-media://stream/${t.videoId}`,
    durationSec: t.durationSec,
    videoId: t.videoId,
    ref: t
  }
}

// ---------- playback ----------

let loadedKey: string | null = null
// Shuffle bookkeeping: what played this round, and the order, so "previous" goes back in time.
let played = new Set<string>()
let history: number[] = []

async function load(i: number, autoplay = true, startAt = 0): Promise<void> {
  const item = get().queue[i]
  if (!item) return
  set({ index: i, position: startAt, duration: item.durationSec ?? 0, loading: true })
  loadedKey = item.key
  played.add(item.key)
  updateMediaSession(item)
  audio.src = item.src
  if (startAt) audio.currentTime = startAt
  if (autoplay) {
    try {
      await audio.play()
    } catch (err) {
      if ((err as DOMException).name !== 'AbortError') onError()
    }
  } else {
    set({ loading: false })
  }
  prefetchNext()
}

function prefetchNext(): void {
  const next = get().queue[get().index + 1]
  if (next?.key.startsWith('yt:') && next.videoId) void window.api.search.prefetch(next.videoId)
}

export const player = {
  playList(items: PlayItem[], start = 0): void {
    if (!items.length) return
    played = new Set()
    history = []
    set({ queue: items, index: start })
    void load(start)
  },
  playOne(item: PlayItem): void {
    player.playList([item], 0)
  },
  playNext(items: PlayItem[]): void {
    const { queue, index } = get()
    if (index < 0) return player.playList(items)
    set({ queue: [...queue.slice(0, index + 1), ...items, ...queue.slice(index + 1)] })
    toast.info(
      items.length === 1 ? `“${items[0].title}” plays next` : `${items.length} tracks play next`
    )
  },
  addToQueue(items: PlayItem[]): void {
    const { queue, index } = get()
    if (index < 0) return player.playList(items)
    set({ queue: [...queue, ...items] })
    toast.info(
      items.length === 1
        ? `Added “${items[0].title}” to the queue`
        : `Added ${items.length} tracks to the queue`
    )
  },
  jump(i: number): void {
    void load(i)
  },
  removeAt(i: number): void {
    history = []
    const { queue, index } = get()
    if (i === index) {
      const rest = queue.filter((_, j) => j !== i)
      set({ queue: rest })
      if (rest.length) void load(Math.min(i, rest.length - 1))
      else player.stop()
      return
    }
    set({ queue: queue.filter((_, j) => j !== i), index: i < index ? index - 1 : index })
  },
  move(from: number, to: number): void {
    history = []
    const { queue, index } = get()
    if (from === to) return
    const q = [...queue]
    const [it] = q.splice(from, 1)
    q.splice(to, 0, it)
    let ni = index
    if (from === index) ni = to
    else if (from < index && to >= index) ni--
    else if (from > index && to <= index) ni++
    set({ queue: q, index: ni })
  },
  clearUpcoming(): void {
    const { queue, index } = get()
    set({ queue: queue.slice(0, index + 1) })
  },
  toggle(): void {
    const item = current()
    if (!item) return
    if (loadedKey !== item.key) return void load(get().index, true, get().position)
    if (audio.paused) void audio.play().catch(onError)
    else audio.pause()
  },
  stop(): void {
    audio.pause()
    audio.removeAttribute('src')
    audio.load()
    loadedKey = null
    set({ playing: false, position: 0, index: -1, queue: [] })
  },
  next(auto = false): void {
    const { queue, index, shuffle, repeat } = get()
    if (!queue.length) return
    if (auto && repeat === 'one') {
      audio.currentTime = 0
      void audio.play()
      return
    }
    let ni: number
    if (shuffle && queue.length > 1) {
      ni = pickShuffle(queue.length, index, (i) => played.has(queue[i].key))
      if (ni < 0) {
        if (repeat !== 'all') {
          audio.pause()
          audio.currentTime = 0
          return
        }
        // New round: everything is eligible again except the current track.
        played = new Set([queue[index]?.key])
        ni = pickShuffle(queue.length, index, (i) => played.has(queue[i].key))
      }
      history.push(index)
    } else {
      ni = index + 1
      if (ni >= queue.length) {
        if (repeat !== 'all') {
          audio.pause()
          audio.currentTime = 0
          return
        }
        ni = 0
      }
    }
    void load(ni)
  },
  prev(): void {
    const { index, shuffle } = get()
    if (audio.currentTime <= 3 && shuffle && history.length) {
      const back = history.pop()!
      if (back < get().queue.length) return void load(back)
    }
    if (audio.currentTime > 3 || index <= 0) {
      audio.currentTime = 0
      return
    }
    void load(index - 1)
  },
  seek(sec: number): void {
    if (loadedKey !== current()?.key) {
      set({ position: sec })
      return
    }
    audio.currentTime = Math.max(0, Math.min(sec, audio.duration || sec))
  },
  seekBy(delta: number): void {
    player.seek(audio.currentTime + delta)
  },
  setVolume(v: number): void {
    audio.volume = Math.max(0, Math.min(1, v))
    set({ volume: audio.volume, muted: false })
    audio.muted = false
  },
  toggleMute(): void {
    audio.muted = !audio.muted
    set({ muted: audio.muted })
  },
  toggleShuffle(): void {
    played = new Set([current()?.key ?? ''])
    history = []
    set({ shuffle: !get().shuffle })
  },
  cycleRepeat(): void {
    const order: Repeat[] = ['off', 'all', 'one']
    set({ repeat: order[(order.indexOf(get().repeat) + 1) % 3] })
  }
}

// ---------- audio element events ----------

let errorTimer: ReturnType<typeof setTimeout> | null = null
let consecutiveErrors = 0
function onError(): void {
  const item = current()
  set({ loading: false, playing: false })
  if (!item) return
  toast.error(
    `Couldn't play “${item.title}”`,
    item.src.includes('/stream/')
      ? 'The stream could not be loaded. Try again or download it.'
      : 'The file could not be read.'
  )
  if (errorTimer) clearTimeout(errorTimer)
  // Skip a broken track, but don't run through the whole queue if everything fails (e.g. offline).
  consecutiveErrors++
  if (consecutiveErrors < 3 && get().index < get().queue.length - 1)
    errorTimer = setTimeout(() => player.next(), 1500)
}

audio.volume = get().volume
audio.addEventListener('playing', () => {
  consecutiveErrors = 0
  set({ playing: true, loading: false })
})
audio.addEventListener('pause', () => set({ playing: false }))
audio.addEventListener('waiting', () => set({ loading: true }))
audio.addEventListener('canplay', () => set({ loading: false }))
audio.addEventListener('loadedmetadata', () => {
  if (Number.isFinite(audio.duration)) set({ duration: audio.duration })
})
audio.addEventListener('timeupdate', () => set({ position: audio.currentTime }))
audio.addEventListener('ended', () => player.next(true))
audio.addEventListener('error', () => {
  if (audio.getAttribute('src')) onError()
})

// ---------- stall detection ----------
// Data loaded, not paused, yet the clock doesn't move: the OS audio output is stuck
// (seen with a wedged PipeWire). Stop spinning forever and say what is wrong.

const OUTPUT_HINT = navigator.userAgent.includes('Windows')
  ? 'Check the output device in Windows sound settings, or restart the app.'
  : 'Other apps are probably silent too. Restarting the sound service usually fixes it: systemctl --user restart wireplumber pipewire pipewire-pulse'

let lastClock = -1
let stuckSince = 0
setInterval(() => {
  if (
    audio.paused ||
    audio.ended ||
    audio.seeking ||
    audio.readyState < 3 ||
    audio.currentTime !== lastClock
  ) {
    lastClock = audio.currentTime
    stuckSince = 0
    return
  }
  if (!stuckSince) stuckSince = Date.now()
  else if (Date.now() - stuckSince > 6000) {
    stuckSince = 0
    audio.pause()
    set({ loading: false, playing: false })
    toast.error('Your computer’s audio output isn’t responding', OUTPUT_HINT)
  }
}, 1000)

// ---------- OS media controls (MPRIS on Linux, SMTC on Windows) ----------

function updateMediaSession(item: PlayItem): void {
  platform.nowPlaying?.(item)
  if (!('mediaSession' in navigator)) return
  navigator.mediaSession.metadata = new MediaMetadata({
    title: item.title,
    artist: item.artist,
    album: item.album ?? '',
    artwork: item.cover ? [{ src: item.cover, sizes: '512x512' }] : []
  })
}

if ('mediaSession' in navigator) {
  const ms = navigator.mediaSession
  ms.setActionHandler('play', () => player.toggle())
  ms.setActionHandler('pause', () => player.toggle())
  ms.setActionHandler('nexttrack', () => player.next())
  ms.setActionHandler('previoustrack', () => player.prev())
  ms.setActionHandler('seekto', (d) => d.seekTime != null && player.seek(d.seekTime))
  ms.setActionHandler('seekbackward', () => player.seekBy(-10))
  ms.setActionHandler('seekforward', () => player.seekBy(10))
}

// ---------- persistence ----------

let saveTimer: ReturnType<typeof setTimeout> | null = null
usePlayer.subscribe((s) => {
  if (saveTimer) return
  saveTimer = setTimeout(
    () => {
      saveTimer = null
      const { queue, index, volume, shuffle, repeat, position } = get()
      try {
        localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({ queue: queue.slice(0, 500), index, volume, shuffle, repeat, position })
        )
      } catch {
        /* storage full or unavailable */
      }
    },
    s.playing ? 5000 : 500
  )
})

window.api.on('media:command', (cmd) => {
  if (cmd === 'toggle') player.toggle()
  else if (cmd === 'next') player.next()
  else player.prev()
})
