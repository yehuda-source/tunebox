// Cover art and tags on the phone. Android uses the ffmpeg that ships inside youtubedl-android
// (same approach as the desktop tagger, src/main/library/tagger.ts); iOS has no ffmpeg, so the
// cover is cropped natively and tags are written by mutagen in the embedded Python.
import { metadataArgs, type Tags } from '@shared/tags'
import { Files, Ytdlp, isIos } from './native'

async function ffmpeg(args: string[]): Promise<void> {
  const r = await Files.ffmpeg({ args: ['-y', '-loglevel', 'error', ...args] })
  if (r.exitCode !== 0) throw new Error(`ffmpeg failed: ${r.out.trim().split('\n').at(-1) ?? ''}`)
}

/** Download a thumbnail and make it a square JPEG for album art. */
export async function prepareCover(
  url: string | undefined,
  workDir: string
): Promise<string | null> {
  if (!url) return null
  const raw = `${workDir}/cover-src`
  const out = `${workDir}/cover.jpg`
  try {
    if (isIos) {
      await Files.squareCover({ url, path: out })
      return out
    }
    await Files.download({ url, path: raw })
    await ffmpeg([
      '-i',
      raw,
      '-vf',
      "crop='min(iw,ih)':'min(iw,ih)',scale='min(1200,iw)':-2",
      '-frames:v',
      '1',
      '-q:v',
      '2',
      out
    ])
    return out
  } catch (err) {
    console.warn('Could not prepare cover art', err)
    return null
  }
}

/** Rewrite tags (and cover art, except for Opus) in place. */
export async function writeTags(file: string, tags: Tags, cover: string | null): Promise<void> {
  if (isIos) {
    await Ytdlp.tag({ path: file, tags: { ...tags }, cover: cover ?? undefined })
    return
  }
  const ext = file.slice(file.lastIndexOf('.')).toLowerCase()
  const ogg = ext === '.opus' || ext === '.ogg'
  const tmp = `${file}.tagging${ext}`
  const args = ['-i', file]
  if (ogg) {
    args.push(
      '-map',
      '0:a',
      '-c',
      'copy',
      '-map_metadata',
      '0',
      ...metadataArgs(tags, '-metadata:s:a:0')
    )
  } else {
    if (cover) args.push('-i', cover)
    args.push('-map', '0:a')
    if (cover) {
      args.push('-map', '1:0', '-c', 'copy', '-disposition:v:0', 'attached_pic')
      if (ext === '.mp3')
        args.push('-metadata:s:v', 'title=Album cover', '-metadata:s:v', 'comment=Cover (front)')
    } else {
      args.push('-map', '0:v?', '-c', 'copy')
    }
    args.push('-map_metadata', '0', ...metadataArgs(tags))
    if (ext === '.mp3') args.push('-id3v2_version', '3')
  }
  args.push(tmp)
  try {
    await ffmpeg(args)
    await Files.move({ from: tmp, to: file })
  } finally {
    await Files.remove({ path: tmp }).catch(() => undefined)
  }
}
