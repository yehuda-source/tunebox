import { AudioLines, FolderOpen } from 'lucide-react'
import { useApp } from '../store/app'
import { Button } from './ui'
import { ToolsPanel } from './ToolsPanel'

export function FirstRun(): React.JSX.Element | null {
  const s = useApp((st) => st.settings)
  const tools = useApp((st) => st.tools)
  const update = useApp((st) => st.update)
  if (!s || s.firstRunDone) return null
  const ready = tools && !tools.busy && tools.ytdlp.source !== 'missing'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-bg/80 p-6 backdrop-blur-md">
      <div className="w-full max-w-xl rounded-3xl border border-line bg-panel p-8 shadow-2xl">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent text-accent-fg">
          <AudioLines className="h-8 w-8" />
        </div>
        <h1 className="mt-5 text-3xl font-black tracking-tight">Welcome to TuneBox</h1>
        <p className="mt-2 text-muted">
          Search YouTube Music, play anything instantly, and build a local library that works
          offline.
        </p>

        <div className="mt-6">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-faint">
            Save music to
          </div>
          <div className="flex items-center gap-2">
            <div className="flex h-10 flex-1 items-center truncate rounded-xl border border-line bg-elev px-3 text-[13px]">
              {s.libraryDir}
            </div>
            <Button
              icon={<FolderOpen className="h-4 w-4" />}
              onClick={async () => {
                const p = await window.api.settings.pickFolder()
                if (p) void update({ libraryDir: p })
              }}
            >
              Change
            </Button>
          </div>
        </div>

        <div className="mt-6">
          <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-faint">
            Setting up tools
          </div>
          <ToolsPanel compact />
        </div>

        <div className="mt-8 flex items-center justify-end gap-3">
          {!ready && (
            <span className="text-[13px] text-muted">
              You can start browsing while this finishes.
            </span>
          )}
          <Button variant="primary" size="lg" onClick={() => void update({ firstRunDone: true })}>
            Get started
          </Button>
        </div>
      </div>
    </div>
  )
}
