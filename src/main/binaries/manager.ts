import { app, net } from 'electron'
import {
  existsSync,
  mkdirSync,
  chmodSync,
  renameSync,
  copyFileSync,
  readFileSync,
  writeFileSync,
  rmSync
} from 'fs'
import { writeFile } from 'fs/promises'
import { join, dirname, delimiter } from 'path'
import type { ToolInfo, ToolStatus } from '../../shared/types'
import { getSettings } from '../settings'
import { run, ProcError } from '../proc'
import { emit } from '../events'
import { friendlyError } from '../../shared/errors'
import log from '../log'

const isWin = process.platform === 'win32'
const exe = (name: string): string => (isWin ? `${name}.exe` : name)
const YTDLP_ASSET = isWin
  ? 'yt-dlp.exe'
  : process.platform === 'darwin'
    ? 'yt-dlp_macos'
    : 'yt-dlp_linux'
// "Me at the zoo", YouTube's first upload: short, always available, and what yt-dlp's own tests use.
const TEST_VIDEO = 'https://www.youtube.com/watch?v=jNQXAC9IVRw'
const DAY = 24 * 60 * 60 * 1000

const managedDir = (): string => join(app.getPath('userData'), 'bin')
const stateFile = (): string => join(managedDir(), 'state.json')

/** Binaries shipped inside the app (resources/bin/<platform> in dev, <resources>/bin when packaged). */
function bundledDir(): string {
  if (app.isPackaged) return join(process.resourcesPath, 'bin')
  return join(app.getAppPath(), 'resources', 'bin', isWin ? 'win' : 'linux')
}

function which(name: string): string | null {
  for (const dir of (process.env.PATH ?? '').split(delimiter)) {
    if (!dir) continue
    const p = join(dir, exe(name))
    if (existsSync(p)) return p
  }
  return null
}

interface State {
  lastUpdateCheck: number | null
  latestYtdlp: string | null
  jsMode: 'electron' | 'system'
  lastForcedUpdate: number | null
}

let state: State = {
  lastUpdateCheck: null,
  latestYtdlp: null,
  jsMode: 'electron',
  lastForcedUpdate: null
}
let status: ToolStatus = {
  ytdlp: { path: null, version: null, source: 'missing' },
  ffmpeg: { path: null, version: null, source: 'missing' },
  jsRuntime: { mode: 'electron', detail: '' },
  selfTest: null,
  busy: null,
  lastUpdateCheck: null,
  latestYtdlp: null
}

function loadState(): void {
  try {
    if (existsSync(stateFile()))
      state = { ...state, ...JSON.parse(readFileSync(stateFile(), 'utf8')) }
  } catch {
    /* ignore corrupt state */
  }
}

function saveState(): void {
  mkdirSync(managedDir(), { recursive: true })
  writeFileSync(stateFile(), JSON.stringify(state, null, 2))
}

function publish(patch: Partial<ToolStatus> = {}): ToolStatus {
  status = {
    ...status,
    ...patch,
    lastUpdateCheck: state.lastUpdateCheck,
    latestYtdlp: state.latestYtdlp,
    jsRuntime: {
      mode: state.jsMode,
      detail:
        state.jsMode === 'electron'
          ? `Built-in (Node ${process.versions.node} via Electron)`
          : 'System deno/node from PATH'
    }
  }
  emit('tools:status', status)
  return status
}

export const getToolStatus = (): ToolStatus => status

// ---------- resolution ----------

function resolveYtdlp(): ToolInfo {
  const s = getSettings()
  if (s.ytdlpPath && existsSync(s.ytdlpPath))
    return { path: s.ytdlpPath, version: null, source: 'custom' }
  const managed = join(managedDir(), exe('yt-dlp'))
  if (existsSync(managed)) return { path: managed, version: null, source: 'managed' }
  const bundled = join(bundledDir(), exe('yt-dlp'))
  if (existsSync(bundled)) return { path: bundled, version: null, source: 'bundled' }
  const sys = which('yt-dlp')
  if (sys) return { path: sys, version: null, source: 'system' }
  return { path: null, version: null, source: 'missing' }
}

