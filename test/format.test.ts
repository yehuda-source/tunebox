import { describe, expect, it } from 'vitest'
import { formatArgs } from '../src/shared/format'

const after = (args: string[], flag: string): string => args[args.indexOf(flag) + 1]

describe('formatArgs', () => {
  it('uses the bitrate for MP3, 320 for best', () => {
    expect(after(formatArgs('mp3', 0), '--audio-quality')).toBe('320K')
    expect(after(formatArgs('mp3', 192), '--audio-quality')).toBe('192K')
  })
  it('keeps the original stream for best M4A/Opus', () => {
    expect(after(formatArgs('m4a', 0), '-f')).toMatch(/^bestaudio\[ext=m4a\]/)
    expect(after(formatArgs('opus', 0), '-f')).toMatch(/^bestaudio\[acodec=opus\]/)
  })
  it('starts from the other codec to force a re-encode at lower bitrates', () => {
    const m4a = formatArgs('m4a', 96)
    expect(after(m4a, '-f')).toMatch(/^bestaudio\[acodec=opus\]/)
    expect(after(m4a, '--audio-quality')).toBe('96K')
    expect(after(formatArgs('opus', 64), '-f')).toMatch(/^bestaudio\[ext=m4a\]/)
  })
})
