/**
 * Whether a playlist/channel entry is a real, watchable episode. Shows keep placeholders for
 * private (unreleased or hidden) and deleted videos: yt-dlp lists them with no title at all, or
 * as "[Private video]" / "[Deleted video]". Skipping them keeps "Untitled" rows out of the list
 * and keeps auto-download from queueing videos that can't be downloaded. If one is published
 * later it reappears with its title and counts as a new episode then.
 */
export function isListedEpisode(e: { id?: string | null; title?: string | null }): boolean {
  const title = e.title?.trim()
  return Boolean(e.id && title && !/^\[(private|deleted) video\]$/i.test(title))
}
