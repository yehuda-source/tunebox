/** Parse a Range header against a known size. Returns null for "whole file". */
export function parseRange(
  header: string | null,
  size: number
): { start: number; end: number } | 'invalid' | null {
  const m = header?.match(/bytes=(\d*)-(\d*)/)
  if (!m) return null
  let start = m[1] ? Number(m[1]) : 0
  let end = m[2] ? Number(m[2]) : size - 1
  if (!m[1] && m[2]) {
    start = Math.max(0, size - Number(m[2]))
    end = size - 1
  }
  end = Math.min(end, size - 1)
  if (start >= size || end < start) return 'invalid'
  return { start, end }
}
