import type { AudioFormat } from './types'

/**
 * yt-dlp copies audio untouched when the source already has the target codec, ignoring the
 * bitrate. So for a reduced M4A/Opus bitrate, start from the other codec to force a re-encode.
 */
export function formatArgs(format: AudioFormat, bitrate: number): string[] {
  if (format === 'mp3') {
    return [
      '-f',
      'bestaudio/best',
      '-x',
      '--audio-format',
      'mp3',
      '--audio-quality',
      `${bitrate || 320}K`
    ]
  }
  const native = format === 'm4a' ? 'bestaudio[ext=m4a]' : 'bestaudio[acodec=opus]'
  const other = format === 'm4a' ? 'bestaudio[acodec=opus]' : 'bestaudio[ext=m4a]'
  if (!bitrate)
    return [
      '-f',
      `${native}/bestaudio/best`,
      '-x',
      '--audio-format',
      format,
      '--audio-quality',
      '0'
    ]
  return [
    '-f',
    `${other}/bestaudio/best`,
    '-x',
    '--audio-format',
    format,
    '--audio-quality',
    `${bitrate}K`
  ]
}
