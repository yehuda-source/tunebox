// Automated end-to-end check for CI (the iOS workflow launches the app with -tunebox-selftest):
// search, stream, download with tags and cover, and local playback, through the real app.
// Results go to selftest.json next to the Music folder, where the workflow picks them up.
import type { LibraryTrack, TrackRef } from '@shared/types'
import { Files, NativePlayer, Ytdlp } from './native'
import { paths } from './settings'

interface Step {
  name: string
  ok: boolean
  ms: number
  detail: string
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

async function waitFor<T>(
  what: string,
  timeoutMs: number,
  check: () => Promise<T | null | undefined>
): Promise<T> {
  const until = Date.now() + timeoutMs
  for (;;) {
    const v = await check()
    if (v) return v
    if (Date.now() > until) throw new Error(`Timed out waiting for ${what}`)
    await sleep(1000)
  }
}

export async function runSelfTestIfRequested(): Promise<void> {
  const requested = await Ytdlp.selfTest().then(
    (r) => r.requested,
    () => false
  )
  if (!requested) return

  const { player, fromRef, fromLibrary } = await import('../store/player')
  const { go } = await import('../store/nav')
  const steps: Step[] = []
  const out = `${paths.music.replace(/\/Music$/, '')}/selftest.json`
  const save = (done: boolean): Promise<void> =>
    Files.writeText({ path: out, text: JSON.stringify({ done, steps }, null, 2) })

  async function step(name: string, fn: () => Promise<string>): Promise<boolean> {
    const t = Date.now()
    try {
      const detail = await fn()
      steps.push({ name, ok: true, ms: Date.now() - t, detail })
    } catch (err) {
      steps.push({ name, ok: false, ms: Date.now() - t, detail: String(err) })
    }
    await save(false)
    return steps.at(-1)!.ok
  }

  let song: TrackRef | undefined
  await step('yt-dlp ready', async () => {
    const t = await waitFor('yt-dlp', 60000, async () => {
      const s = await window.api.tools.status()
      return s.ytdlp.version || s.selfTest?.ok === false ? s : null
    })
    if (!t.ytdlp.version) throw new Error(t.selfTest?.message ?? 'yt-dlp did not start')
    return `yt-dlp ${t.ytdlp.version}`
  })
  await step('search (YouTube Music)', async () => {
    go({ name: 'search', q: 'yaakov shwekey' })
    const r = await window.api.search.query('yaakov shwekey')
    song = r.songs.find((s) => (s.durationSec ?? 0) < 300) ?? r.songs[0]
    if (!song) throw new Error('no songs')
    return `${r.songs.length} songs; first: ${song.title} by ${song.artists.join(', ')} (${song.album ?? 'no album'})`
  })
  if (song) {
    const s = song
    await step('stream', async () => {
      player.playOne(fromRef(s))
      const st = await waitFor('playback', 90000, async () => {
        const p = await NativePlayer.getState()
        return p.playing && p.position > 1 ? p : null
      })
      player.toggle()
      return `playing at ${st.position.toFixed(1)}s of ${st.duration.toFixed(0)}s`
    })
    let track: LibraryTrack | undefined
    await step('download with tags', async () => {
      await window.api.downloads.enqueue([s])
      go({ name: 'downloads' })
      const job = await waitFor('the download', 240000, async () => {
        const j = (await window.api.downloads.list()).find((x) => x.track.videoId === s.videoId)
        if (j?.status === 'error') throw new Error(j.error)
        return j?.status === 'done' ? j : null
      })
      track = (await window.api.library.tracks()).find((t) => t.path === job.path)
      if (!track) throw new Error('not in the library')
      const size = (await Files.stat({ path: track.path })).size
      return `${track.path.split('/Music/')[1]} (${(size / 1e6).toFixed(1)} MB, cover: ${track.hasCover})`
    })
    if (track) {
      const t = track
      await step('local playback', async () => {
        go({ name: 'library', tab: 'songs' })
        player.playOne(fromLibrary(t))
        const st = await waitFor('local playback', 30000, async () => {
          const p = await NativePlayer.getState()
          return p.playing && p.position > 1 ? p : null
        })
        return `playing at ${st.position.toFixed(1)}s`
      })
    }
  }
  await save(true)
}
