import { protocol } from 'electron'
import { createReadStream } from 'fs'
import { stat } from 'fs/promises'
import { Readable } from 'stream'
import { extname } from 'path'
import { trackById, cover } from './library/library'
import { streamResponse } from './youtube/stream'
import { parseRange } from './youtube/stream-range'
import log from './log'

export const SCHEME = 'tunebox-media'

const MIME: Record<string, string> = {
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
  '.opus': 'audio/ogg',
  '.ogg': 'audio/ogg',
  '.flac': 'audio/flac',
  '.wav': 'audio/wav',
  '.webm': 'audio/webm'
}

export function registerSchemePrivileges(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: SCHEME,
      privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true }
    }
  ])
}

async function serveFile(path: string, request: Request): Promise<Response> {
  const { size } = await stat(path)
  const type = MIME[extname(path).toLowerCase()] ?? 'application/octet-stream'
  const range = parseRange(request.headers.get('range'), size)
  if (!range) {
    const body = Readable.toWeb(createReadStream(path)) as ReadableStream
    return new Response(body, {
      status: 200,
      headers: { 'Content-Type': type, 'Content-Length': String(size), 'Accept-Ranges': 'bytes' }
    })
  }
  if (range === 'invalid') {
    return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } })
  }
  const { start, end } = range
  const body = Readable.toWeb(createReadStream(path, { start, end })) as ReadableStream
  return new Response(body, {
    status: 206,
    headers: {
      'Content-Type': type,
      'Content-Length': String(end - start + 1),
      'Content-Range': `bytes ${start}-${end}/${size}`,
      'Accept-Ranges': 'bytes'
    }
  })
}

/**
 * tunebox-media://track/<id>   a library file (with Range support)
 * tunebox-media://cover/<id>   embedded cover art of a library file
 * tunebox-media://stream/<videoId>  a YouTube audio stream, proxied
 */
export function handleMediaProtocol(): void {
  protocol.handle(SCHEME, async (request) => {
    const url = new URL(request.url)
    const id = decodeURIComponent(url.pathname.replace(/^\//, ''))
    try {
      if (url.host === 'track') {
        const t = trackById(Number(id))
        if (!t) return new Response('Not found', { status: 404 })
        return await serveFile(t.path, request)
      }
      if (url.host === 'cover') {
        const c = await cover(Number(id))
        if (!c) return new Response('No cover', { status: 404 })
        return new Response(Buffer.from(c.data), {
          headers: { 'Content-Type': c.mime, 'Cache-Control': 'max-age=3600' }
        })
      }
      if (url.host === 'stream' && /^[\w-]{11}$/.test(id)) return await streamResponse(id, request)
    } catch (err) {
      log.warn(`Media request failed: ${request.url}`, err)
      return new Response(String(err), { status: 500 })
    }
    return new Response('Bad request', { status: 400 })
  })
}
