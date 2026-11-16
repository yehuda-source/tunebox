// Filename rules that are safe on both Windows and Linux.

const RESERVED = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])$/i

export function safeName(input: string | undefined | null, fallback = 'Unknown'): string {
  let s = (input ?? '')
    .normalize('NFC')
    .replace(/[<>:"/\\|?*]/g, '_')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/, '')

  if (!s) s = fallback
  if (RESERVED.test(s)) s = `_${s}`
  // Leave room for track numbers and extensions inside the 255-byte limit.
  while (Buffer.byteLength(s, 'utf8') > 180) s = s.slice(0, -1)
  return s.trim().replace(/[. ]+$/, '') || fallback
}
