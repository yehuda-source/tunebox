import { net } from 'electron'
import { ytdlpCommand } from '../binaries/manager'
import { run } from '../proc'
import { parseRange } from './stream-range'
import log from '../log'

interface Resolved {
  url: string
  headers: Record<string, string>
  expires: number
}

const cache = new Map<string, Resolved>()
const pending = new Map<string, Promise<Resolved>>()

async function resolveStream(videoId: string): Promise<Resolved> {
  const hit = cache.get(videoId)
  if (hit && hit.expires > Date.now()) return hit
  let p = pending.get(videoId)
  if (!p) {
    p = (async () => {
      // Prefer formats Chromium plays natively (opus/webm, then m4a).
      const { cmd, args, env } = ytdlpCommand([
        '-j',
        '--no-playlist',
        '-f',
        'bestaudio[ext=webm]/bestaudio[ext=m4a]/bestaudio',
        `https://www.youtube.com/watch?v=${videoId}`
      ])
      const r = await run(cmd, args, { env, timeoutMs: 60000 })
      const info = JSON.parse(r.stdout) as { url: string; http_headers?: Record<string, string> }
      const expireParam = Number(new URL(info.url).searchParams.get('expire'))
      const resolved = {
        url: info.url,
        headers: info.http_headers ?? {},
        expires: expireParam ? expireParam * 1000 - 5 * 60 * 1000 : Date.now() + 60 * 60 * 1000
      }
      cache.set(videoId, resolved)
      return resolved
    })().finally(() => pending.delete(videoId))
    pending.set(videoId, p)
  }
  return p
}

/**
 * Proxy a YouTube audio stream to the renderer with seeking support.
 * YouTube rejects HTTP Range headers on some clients' URLs but accepts the same
 * byte range as a `range=` query parameter, so ranges are translated, and the
 * 206 response is built here from the size in the URL (`clen`).
 */
export async function streamResponse(videoId: string, request: Request): Promise<Response> {
  // A fresh resolve often lands on a different YouTube client whose URL works.
  for (let attempt = 0; attempt < 3; attempt++) {
    const r = await resolveStream(videoId)
    const url = new URL(r.url)
    const size = Number(url.searchParams.get('clen')) || 0
    const headers: Record<string, string> = { ...r.headers }
    delete headers['Accept-Encoding']

    let range: ReturnType<typeof parseRange> = null
    if (size) {
      range = parseRange(request.headers.get('range'), size)
      if (range === 'invalid')
        return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } })
      const { start, end } = range ?? { start: 0, end: size - 1 }
      url.searchParams.set('range', `${start}-${end}`)
    } else if (request.headers.get('range')) {
      headers['Range'] = request.headers.get('range')!
    }

    const upstream = await net.fetch(url.toString(), { headers })
    if (upstream.status === 403 || upstream.status === 410) {
      log.warn(`Stream URL for ${videoId} rejected (${upstream.status}), resolving again`)
      upstream.body?.cancel().catch(() => undefined)
      cache.delete(videoId)
      continue
    }
    if (!upstream.ok) return new Response('Stream unavailable', { status: 502 })

    const out = new Headers({ 'Accept-Ranges': 'bytes' })
    const type = upstream.headers.get('content-type')
    if (type) out.set('Content-Type', type)
    if (size) {
      const { start, end } = range ?? { start: 0, end: size - 1 }
      out.set('Content-Length', String(end - start + 1))
      if (range) out.set('Content-Range', `bytes ${start}-${end}/${size}`)
      return new Response(upstream.body, { status: range ? 206 : 200, headers: out })
    }
    for (const h of ['content-length', 'content-range']) {
      const v = upstream.headers.get(h)
      if (v) out.set(h, v)
    }
    return new Response(upstream.body, { status: upstream.status, headers: out })
  }
  return new Response('Stream unavailable', { status: 502 })
}

export function prefetchStream(videoId: string): void {
  resolveStream(videoId).catch(() => undefined)
}
