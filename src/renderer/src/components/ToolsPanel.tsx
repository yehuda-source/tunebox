import { CheckCircle2, AlertTriangle, RefreshCw, Stethoscope } from 'lucide-react'
import { useApp } from '../store/app'
import { Button, Spinner } from './ui'
import { toast } from '../store/toast'
import { cn } from '../lib/format'

const SOURCE: Record<string, string> = {
  managed: 'auto-updating copy',
  bundled: 'bundled with the app',
  custom: 'custom path',
  system: 'from system PATH',
  missing: 'not found'
}

function Row({
  name,
  version,
  source,
  path
}: {
  name: string
  version: string | null
  source: string
  path: string | null
}): React.JSX.Element {
  const ok = source !== 'missing'
  return (
    <div className="flex items-center gap-3 py-2.5">
      {ok ? (
        <CheckCircle2 className="h-4 w-4 text-ok" />
      ) : (
        <AlertTriangle className="h-4 w-4 text-danger" />
      )}
      <div className="w-24 font-medium">{name}</div>
      <div className="flex-1 truncate text-[13px] text-muted" title={path ?? ''}>
        {ok ? `${version ?? 'unknown version'} · ${SOURCE[source]}` : 'Not found'}
      </div>
    </div>
  )
}

export function ToolsPanel({ compact }: { compact?: boolean }): React.JSX.Element {
  const tools = useApp((s) => s.tools)
  if (!tools) return <Spinner />
  const busy = tools.busy
  return (
    <div className="flex flex-col">
      <div className="divide-y divide-line">
        <Row name="yt-dlp" {...tools.ytdlp} />
        <Row name="ffmpeg" {...tools.ffmpeg} />
        <div className="flex items-center gap-3 py-2.5">
          <CheckCircle2 className="h-4 w-4 text-ok" />
          <div className="w-24 font-medium">JS runtime</div>
          <div className="flex-1 truncate text-[13px] text-muted">{tools.jsRuntime.detail}</div>
        </div>
        <div className="flex items-center gap-3 py-2.5">
          {busy ? (
            <Spinner className="h-4 w-4 text-accent" />
          ) : tools.selfTest?.ok ? (
            <CheckCircle2 className="h-4 w-4 text-ok" />
          ) : (
            <AlertTriangle
              className={cn('h-4 w-4', tools.selfTest ? 'text-danger' : 'text-faint')}
            />
          )}
          <div className="w-24 font-medium">YouTube</div>
          <div
            className={cn(
              'flex-1 text-[13px] select-text',
              tools.selfTest && !tools.selfTest.ok ? 'text-danger' : 'text-muted'
            )}
          >
            {busy ?? tools.selfTest?.message ?? 'Not tested yet'}
          </div>
        </div>
      </div>
      {!compact && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            icon={<RefreshCw className="h-3.5 w-3.5" />}
            disabled={!!busy}
            onClick={async () => {
              const s = await window.api.tools.update()
              toast.success('yt-dlp is up to date', s.ytdlp.version ?? undefined)
            }}
          >
            Update now
          </Button>
          <Button
            size="sm"
            icon={<Stethoscope className="h-3.5 w-3.5" />}
            disabled={!!busy}
            onClick={() => void window.api.tools.selfTest()}
          >
            Run test
          </Button>
          <span className="text-xs text-faint">
            {tools.lastUpdateCheck
              ? `Last checked ${new Date(tools.lastUpdateCheck).toLocaleString()}`
              : ''}
            {tools.latestYtdlp ? ` · latest ${tools.latestYtdlp}` : ''}
          </span>
        </div>
      )}
    </div>
  )
}
