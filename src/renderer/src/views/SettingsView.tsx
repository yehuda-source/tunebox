import { useEffect, useState, type ReactNode } from 'react'
import { FolderOpen, Plus, X, FileText } from 'lucide-react'
import type { AppInfo, AudioFormat, Settings } from '@shared/types'
import { useApp } from '../store/app'
import { Button, Spinner } from '../components/ui'
import { ToolsPanel } from '../components/ToolsPanel'
import { platform } from '../lib/platform'
import { DuplicatesButton } from '../components/DuplicatesButton'
import { Page } from './common'
import { cn } from '../lib/format'

function Section({
  title,
  desc,
  children
}: {
  title: string
  desc?: string
  children: ReactNode
}): React.JSX.Element {
  return (
    <section className="grid grid-cols-1 gap-6 border-b border-line py-8 lg:grid-cols-[260px_1fr]">
      <div>
        <h2 className="font-semibold">{title}</h2>
        {desc && <p className="mt-1 text-[13px] text-muted">{desc}</p>}
      </div>
      <div className="flex flex-col gap-5">{children}</div>
    </section>
  )
}

function Row({
  label,
  hint,
  children
}: {
  label: string
  hint?: ReactNode
  children: ReactNode
}): React.JSX.Element {
  return (
    <div className="flex items-center justify-between gap-6">
      <div className="min-w-0">
        <div className="text-[14px]">{label}</div>
        {hint && <div className="mt-0.5 text-[13px] text-muted">{hint}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}

function Toggle({
  checked,
  onChange
}: {
  checked: boolean
  onChange: (v: boolean) => void
}): React.JSX.Element {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative h-6 w-11 rounded-full transition-colors',
        checked ? 'bg-accent' : 'bg-line'
      )}
    >
      <span
        className={cn(
          'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all',
          checked ? 'left-[22px]' : 'left-0.5'
        )}
      />
    </button>
  )
}