function resolveFfmpeg(): ToolInfo {
  const s = getSettings()
  if (s.ffmpegPath && existsSync(s.ffmpegPath))
    return { path: s.ffmpegPath, version: null, source: 'custom' }
  const bundled = join(bundledDir(), exe('ffmpeg'))
  if (existsSync(bundled)) return { path: bundled, version: null, source: 'bundled' }
  const sys = which('ffmpeg')
  if (sys) return { path: sys, version: null, source: 'system' }
  return { path: null, version: null, source: 'missing' }
}

async function version(
  path: string | null,
  args: string[],
  pick: (out: string) => string
): Promise<string | null> {
  if (!path) return null
  try {
    const r = await run(path, args, { timeoutMs: 20000 })
    return pick(r.stdout).trim() || null
  } catch (err) {
    log.warn(`Could not get version of ${path}`, err)
    return null
  }
}

export async function refresh(): Promise<void> {
  const yt = resolveYtdlp()
  const ff = resolveFfmpeg()
  yt.version = await version(yt.path, ['--version'], (o) => o.split('\n')[0])
  ff.version = await version(
    ff.path,
    ['-version'],
    (o) => o.match(/ffmpeg version (\S+)/)?.[1] ?? ''
  )
  publish({ ytdlp: yt, ffmpeg: ff })
}

export function ffmpegPath(): string {
  const p = status.ffmpeg.path ?? resolveFfmpeg().path
  if (!p) throw new Error('ffmpeg was not found. Set its location in Settings → Tools.')
  return p
}

// ---------- yt-dlp invocation ----------

/** Arguments every yt-dlp call needs: JS runtime, ffmpeg and cookies. */
export function ytdlpCommand(args: string[]): {
  cmd: string
  args: string[]
  env: NodeJS.ProcessEnv
} {
  const yt = status.ytdlp.path ?? resolveYtdlp().path
  if (!yt)
    throw new Error('yt-dlp is not installed yet. Open Settings → Tools and press "Update now".')
  const s = getSettings()
  const env: NodeJS.ProcessEnv = { ...process.env }
  const base: string[] = ['--no-config', '--encoding', 'utf-8']
  if (state.jsMode === 'electron') {
    // The Electron binary acts as Node when ELECTRON_RUN_AS_NODE is set.
    base.push('--no-js-runtimes', '--js-runtimes', `node:${process.execPath}`)
    env.ELECTRON_RUN_AS_NODE = '1'
  } else {
    base.push('--js-runtimes', 'node')
  }
  const ff = status.ffmpeg.path ?? resolveFfmpeg().path
  if (ff) base.push('--ffmpeg-location', dirname(ff))
  if (s.cookiesFile && existsSync(s.cookiesFile)) base.push('--cookies', s.cookiesFile)
  else if (s.cookiesBrowser) base.push('--cookies-from-browser', s.cookiesBrowser)
  env.PYTHONIOENCODING = 'utf-8'
  return { cmd: yt, args: [...base, ...args], env }
}

// ---------- updating ----------

async function download(url: string, dest: string): Promise<void> {
  const res = await net.fetch(url, { headers: { 'User-Agent': 'TuneBox' } })
  if (!res.ok) throw new Error(`Download failed: HTTP ${res.status} for ${url}`)
  await writeFile(dest, Buffer.from(await res.arrayBuffer()))
}

async function latestYtdlpTag(): Promise<string> {
  const res = await net.fetch('https://api.github.com/repos/yt-dlp/yt-dlp/releases/latest', {
    headers: { 'User-Agent': 'TuneBox', Accept: 'application/vnd.github+json' }
  })
  if (!res.ok) throw new Error(`GitHub returned HTTP ${res.status}`)
  const json = (await res.json()) as { tag_name: string }
  return json.tag_name
}

