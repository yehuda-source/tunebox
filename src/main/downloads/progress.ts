// yt-dlp is run with --progress-template "download:TBPROG|<downloaded>|<total>|<estimate>|<speed>|<eta>"

export const PROGRESS_TEMPLATE =
  'download:TBPROG|%(progress.downloaded_bytes)s|%(progress.total_bytes)s|%(progress.total_bytes_estimate)s|%(progress.speed)s|%(progress.eta)s'

export interface ProgressInfo {
  progress: number
  speed: number | null
  eta: number | null
}

const num = (s: string | undefined): number | null => {
  if (!s || s === 'NA' || s === 'None') return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

export function parseProgressLine(line: string): ProgressInfo | null {
  const i = line.indexOf('TBPROG|')
  if (i < 0) return null
  const [, done, total, estimate, speed, eta] = line.slice(i).trim().split('|')
  const d = num(done)
  const t = num(total) ?? num(estimate)
  if (d == null || !t) return { progress: 0, speed: num(speed), eta: num(eta) }
  return { progress: Math.min(1, Math.max(0, d / t)), speed: num(speed), eta: num(eta) }
}
