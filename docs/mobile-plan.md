# TuneBox mobile plan (Android + iOS)

Status: **Android in progress** (started 2026-11-21); iPhone bridge after Android.

Decisions (2026-11-21): both platforms; phone keeps **its own library**; test Android in a local
emulator; build iOS on GitHub Actions (no Mac); **core features first**.

## Progress log

- 2026-11-21: **Android foundation works in the emulator.** Capacitor 8 project (`android/`,
  `capacitor.config.ts`, `vite.mobile.config.ts`, entry `src/renderer/mobile.html` →
  `src/renderer/src/mobile/`). Native plugin `android/app/src/main/java/com/tunebox/app/YtdlpPlugin.java`
  wraps youtubedl-android 0.18.1 (Python + yt-dlp + ffmpeg + **QuickJS**, so YouTube challenges are
  solved). In the app: YouTube Music search 1.3 s; yt-dlp self-updated 2025.11.12 → 2026.10.26 in 3 s;
  full song download (4.58 MB, 4:43 AAC 128k) in 20 s. YouTube Music code moved to
  `src/shared/ytmusic.ts` (desktop wires logger + yt-dlp fallback in `src/main/youtube/search.ts`).
- 2026-11-21: **Android core done** and checked in the emulator: phone layout (bottom tabs, mini
  player, full-screen player, queue sheet, back button), library in a JSON file (no SQLite needed),
  download queue (tags + cover via the bundled ffmpeg, album downloads, retries, alternative
  uploads), playlists, streaming, podcasts/channels pages, and native Media3 playback: lock screen,
  notification, headset, screen off, auto-advance in the background. Release APKs per CPU type
  (54–63 MB) and a GitHub Actions job.
- Known limits: starting a stream that isn't downloaded takes ~12 s on the emulator (yt-dlp
  queries several YouTube clients and solves their JS challenges in QuickJS; no single client
  works alone any more). The next track in a queue is resolved ahead of time. Downloads run while
  the app is open or playing; there's no separate background-download service yet.
- Later on Android: follows with auto-download, Spotify import, a download foreground service.
- Tooling: SDK in ~/Android/Sdk, AVD "tunebox" (Pixel 8, Android 16). Start with
  `scripts/android-emulator.sh` (guest GPU, Vulkan off: the default renderer segfaults). Inspect the
  app's WebView: `adb forward tcp:9230 localabstract:webview_devtools_remote_$(adb shell pidof com.tunebox.app)`
  then `node scripts/cdp.mjs 9230 eval "..."`.

## Feasibility test results (2026-11-21), read this first

Tested on desktop with the same libraries a phone app would use:

- youtubei.js resolves audio links fine (itag 140 AAC) with a plain `new Function` evaluator, via
  the `IOS` and `MWEB` clients (`WEB`, `ANDROID`, `TV` failed).
- **YouTube serves only the first 1 MiB of these links.** Every request past byte 1,048,575 gets
  HTTP 403, whatever the User-Agent or chunk size. That's about one minute of audio, for streaming
  *and* downloading.
- A PO token minted with bgutils-js (BotGuard in jsdom, 0.6 s, ~12 h TTL) and appended as `pot=`
  did **not** lift the limit (IOS, MWEB, YTMUSIC clients all still 403 past 1 MiB).
- So the iOS plan's core assumption (youtubei.js + direct download, no yt-dlp) **doesn't work
  today**. Making PO tokens accepted is an ongoing arms race (it's what yt-dlp and its bgutil
  plugins maintain).
- Desktop TuneBox is unaffected: yt-dlp handles all of this.

Options this leaves:
1. **Android with real yt-dlp** (youtubedl-android, as Seal/YTDLnis do). Most likely to work;
   needs a check that its yt-dlp can solve YouTube's JS challenges on Android.
2. **iPhone through the PC:** the phone app asks the desktop TuneBox (which runs yt-dlp) to resolve
   streams and fetch files, over Wi-Fi or a VPN like Tailscale; downloaded songs live on the phone.
3. **iPhone standalone with embedded Python + yt-dlp:** possible in principle (a-Shell runs yt-dlp
   on iOS) but needs a custom JavaScriptCore challenge solver; high risk, weeks of work.

## Goal

TuneBox on the phone: search YouTube Music, stream, download songs with tags and cover art,
keep a library and playlists, play in the background with lock-screen controls. Ideally it keeps
working when YouTube changes things, without having to reinstall the app.

## Distribution

- **Android:** an APK you install yourself. Google Play rejects apps that download from YouTube.
- **iOS:** an IPA signed with **Signulous** (1-year certificate). The App Store would reject it, so
  sideloading is the only route.
- Building an iOS app needs **macOS + Xcode**. Without a Mac, build the IPA on a GitHub Actions
  `macos-latest` runner, then sign it with Signulous. This needs the repo on GitHub first
  (`gh auth login`, `gh repo create tunebox --private --source=. --push`). macOS runner minutes are
  limited on private repos.