async function installManagedYtdlp(): Promise<void> {
  mkdirSync(managedDir(), { recursive: true })
  const target = join(managedDir(), exe('yt-dlp'))
  const tmp = `${target}.download`
  await download(`https://github.com/yt-dlp/yt-dlp/releases/latest/download/${YTDLP_ASSET}`, tmp)
  if (!isWin) chmodSync(tmp, 0o755)
  const r = await run(tmp, ['--version'], { timeoutMs: 30000 })
  log.info(`Downloaded yt-dlp ${r.stdout.trim()}`)
  renameSync(tmp, target)
}

/** Download yt-dlp if it is missing or outdated. `force` skips the 24h throttle. */
export async function updateTools(force = false): Promise<ToolStatus> {
  if (status.busy) return status
  const s = getSettings()
  publish({ busy: 'Checking for yt-dlp updates…' })
  try {
    const current = resolveYtdlp()
    if (current.source === 'custom') return status
    const managedExists = current.source === 'managed'
    const due = !state.lastUpdateCheck || Date.now() - state.lastUpdateCheck > DAY
    if (managedExists && !force && (!s.autoUpdateTools || !due)) return status

    try {
      const tag = await latestYtdlpTag()
      state.latestYtdlp = tag
      state.lastUpdateCheck = Date.now()
      saveState()
      const installed = managedExists
        ? await version(current.path, ['--version'], (o) => o.split('\n')[0])
        : null
      if (installed !== tag) {
        publish({ busy: `Downloading yt-dlp ${tag}…` })
        await installManagedYtdlp()
      }
    } catch (err) {
      log.warn('yt-dlp update failed', err)
      // Offline on first run: seed the managed copy from the bundled binary so it can update later.
      const bundled = join(bundledDir(), exe('yt-dlp'))
      if (!managedExists && existsSync(bundled)) {
        mkdirSync(managedDir(), { recursive: true })
        copyFileSync(bundled, join(managedDir(), exe('yt-dlp')))
        if (!isWin) chmodSync(join(managedDir(), exe('yt-dlp')), 0o755)
      }
    }
  } finally {
    await refresh()
    publish({ busy: null })
  }
  return status
}

/** Called when a download fails in a way that usually means yt-dlp is outdated. */
export async function forceUpdateIfStale(): Promise<boolean> {
  if (state.lastForcedUpdate && Date.now() - state.lastForcedUpdate < 60 * 60 * 1000) return false
  state.lastForcedUpdate = Date.now()
  saveState()
  const before = status.ytdlp.version
  await updateTools(true)
  return status.ytdlp.version !== before
}

export { OUTDATED_PATTERN } from '../../shared/errors'

// ---------- self test ----------

async function tryMode(mode: State['jsMode']): Promise<string> {
  state.jsMode = mode
  const { cmd, args, env } = ytdlpCommand([
    '--simulate',
    '--no-playlist',
    '-f',
    'bestaudio',
    '--print',
    'id',
    TEST_VIDEO
  ])
  const r = await run(cmd, args, { env, timeoutMs: 90000 })
  return r.stdout.trim()
}

export async function selfTest(): Promise<ToolStatus> {
  if (status.busy) return status
  publish({ busy: 'Testing YouTube access…' })
  const previous = state.jsMode
  let result: ToolStatus['selfTest']
  try {
    await tryMode('electron')
    result = {
      ok: true,
      message: 'yt-dlp can reach YouTube and solve its JS challenges.',
      at: Date.now()
    }
  } catch (err) {
    log.warn('Self-test with built-in runtime failed', err)
    try {
      await tryMode('system')
      result = { ok: true, message: 'Working, using a system JS runtime.', at: Date.now() }
    } catch (err2) {
      state.jsMode = previous
      const msg = err2 instanceof ProcError ? err2.message : String(err2)
      result = {
        ok: false,
        message: friendlyError(msg || 'yt-dlp could not reach YouTube.'),
        at: Date.now()
      }
    }
  }
  saveState()
  return publish({ selfTest: result, busy: null })
}

export async function initTools(): Promise<void> {
  loadState()
  rmSync(join(managedDir(), `${exe('yt-dlp')}.download`), { force: true })
  await refresh()
  await updateTools(false)
  if (!status.selfTest) void selfTest()
}
