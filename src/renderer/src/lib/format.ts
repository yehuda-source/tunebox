export function duration(sec: number | null | undefined): string {
  if (sec == null || !Number.isFinite(sec) || sec < 0) return '–:––'
  const s = Math.floor(sec % 60)
  const m = Math.floor(sec / 60) % 60
  const h = Math.floor(sec / 3600)
  return h
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${m}:${String(s).padStart(2, '0')}`
}

export function bytes(n: number | null | undefined): string {
  if (!n) return ''
  const units = ['B', 'KB', 'MB', 'GB']
  let i = 0
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024
    i++
  }
  return `${n.toFixed(i ? 1 : 0)} ${units[i]}`
}

export function totalDuration(secs: (number | null | undefined)[]): string {
  const total = secs.reduce<number>((a, b) => a + (b ?? 0), 0)
  const h = Math.floor(total / 3600)
  const m = Math.round((total % 3600) / 60)
  return h ? `${h} hr ${m} min` : `${m} min`
}

export const cn = (...c: (string | false | null | undefined)[]): string =>
  c.filter(Boolean).join(' ')

export function errorMessage(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err)
  // Strip Electron's "Error invoking remote method 'x': Error: " prefix.
  return msg.replace(/^Error invoking remote method '[^']+': (\w*Error: )?/, '')
}