function Segmented<T extends string>({
  value,
  options,
  onChange
}: {
  value: T
  options: { id: T; label: string }[]
  onChange: (v: T) => void
}): React.JSX.Element {
  return (
    <div className="flex rounded-full border border-line bg-elev p-0.5">
      {options.map((o) => (
        <button
          key={o.id}
          onClick={() => onChange(o.id)}
          className={cn(
            'h-8 rounded-full px-3.5 text-[13px] font-medium',
            value === o.id ? 'bg-fg text-bg' : 'text-muted hover:text-fg'
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

function PathField({
  value,
  placeholder,
  onPick,
  onClear
}: {
  value: string
  placeholder: string
  onPick: () => void
  onClear?: () => void
}): React.JSX.Element {
  return (
    <div className="flex items-center gap-2">
      <div
        className="flex h-9 min-w-0 max-w-md flex-1 items-center truncate rounded-lg border border-line bg-elev px-3 text-[13px]"
        title={value}
      >
        {value || <span className="text-faint">{placeholder}</span>}
      </div>
      <Button size="sm" icon={<FolderOpen className="h-3.5 w-3.5" />} onClick={onPick}>
        Browse
      </Button>
      {onClear && value && (
        <Button size="sm" variant="ghost" onClick={onClear}>
          Reset
        </Button>
      )}
    </div>
  )
}

const QUALITY: Record<AudioFormat, { kbps: number; label: string }[]> = {
  mp3: [
    { kbps: 0, label: '320' },
    { kbps: 256, label: '256' },
    { kbps: 192, label: '192' },
    { kbps: 128, label: '128' }
  ],
  m4a: [
    { kbps: 0, label: 'Original' },
    { kbps: 96, label: '96' },
    { kbps: 64, label: '64' }
  ],
  opus: [
    { kbps: 0, label: 'Original' },
    { kbps: 96, label: '96' },
    { kbps: 64, label: '64' }
  ]
}

const QUALITY_HINT: Record<AudioFormat, string> = {
  mp3: 'Bitrate in kbps. Lower means smaller files.',
  m4a: 'Original keeps YouTube’s ~128 kbps AAC untouched. Lower values re-encode to save space.',
  opus: 'Original keeps YouTube’s ~130–160 kbps Opus untouched. Lower values re-encode to save space.'
}

const BROWSERS = ['', 'chrome', 'firefox', 'edge', 'brave', 'chromium', 'opera', 'vivaldi']

export function SettingsView(): React.JSX.Element {
  const s = useApp((st) => st.settings)
  const update = useApp((st) => st.update)
  const [info, setInfo] = useState<AppInfo | null>(null)
  useEffect(() => void window.api.app.info().then(setInfo), [])
  if (!s)
    return (
      <Page>
        <Spinner />
      </Page>
    )
  const set = (patch: Partial<Settings>): void => void update(patch)

  return (
    <Page>
      <h1 className="pb-2 pt-2 text-4xl font-black tracking-tight max-sm:text-3xl">Settings</h1>

      <Section
        title="Library"
        desc={
          platform.phone
            ? 'Songs are saved in the app’s own Music folder, organized as Artist / Album / 01 - Title.'
            : 'Where downloads are saved. Extra folders are scanned and watched too.'
        }
      >
        {!platform.phone && (
          <>
            <div>
              <div className="mb-2 text-[14px]">Download folder</div>
              <PathField
                value={s.libraryDir}
                placeholder="Choose a folder"
                onPick={async () => {
                  const p = await window.api.settings.pickFolder()
                  if (p) set({ libraryDir: p })
                }}
              />
              <div className="mt-1.5 text-xs text-faint">
                Files are organized as Artist / Album / 01 - Title
              </div>
            </div>
            <div>
              <div className="mb-2 text-[14px]">Other music folders</div>
              <div className="flex flex-col gap-2">
                {s.extraDirs.map((d) => (
                  <div
                    key={d}
                    className="flex max-w-xl items-center gap-2 rounded-lg border border-line bg-elev px-3 py-1.5 text-[13px]"
                  >
                    <span className="flex-1 truncate">{d}</span>
                    <button
                      className="text-faint hover:text-fg"
                      onClick={() => set({ extraDirs: s.extraDirs.filter((x) => x !== d) })}
                      aria-label="Remove folder"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))}
                <div>
                  <Button
                    size="sm"
                    icon={<Plus className="h-3.5 w-3.5" />}
                    onClick={async () => {
                      const p = await window.api.settings.pickFolder()
                      if (p && !s.extraDirs.includes(p)) set({ extraDirs: [...s.extraDirs, p] })
                    }}
                  >
                    Add folder
                  </Button>
                </div>
              </div>
            </div>
          </>
        )}
        <Row
          label="Duplicate songs"
          hint="Find songs saved more than once (e.g. on an album and a compilation) and remove the extra copies."
        >
          <DuplicatesButton />
        </Row>
      </Section>

      <Section title="Downloads">
        <Row
          label="Audio format"
          hint="MP3 plays everywhere. M4A and Opus keep YouTube’s original quality with no re-encoding."
        >
          <Segmented
            value={s.format}
            onChange={(format) =>
              // Keep the chosen bitrate only if the new format offers it.
              set({
                format,
                bitrate: QUALITY[format].some((q) => q.kbps === s.bitrate) ? s.bitrate : 0
              })
            }
            options={[
              { id: 'mp3', label: 'MP3' },
              { id: 'm4a', label: 'M4A' },
              { id: 'opus', label: 'Opus' }
            ]}
          />
        </Row>
        <Row label="Quality" hint={QUALITY_HINT[s.format]}>
          <Segmented
            value={String(s.bitrate)}
            onChange={(v) => set({ bitrate: Number(v) })}
            options={QUALITY[s.format].map((q) => ({ id: String(q.kbps), label: q.label }))}
          />
        </Row>
        <Row label="Simultaneous downloads">
          <Segmented
            value={String(s.concurrency)}
            onChange={(v) => set({ concurrency: Number(v) })}
            options={['1', '2', '3', '4', '6'].map((n) => ({ id: n, label: n }))}
          />
        </Row>
        <Row label="Skip songs already in the library">
          <Toggle checked={s.skipExisting} onChange={(skipExisting) => set({ skipExisting })} />
        </Row>
        <Row
          label="Skip the same song from other albums"
          hint="Compilations and uploads often repeat songs you have. Matched by title, artist and length."
        >
          <Toggle
            checked={s.skipDuplicates}
            onChange={(skipDuplicates) => set({ skipDuplicates })}
          />
        </Row>
        {!platform.phone && (
          <Row label="Notify when downloads finish">
            <Toggle
              checked={s.notifyOnFinish}
              onChange={(notifyOnFinish) => set({ notifyOnFinish })}
            />
          </Row>
        )}
      </Section>

      {!platform.phone && (
        <Section
          title="YouTube sign-in"
          desc="Only needed for age-restricted songs or if YouTube asks to confirm you’re not a bot."
        >
          <Row
            label="Use cookies from browser"
            hint="Reads your YouTube login from a browser on this computer."
          >
            <select
              value={s.cookiesBrowser}
              onChange={(e) => set({ cookiesBrowser: e.target.value })}
              className="h-9 rounded-lg border border-line bg-elev px-3 text-[13px] outline-none"
            >
              {BROWSERS.map((b) => (
                <option key={b} value={b}>
                  {b ? b[0].toUpperCase() + b.slice(1) : 'Off'}
                </option>
              ))}
            </select>
          </Row>
          <div>
            <div className="mb-2 text-[14px]">Or a cookies.txt file</div>
            <PathField
              value={s.cookiesFile}
              placeholder="No file"
              onPick={async () => {
                const p = await window.api.settings.pickFile()
                if (p) set({ cookiesFile: p })
              }}
              onClear={() => set({ cookiesFile: '' })}
            />
          </div>
        </Section>
      )}

      {!platform.phone && (
        <Section title="Following" desc="New songs and albums from artists you follow.">
          <Row label="Download new releases automatically">
            <Toggle
              checked={s.autoDownloadFollowed}
              onChange={(autoDownloadFollowed) => set({ autoDownloadFollowed })}
            />
          </Row>
          <Row label="Check for new releases every">
            <Segmented
              value={String(s.followCheckHours)}
              onChange={(v) => set({ followCheckHours: Number(v) })}
              options={['1', '3', '6', '12', '24'].map((h) => ({ id: h, label: `${h}h` }))}
            />
          </Row>
        </Section>
      )}

      <Section title="Appearance & behavior">
        <Row label="Theme">
          <Segmented
            value={s.theme}
            onChange={(theme) => set({ theme })}
            options={[
              { id: 'dark', label: 'Dark' },
              { id: 'light', label: 'Light' },
              { id: 'system', label: 'System' }
            ]}
          />
        </Row>
        {!platform.phone && (
          <Row
            label="Keep running in the tray when closed"
            hint="Music keeps playing; quit from the tray icon."
          >
            <Toggle checked={s.closeToTray} onChange={(closeToTray) => set({ closeToTray })} />
          </Row>
        )}
      </Section>

      <Section
        title="Tools"
        desc="TuneBox keeps yt-dlp updated automatically so downloads keep working when YouTube changes."
      >
        <ToolsPanel />
        <Row
          label="Update yt-dlp automatically"
          hint="Checks once a day, and immediately if a download fails."
        >
          <Toggle
            checked={s.autoUpdateTools}
            onChange={(autoUpdateTools) => set({ autoUpdateTools })}
          />
        </Row>
        {!platform.phone && (
          <details className="text-[13px]">
            <summary className="cursor-pointer text-muted hover:text-fg">
              Advanced: custom tool paths
            </summary>
            <div className="mt-4 flex flex-col gap-4">
              <div>
                <div className="mb-2">yt-dlp executable</div>
                <PathField
                  value={s.ytdlpPath}
                  placeholder="Automatic"
                  onPick={async () => {
                    const p = await window.api.settings.pickFile()
                    if (p) set({ ytdlpPath: p })
                  }}
                  onClear={() => set({ ytdlpPath: '' })}
                />
              </div>
              <div>
                <div className="mb-2">ffmpeg executable</div>
                <PathField
                  value={s.ffmpegPath}
                  placeholder="Automatic"
                  onPick={async () => {
                    const p = await window.api.settings.pickFile()
                    if (p) set({ ffmpegPath: p })
                  }}
                  onClear={() => set({ ffmpegPath: '' })}
                />
              </div>
              <div className="text-xs text-faint">
                Press “Update now” after changing paths to re-detect the tools.
              </div>
            </div>
          </details>
        )}
      </Section>

      <Section title="About">
        <div className="flex flex-wrap items-center gap-3 text-[13px] text-muted">
          <span>TuneBox {info?.version}</span>
          {info && !platform.phone && (
            <>
              <Button
                size="sm"
                variant="ghost"
                icon={<FileText className="h-3.5 w-3.5" />}
                onClick={() => void window.api.app.openPath(info.logsDir)}
              >
                Open logs
              </Button>
              <Button
                size="sm"
                variant="ghost"
                icon={<FolderOpen className="h-3.5 w-3.5" />}
                onClick={() => void window.api.app.openPath(info.userData)}
              >
                Open data folder
              </Button>
            </>
          )}
        </div>
      </Section>
    </Page>
  )
}
