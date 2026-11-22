import type { ShowDetails, ShowKind, TrackRef } from '../../shared/types'
import {
  entryToTrack,
  loadShowWith,
  resolveUrlWith,
  type YtdlpEntry
} from '../../shared/ytdlpEntries'
import { ytdlpCommand } from '../binaries/manager'
import { run } from '../proc'

export async function ytdlpJson(
  target: string,
  flat: boolean,
  more: string[] = []
): Promise<YtdlpEntry> {
  const extra = flat ? ['--flat-playlist'] : ['--no-playlist']
  const { cmd, args, env } = ytdlpCommand(['-J', '--skip-download', ...extra, ...more, target])
  const r = await run(cmd, args, { env, timeoutMs: 120000 })
  return JSON.parse(r.stdout) as YtdlpEntry
}

export async function ytdlpSearch(query: string): Promise<TrackRef[]> {
  const data = await ytdlpJson(`ytsearch20:${query}`, true)
  return (data.entries ?? []).filter((e) => e.id).map((e) => entryToTrack(e))
}

export { entryToTrack }

/** Turn any YouTube / YouTube Music link (video, playlist, album) into tracks. */
export const resolveUrl = (url: string): Promise<TrackRef[]> => resolveUrlWith(ytdlpJson, url)

export const loadShow = (kind: ShowKind, id: string, limit = 100): Promise<ShowDetails> =>
  loadShowWith(ytdlpJson, kind, id, limit)
