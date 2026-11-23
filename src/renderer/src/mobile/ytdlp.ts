// Running yt-dlp on the phone (through the Ytdlp plugin): plain runs with live output, JSON
// listings for the shared parsers, and stream URLs for playback.
import type { YtdlpEntry } from '@shared/ytdlpEntries'
import { Ytdlp, isIos } from './native'

export class YtdlpError extends Error {
  constructor(
    message: string,
    readonly stderr: string,
    readonly canceled = false
  ) {
    super(message)
  }
}

const lineHandlers = new Map<string, (line: string) => void>()
let listening = false
let counter = 0

function listen(): void {
  if (listening) return
  listening = true
  void Ytdlp.addListener('progress', (e) => lineHandlers.get(e.id)?.(e.line))
}

/** The last meaningful line of yt-dlp's error output. */
function lastError(err: string): string {
  const lines = err
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
  return lines.filter((l) => l.startsWith('ERROR:')).at(-1) ?? lines.at(-1) ?? 'yt-dlp failed'
}

/** Run yt-dlp; `onLine` gets each output line as it arrives. Rejects with YtdlpError. */
export async function ytdlp(
  args: string[],
  opts: { id?: string; onLine?: (line: string) => void } = {}
): Promise<string> {
  listen()
  const id = opts.id ?? `run-${++counter}`
  if (opts.onLine) lineHandlers.set(id, opts.onLine)
  try {
    const r = await Ytdlp.run({ id, args })
    if (r.exitCode !== 0) throw new YtdlpError(lastError(r.err), r.err)
    return r.out
  } catch (err) {
    if (err instanceof YtdlpError) throw err
    const e = err as { code?: string; message?: string }
    if (e.code === 'CANCELED') throw new YtdlpError('Canceled', '', true)
    const msg = e.message ?? String(err)
    throw new YtdlpError(lastError(msg), msg)
  } finally {
    lineHandlers.delete(id)
  }
}

export const cancelYtdlp = (id: string): Promise<unknown> => Ytdlp.cancel({ id })

export async function ytdlpJson(
  target: string,
  flat: boolean,
  more: string[] = []
): Promise<YtdlpEntry> {
  const extra = flat ? ['--flat-playlist'] : ['--no-playlist']
  const out = await ytdlp(['-J', '--skip-download', ...extra, ...more, target])
  return JSON.parse(out) as YtdlpEntry
}

// ---------- stream URLs ----------

export interface Stream {
  url: string
  userAgent?: string
  expires: number
}

const streams = new Map<string, Stream>()
const pending = new Map<string, Promise<Stream>>()

/** A playable audio URL for a video, cached until shortly before YouTube expires it. */
export function resolveStream(videoId: string): Promise<Stream> {
  const hit = streams.get(videoId)
  if (hit && hit.expires > Date.now()) return Promise.resolve(hit)
  let p = pending.get(videoId)
  if (!p) {
    p = (async () => {
      const out = await ytdlp([
        '--no-playlist',
        '-f',
        // AVPlayer streams HLS natively (and HLS needs no byte-range workaround); ExoPlayer
        // handles the plain files, with ranges translated in PlaybackService.
        isIos
          ? 'bestaudio[protocol^=m3u8]/bestaudio[ext=m4a]/bestaudio'
          : 'bestaudio[ext=m4a]/bestaudio[ext=webm]/bestaudio',
        '-O',
        '%(url)s',
        '-O',
        '%(http_headers.User-Agent)s',
        `https://www.youtube.com/watch?v=${videoId}`
      ])
      const [url, ua] = out
        .trim()
        .split('\n')
        .map((l) => l.trim())
      if (!url?.startsWith('http')) throw new YtdlpError('No playable stream was found.', out)
      const expire = Number(new URL(url).searchParams.get('expire'))
      const stream: Stream = {
        url,
        userAgent: ua && ua !== 'NA' ? ua : undefined,
        expires: expire ? expire * 1000 - 5 * 60 * 1000 : Date.now() + 60 * 60 * 1000
      }
      streams.set(videoId, stream)
      return stream
    })().finally(() => pending.delete(videoId))
    pending.set(videoId, p)
  }
  return p
}
