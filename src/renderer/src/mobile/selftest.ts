// Automated end-to-end check for CI (the iOS workflow launches the app with -tunebox-selftest).
// It goes through the real app: start yt-dlp, search YouTube Music, solve a YouTube challenge in
// JavaScriptCore, stream, download with tags and cover, and play the download.
// YouTube often blocks data-center servers like CI runners ("confirm you're not a bot"); then the
// YouTube steps are reported as blocked and the same native pieces (yt-dlp download, tags, cover,
// file and HLS playback) are checked with non-YouTube media instead.
// Results go to Documents/selftest.json, where the workflow picks them up.
import type { LibraryTrack, TrackRef } from '@shared/types'
import { Files, NativePlayer, Ytdlp } from './native'
import { paths } from './settings'
import { fileUrl } from './library'
import { resolveStream, ytdlp } from './ytdlp'

interface Step {
  name: string
  ok: boolean
  ms: number
  detail: string
  blocked?: boolean
}

const BLOCKED = /not a bot|Sign in to confirm|only allows this upload when signed in/i
const TEST_AUDIO = 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3'
const TEST_HLS = 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8'

class Blocked extends Error {}

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

async function waitForPlayback(what: string, timeoutMs: number): Promise<string> {
  const st = await waitFor(what, timeoutMs, async () => {
    const p = await NativePlayer.getState()
    return p.playing && p.position > 1 ? p : null
  })
  return `playing at ${st.position.toFixed(1)}s of ${st.duration.toFixed(0)}s`
}

export async function runSelfTestIfRequested(): Promise<void> {
  const request = await Ytdlp.selfTest().catch(() => null)
  if (!request?.requested) return
  console.log('TuneBox self-test: starting')

  const { player, fromRef, fromLibrary } = await import('../store/player')
  const { go } = await import('../store/nav')
  const steps: Step[] = []
  const save = (done: boolean): Promise<void> =>
    Files.writeText({ path: request.results, text: JSON.stringify({ done, steps }, null, 2) })

  /** Runs a check; true when it passed (a YouTube block counts as reported, not passed). */
  async function step(name: string, fn: () => Promise<string>): Promise<boolean> {
    const t = Date.now()
    let entry: Step
    try {
      entry = { name, ok: true, ms: Date.now() - t, detail: await fn() }
      entry.ms = Date.now() - t
    } catch (err) {
      const blocked = err instanceof Blocked
      entry = { name, ok: blocked, blocked, ms: Date.now() - t, detail: String(err) }
    }
    steps.push(entry)
    console.log(`TuneBox self-test: ${JSON.stringify(entry)}`)
    await save(false)
    return entry.ok && !entry.blocked
  }
  /** YouTube refusing this server is reported, not counted as an app failure. */
  const youtube = (err: unknown): never => {
    const msg = err instanceof Error ? err.message : String(err)
    throw BLOCKED.test(msg) ? new Blocked(`YouTube blocked this server: ${msg.slice(0, 160)}`) : err
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
  await step('challenge solver (JavaScriptCore)', async () => {
    const r = await Ytdlp.jscCheck()
    return `player ${r.player}: ${r.input} → ${r.output} in ${r.seconds}s`
  })

  let youtubeWorks = false
  if (song) {
    const s = song
    youtubeWorks = await step('stream (YouTube)', async () => {
      await resolveStream(s.videoId).catch(youtube)
      player.playOne(fromRef(s))
      const result = await waitForPlayback('playback', 60000)
      player.toggle()
      return result
    })
  }
  if (song && youtubeWorks) {
    const s = song
    let track: LibraryTrack | undefined
    await step('download with tags (YouTube)', async () => {
      await window.api.downloads.enqueue([s])
      go({ name: 'downloads' })
      const job = await waitFor('the download', 240000, async () => {
        const j = (await window.api.downloads.list()).find((x) => x.track.videoId === s.videoId)
        if (j?.status === 'error') youtube(new Error(j.error))
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
        return waitForPlayback('local playback', 30000)
      })
    }
  } else {
    // The same native pieces with media YouTube can't block.
    const dir = `${paths.work}/selftest`
    let file = ''
    await step('download with yt-dlp (test file)', async () => {
      await Files.remove({ path: dir })
      await ytdlp(['--no-playlist', '-o', `${dir}/test.%(ext)s`, TEST_AUDIO])
      const { names } = await Files.list({ path: dir })
      const name = names.find((n) => n.startsWith('test.'))
      if (!name) throw new Error(`no file in ${names.join(', ')}`)
      file = `${dir}/${name}`
      return `${name}, ${((await Files.stat({ path: file })).size / 1e6).toFixed(1)} MB`
    })
    if (file) {
      await step('cover and tags', async () => {
        const cover = `${dir}/cover.jpg`
        await Files.squareCover({
          url: 'https://i.ytimg.com/vi/IluRBvnYMoY/hqdefault.jpg',
          path: cover
        })
        await Ytdlp.tag({
          path: file,
          tags: { title: 'Self-test', artist: 'TuneBox', album: 'CI', trackNumber: 1 },
          cover
        })
        const size = (await Files.stat({ path: file })).size
        return `tagged with cover (${(size / 1e6).toFixed(2)} MB)`
      })
      await step('local playback (test file)', async () => {
        await NativePlayer.load({ url: fileUrl(file), title: 'Self-test', autoplay: true })
        return waitForPlayback('local playback', 30000)
      })
    }
    await step('stream playback (HLS test)', async () => {
      await NativePlayer.load({ url: TEST_HLS, title: 'HLS test', autoplay: true })
      const result = await waitForPlayback('HLS playback', 60000)
      await NativePlayer.pause()
      return result
    })
  }
  go({ name: 'home' })
  await save(true)
}
