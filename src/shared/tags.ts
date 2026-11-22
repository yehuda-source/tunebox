// Tag fields as ffmpeg arguments, shared by the desktop and phone taggers.

export interface Tags {
  title: string
  artist: string
  album?: string
  albumArtist?: string
  trackNumber?: number | null
  year?: string | null
  videoId?: string | null
}

/** `-metadata key=value` pairs (empty values clear a tag). */
export function metadataArgs(t: Tags, flag = '-metadata'): string[] {
  const m: Record<string, string | undefined> = {
    title: t.title,
    artist: t.artist,
    album: t.album,
    album_artist: t.albumArtist,
    track: t.trackNumber ? String(t.trackNumber) : undefined,
    date: t.year ?? undefined,
    comment: t.videoId ? `youtube:${t.videoId}` : undefined
  }
  return Object.entries(m).flatMap(([k, v]) => [flag, `${k}=${v ?? ''}`])
}
