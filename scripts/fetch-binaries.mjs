// Downloads the fallback binaries that get bundled into the app:
//   resources/bin/<platform>/{yt-dlp, ffmpeg, ffprobe}
// yt-dlp keeps itself up to date at runtime; this copy is only used when offline on first launch.
// Usage: node scripts/fetch-binaries.mjs [linux|win] [--force]
import { existsSync, mkdirSync, writeFileSync, chmodSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const platform = process.argv[2] ?? (process.platform === 'win32' ? 'win' : 'linux')
const force = process.argv.includes('--force')
const FFMPEG_RELEASE = 'https://github.com/eugeneware/ffmpeg-static/releases/download/b6.1.1'

const targets = {
  linux: [
    ['yt-dlp', 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux', false],
    ['ffmpeg', `${FFMPEG_RELEASE}/ffmpeg-linux-x64.gz`, true],
    ['ffprobe', `${FFMPEG_RELEASE}/ffprobe-linux-x64.gz`, true]
  ],
  win: [
    ['yt-dlp.exe', 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe', false],
    ['ffmpeg.exe', `${FFMPEG_RELEASE}/ffmpeg-win32-x64.gz`, true],
    ['ffprobe.exe', `${FFMPEG_RELEASE}/ffprobe-win32-x64.gz`, true]
  ]
}[platform]

if (!targets) {
  console.error(`Unknown platform "${platform}" (use linux or win)`)
  process.exit(1)
}

const dir = join(root, 'resources', 'bin', platform)
mkdirSync(dir, { recursive: true })

for (const [name, url, gz] of targets) {
  const dest = join(dir, name)
  if (existsSync(dest) && !force) {
    console.log(`✓ ${platform}/${name} (cached)`)
    continue
  }
  process.stdout.write(`↓ ${platform}/${name} … `)
  const res = await fetch(url, { redirect: 'follow' })
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`)
  let data = Buffer.from(await res.arrayBuffer())
  if (gz) data = gunzipSync(data)
  writeFileSync(dest, data)
  if (platform !== 'win') chmodSync(dest, 0o755)
  console.log(`${(data.length / 1048576).toFixed(1)} MB`)
}
