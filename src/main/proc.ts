import { spawn, type ChildProcess } from 'child_process'

export interface RunOptions {
  env?: NodeJS.ProcessEnv
  signal?: AbortSignal
  timeoutMs?: number
  onLine?: (line: string, stream: 'stdout' | 'stderr') => void
}

export interface RunResult {
  code: number | null
  stdout: string
  stderr: string
}

export class ProcError extends Error {
  constructor(
    message: string,
    public result: RunResult
  ) {
    super(message)
  }
}

export class AbortedError extends Error {
  constructor() {
    super('Canceled')
  }
}

export function killTree(child: ChildProcess): void {
  if (child.exitCode !== null || !child.pid) return
  if (process.platform === 'win32') {
    spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true })
  } else {
    // Children run in their own process group so helpers (yt-dlp → ffmpeg) die with them.
    const group = (sig: NodeJS.Signals): void => {
      try {
        process.kill(-child.pid!, sig)
      } catch {
        child.kill(sig)
      }
    }
    group('SIGTERM')
    setTimeout(() => child.exitCode === null && group('SIGKILL'), 3000).unref()
  }
}

/** Spawn a program with an argument array (never through a shell). */
export function run(cmd: string, args: string[], opts: RunOptions = {}): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    if (opts.signal?.aborted) return reject(new AbortedError())
    const child = spawn(cmd, args, {
      env: opts.env ?? process.env,
      windowsHide: true,
      detached: process.platform !== 'win32'
    })
    let stdout = ''
    let stderr = ''
    let aborted = false
    const partial = { stdout: '', stderr: '' }

    const feed = (stream: 'stdout' | 'stderr', chunk: Buffer): void => {
      const text = chunk.toString('utf8')
      if (stream === 'stdout') stdout += text
      else stderr += text
      if (!opts.onLine) return
      const lines = (partial[stream] + text).split(/\r?\n|\r/)
      partial[stream] = lines.pop() ?? ''
      for (const l of lines) if (l) opts.onLine(l, stream)
    }
    child.stdout.on('data', (c: Buffer) => feed('stdout', c))
    child.stderr.on('data', (c: Buffer) => feed('stderr', c))

    const onAbort = (): void => {
      aborted = true
      killTree(child)
    }
    opts.signal?.addEventListener('abort', onAbort, { once: true })
    const timer = opts.timeoutMs
      ? setTimeout(() => {
          stderr += `\nTimed out after ${opts.timeoutMs}ms`
          killTree(child)
        }, opts.timeoutMs)
      : null

    child.on('error', (err) => {
      if (timer) clearTimeout(timer)
      opts.signal?.removeEventListener('abort', onAbort)
      reject(err)
    })
    child.on('close', (code) => {
      if (timer) clearTimeout(timer)
      opts.signal?.removeEventListener('abort', onAbort)
      if (opts.onLine) {
        if (partial.stdout) opts.onLine(partial.stdout, 'stdout')
        if (partial.stderr) opts.onLine(partial.stderr, 'stderr')
      }
      if (aborted) return reject(new AbortedError())
      const result = { code, stdout, stderr }
      if (code === 0) resolve(result)
      else reject(new ProcError(lastErrorLine(stderr) || `Exited with code ${code}`, result))
    })
  })
}

export function lastErrorLine(stderr: string): string {
  const lines = stderr.split(/\r?\n/).filter((l) => l.trim())
  const err = [...lines].reverse().find((l) => /error/i.test(l))
  return (err ?? lines.at(-1) ?? '').replace(/^ERROR:\s*/, '').trim()
}
