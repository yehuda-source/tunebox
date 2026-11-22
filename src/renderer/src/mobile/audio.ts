// An <audio>-element look-alike backed by the native player (android PlayerPlugin), so the shared
// player store works unchanged while music keeps playing in the background with lock-screen controls.
import { NativePlayer, type PlayerState } from './native'

export interface ResolvedMedia {
  url: string
  /** Sent with stream requests (yt-dlp's User-Agent for the URL it resolved). */
  userAgent?: string
  /** Cover for the lock screen when the track has none of its own. */
  artwork?: string
}

export interface NowPlaying {
  title: string
  artist: string
  album?: string
  cover?: string
}

class NativeAudio extends EventTarget {
  preload = 'auto'
  private source = ''
  private time = 0
  private dur = NaN
  private isPaused = true
  private isEnded = false
  private ready = 0
  private vol = 1
  private mute = false
  /** Bumped on every src change, so late results for an old track are ignored. */
  private token = 0
  private loaded = false
  private loading: Promise<boolean> = Promise.resolve(false)
  private startAt = 0
  private meta: NowPlaying | null = null

  constructor(private resolve: (src: string) => Promise<ResolvedMedia>) {
    super()
    void NativePlayer.addListener('state', (s) => this.onState(s))
    void NativePlayer.addListener('time', (t) => {
      if (!this.loaded) return
      this.time = t.position
      if (t.duration > 0) this.setDuration(t.duration)
      this.fire('timeupdate')
    })
    void NativePlayer.addListener('error', (e) => {
      if (!this.loaded) return
      console.warn('Native player error', e.message)
      this.isPaused = true
      this.fire('error')
    })
  }

  private fire(type: string): void {
    this.dispatchEvent(new Event(type))
  }

  private setDuration(d: number): void {
    if (d === this.dur) return
    this.dur = d
    this.fire('loadedmetadata')
  }

  private onState(s: PlayerState): void {
    if (!this.loaded) return
    if (s.duration > 0) this.setDuration(s.duration)
    if (s.ended) {
      if (!this.isEnded) {
        this.isEnded = true
        this.isPaused = true
        this.fire('ended')
      }
      return
    }
    // Paused or resumed from the notification, a headset, or another app taking audio focus.
    if (s.playWhenReady === this.isPaused) {
      this.isPaused = !s.playWhenReady
      this.fire(this.isPaused ? 'pause' : 'play')
    }
    if (s.buffering) {
      this.ready = 2
      this.fire('waiting')
    } else if (s.ready) {
      this.ready = 4
      this.fire('canplay')
    }
    if (s.playing) this.fire('playing')
  }

  setNowPlaying(meta: NowPlaying): void {
    this.meta = meta
  }

  get src(): string {
    return this.source
  }

  set src(value: string) {
    const token = ++this.token
    // Stop the previous track now; resolving a stream URL can take several seconds.
    if (this.loaded && value) void NativePlayer.pause()
    this.source = value
    this.loaded = false
    this.time = 0
    this.dur = NaN
    this.isEnded = false
    this.ready = 0
    this.startAt = 0
    if (!value) {
      this.isPaused = true
      this.loading = Promise.resolve(false)
      void NativePlayer.stop()
      return
    }
    this.loading = (async () => {
      try {
        const media = await this.resolve(value)
        if (token !== this.token) return false
        const meta = this.meta
        await NativePlayer.load({
          url: media.url,
          key: value,
          userAgent: media.userAgent,
          title: meta?.title,
          artist: meta?.artist,
          album: meta?.album,
          artwork: media.artwork ?? meta?.cover,
          startAt: this.startAt,
          autoplay: !this.isPaused
        })
        if (token !== this.token) return false
        this.loaded = true
        this.ready = 1
        return true
      } catch (err) {
        if (token === this.token) {
          console.warn('Could not load', value, err)
          this.isPaused = true
          this.fire('error')
        }
        return false
      }
    })()
  }

  getAttribute(name: string): string | null {
    return name === 'src' ? this.source || null : null
  }

  removeAttribute(name: string): void {
    if (name === 'src') this.src = ''
  }

  load(): void {
    /* loading starts when src is set */
  }

  get currentTime(): number {
    return this.time
  }

  set currentTime(t: number) {
    this.time = t
    if (this.loaded) void NativePlayer.seek({ position: t })
    else this.startAt = t
    this.fire('timeupdate')
  }

  get duration(): number {
    return this.dur
  }

  get paused(): boolean {
    return this.isPaused
  }

  get ended(): boolean {
    return this.isEnded
  }

  get seeking(): boolean {
    return false
  }

  get readyState(): number {
    return this.ready
  }

  get volume(): number {
    return this.vol
  }

  set volume(v: number) {
    this.vol = v
    void NativePlayer.setVolume({ volume: this.mute ? 0 : v })
  }

  get muted(): boolean {
    return this.mute
  }

  set muted(m: boolean) {
    this.mute = m
    void NativePlayer.setVolume({ volume: m ? 0 : this.vol })
  }

  async play(): Promise<void> {
    const token = this.token
    const wasPaused = this.isPaused
    this.isPaused = false
    this.isEnded = false
    if (wasPaused) this.fire('play')
    // Before the track has loaded, `load` picks up autoplay from isPaused.
    if (!(await this.loading) || token !== this.token || this.isPaused) return
    await NativePlayer.play()
  }

  pause(): void {
    if (this.isPaused) return
    this.isPaused = true
    this.fire('pause')
    void NativePlayer.pause()
  }
}

export function createNativeAudio(resolve: (src: string) => Promise<ResolvedMedia>): {
  audio: HTMLAudioElement
  setNowPlaying: (meta: NowPlaying) => void
} {
  const a = new NativeAudio(resolve)
  return {
    audio: a as unknown as HTMLAudioElement,
    setNowPlaying: (meta) => a.setNowPlaying(meta)
  }
}
