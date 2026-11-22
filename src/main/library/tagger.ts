import { net } from 'electron'
import { writeFile, readFile, rename, rm, copyFile, unlink } from 'fs/promises'
import { join, extname } from 'path'
import { ffmpegPath } from '../binaries/manager'
import { run } from '../proc'
import log from '../log'
import { metadataArgs, type Tags } from '../../shared/tags'

export type { Tags }

/** Fetch a thumbnail and turn it into a square JPEG suitable as album art. */
export async function prepareCover(
  url: string | undefined,
  workDir: string
): Promise<string | null> {
  if (!url) return null
  try {
    const res = await net.fetch(url)
    if (!res.ok) return null
    const raw = join(workDir, 'cover-src')
    const out = join(workDir, 'cover.jpg')
    await writeFile(raw, Buffer.from(await res.arrayBuffer()))
    await run(
      ffmpegPath(),
      [
        '-y',
        '-loglevel',
        'error',
        '-i',
        raw,
        '-vf',
        "crop='min(iw,ih)':'min(iw,ih)',scale='min(1200,iw)':-2",
        '-frames:v',
        '1',
        '-q:v',
        '2',
        out
      ],
      { timeoutMs: 30000 }
    )
    return out
  } catch (err) {
    log.warn('Could not prepare cover art', err)
    return null
  }
}

/** A FLAC picture block (base64), the way Ogg/Opus files carry cover art. */
async function pictureBlock(jpeg: string): Promise<string> {
  const data = await readFile(jpeg)
  const mime = Buffer.from('image/jpeg')
  const head = Buffer.alloc(8 + mime.length + 4 + 16 + 4)
  let o = 0
  o = head.writeUInt32BE(3, o) // front cover
  o = head.writeUInt32BE(mime.length, o)
  o += mime.copy(head, o)
  o = head.writeUInt32BE(0, o) // description length
  o += 16 // width, height, depth, colors: unknown
  head.writeUInt32BE(data.length, o)
  return Buffer.concat([head, data]).toString('base64')
}

const ffmetaEscape = (v: string): string => v.replace(/[=;#\\\n]/g, (c) => `\\${c}`)

/** Rewrite tags (and optionally cover art) in place, for mp3, m4a and opus alike. */
export async function writeTags(file: string, tags: Tags, cover: string | null): Promise<void> {
  const ext = extname(file).toLowerCase()
  const ogg = ext === '.opus' || ext === '.ogg'
  const tmp = `${file}.tagging${ext}`
  const meta = `${file}.ffmeta`
  const args = ['-y', '-loglevel', 'error', '-i', file]

  if (ogg) {
    // Ogg/Opus keep tags on the audio stream; cover art is a METADATA_BLOCK_PICTURE comment,
    // passed through an ffmetadata file because it is too large for a command-line argument.
    args.push('-map', '0:a', '-c', 'copy', '-map_metadata', '0')
    if (cover) {
      await writeFile(
        meta,
        `;FFMETADATA1\n[STREAM]\nMETADATA_BLOCK_PICTURE=${ffmetaEscape(await pictureBlock(cover))}\n`
      )
      args.splice(5, 0, '-f', 'ffmetadata', '-i', meta)
      args.push('-map_metadata:s:a:0', '1:s:0')
    } else {
      args.push('-map_metadata:s:a', '0:s:a')
    }
    args.push(...metadataArgs(tags, '-metadata:s:a:0'))
  } else {
    if (cover) args.push('-i', cover)
    args.push('-map', '0:a')
    if (cover) {
      args.push('-map', '1:0', '-c', 'copy', '-disposition:v:0', 'attached_pic')
      if (ext === '.mp3')
        args.push('-metadata:s:v', 'title=Album cover', '-metadata:s:v', 'comment=Cover (front)')
    } else {
      // Keep an existing cover (attached picture stream) when not replacing it.
      args.push('-map', '0:v?', '-c', 'copy')
    }
    args.push('-map_metadata', '0', ...metadataArgs(tags))
    if (ext === '.mp3') args.push('-id3v2_version', '3')
  }
  args.push(tmp)
  try {
    await run(ffmpegPath(), args, { timeoutMs: 120000 })
    await rename(tmp, file)
  } finally {
    await rm(tmp, { force: true })
    await rm(meta, { force: true })
  }
}

/** Move across drives too (rename fails with EXDEV between filesystems). */
export async function moveFile(from: string, to: string): Promise<void> {
  try {
    await rename(from, to)
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'EXDEV') throw err
    await copyFile(from, to)
    await unlink(from)
  }
}