## Shared approach

- **Capacitor** wraps the existing React UI (`src/renderer`) into native Android and iOS apps.
- The UI talks to `window.api` (`src/shared/types.ts` → `TuneboxApi`). On mobile, a new
  implementation of that same interface replaces the Electron main process, so the views, stores
  and player logic are reused. The browser-preview mock (`src/renderer/src/mock/api.ts`) shows the
  pattern.
- Needs a phone-sized layout: bottom tab bar instead of the sidebar, a compact player bar with a
  full-screen "now playing" view, and touch-friendly lists.
- **Search, album and artist pages:** youtubei.js runs on the phone. It needs native HTTP
  (Capacitor HTTP plugin) because the web view blocks cross-site requests.
- **Playback:** a native audio plugin (AVPlayer on iOS, ExoPlayer/Media3 on Android). The web
  `<audio>` element stops when the app is in the background. Lock-screen and headphone controls
  come from the native media session.
- **Downloads:** native background downloads (iOS URLSession background transfers, Android
  WorkManager/DownloadManager), so a whole discography can download with the screen off.
- **Library:** SQLite through a Capacitor SQLite plugin, using the same schema as
  `src/main/library/db.ts`. Reuse the duplicate-song matching (`src/shared/songKey.ts`), the
  follow logic (`src/main/follow-filter.ts`) and the file naming (`src/main/library/organizer.ts`).

## Android specifics

- **Real yt-dlp** via `youtubedl-android` (the library Seal uses: embedded Python + yt-dlp + ffmpeg).
- **Self-updating:** `youtubedl-android` can download a newer yt-dlp into app storage. Port the
  desktop policy from `src/main/binaries/manager.ts`: check daily, and update immediately when a
  download fails with a typical "outdated" error (`OUTDATED_PATTERN`).
- MP3, M4A and Opus all available, with the same quality settings as desktop.
- Effort: moderate, because yt-dlp and ffmpeg come ready-made.

## iOS specifics

- **yt-dlp can't run on iOS** (no separate programs allowed). Instead, youtubei.js resolves the
  audio stream URL, and the app downloads it natively.
- **No ffmpeg needed:** download YouTube's M4A/AAC stream (itag 140), which iOS plays natively.
  Write title/artist/album/track/cover with a small MP4 tag writer. M4A only on iOS.
- **Updating without re-signing ("live updates"):** the YouTube-facing code (youtubei.js + our
  extraction code) lives in the JavaScript bundle. On launch the app checks GitHub Releases for a
  newer bundle, downloads it and switches to it on the next start (self-hosted, no paid service).
  This is allowed for sideloaded apps. Only native-code changes (audio player, background
  downloads) need a new IPA and a Signulous re-sign. Keep the previous bundle and roll back if the
  new one fails to start.
- **Alternative if youtubei.js proves unreliable:** embed Python (officially supported on iOS since
  3.13) and run real yt-dlp, downloading its pure-Python update file from GitHub. The catch:
  yt-dlp needs a JavaScript engine for YouTube's challenges, and iOS can't start one as a separate
  process, so this would need a custom yt-dlp challenge provider that calls JavaScriptCore. It also
  adds about 50 MB. Only pursue this if the live-update approach isn't enough.

## Safety net: the PC as a fallback (both platforms)

When the phone is on the same Wi-Fi as the PC running TuneBox and a download fails, hand the job
to the PC (which always has the latest yt-dlp) and sync the finished file back. Needs a small
local HTTP API in the desktop app, plus pairing (QR code in Settings). The same API could later
serve a browser-based "phone companion" that controls the PC's library.

## Open questions (answer before starting)

1. Is a Mac available, or should the iOS app be built on GitHub Actions?
2. iPhone only, or Android as well?
3. Should the phone keep **its own library** (works anywhere, offline; simpler) or **sync with the
   PC's library** (nicer, more work)?

## Rough effort

- First usable version (search, stream, download with tags, library, playlists, background playback):
  about 1–2 weeks.
- Then: followed artists, polished phone layout, the PC fallback and pairing.
- Android comes mostly for free from the same Capacitor project once iOS works, or the other way round.

## Suggested order

1. Push the repo to GitHub and add CI for Android (APK) and iOS (unsigned IPA).
2. Capacitor shell plus the mobile `window.api` with search and streaming. Phone layout.
3. Native audio plugin (background playback, lock screen).
4. Downloads: Android via youtubedl-android; iOS via youtubei.js + native background download + M4A tagging.
5. Library and playlists in SQLite; duplicate matching; follows.
6. Live-update channel on GitHub Releases (iOS), yt-dlp self-update (Android).
7. PC fallback and pairing.
