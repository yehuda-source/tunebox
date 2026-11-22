// What differs between the desktop app and the phone app, set by the phone entry before the UI loads.
export interface Platform {
  /** Phone layout: bottom tabs, compact player, no desktop-only actions. */
  phone: boolean
  /** The audio engine. The phone uses a native player so music keeps going with the screen off. */
  createAudio?: () => HTMLAudioElement
  /** Told what is about to play (title, artist, cover) before the audio source changes. */
  nowPlaying?: (item: { title: string; artist: string; album?: string; cover?: string }) => void
  /** Where a library track's cover image is served. */
  coverUrl?: (trackId: number) => string
}

export const platform: Platform = { phone: false }

/** Switch to the phone layout (call before the UI renders). */
export function enablePhoneLayout(): void {
  platform.phone = true
  document.documentElement.dataset.phone = ''
}
