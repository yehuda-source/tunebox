# TuneBox

Search YouTube Music, play anything instantly, and download it into a tagged local library.
Runs on Windows and Linux as a self-contained app (`.exe` / `.AppImage`); no browser or system tools needed.
There are also phone apps for Android (`.apk`) and iPhone (`.ipa`, sideloaded), each with its own library.

Built with Electron + React (renderer) and Node (main process).

## Features

- **Search** YouTube Music: songs, albums, artists, videos, with suggestions. Paste any YouTube / YouTube Music link to download a song, album or playlist.
- **Stream before downloading**: play any result immediately, with seeking.
- **Download** single songs, whole albums or an artist's discography as MP3 320, M4A or Opus. Files are tagged (title, artist, album, track number, year, square cover art) and filed as `Artist/Album/NN - Title.ext`.
- **Download queue**: concurrent, retries automatically, cancel/retry per item, survives restarts.
- **Podcasts and channels**: find podcasts and YouTube channels in search, browse their episodes
  (newest first), play or download them (saved under `Podcasts/<show>/<date> - <title>`), and **Follow**
  them to download new episodes automatically.
- **Library**: scans and watches your folders, songs/albums/artists views, tag editing, playlists (export `.m3u8`).
- **Player**: queue with drag-to-reorder, shuffle/repeat, media keys and OS media controls, remembers where you left off.
- **Spotify import**: paste a playlist, album or song link (or pick from your playlists and Liked Songs),
  review how each song matched on YouTube Music, and download them with Spotify's tags, optionally into a
  TuneBox playlist in the same order. Needs a free Spotify developer app (the Spotify import page walks
  you through it). Audio always comes from YouTube; Spotify only provides the song list and tags.
- Command palette (Ctrl+K), dark/light theme, tray mode.

## Staying working when YouTube changes

- yt-dlp lives in the app's data folder and updates itself: checked daily, and immediately when a download fails with a typical "outdated" error. A copy is bundled for offline first runs.
- yt-dlp needs a JavaScript runtime for YouTube. TuneBox points it at its own Electron binary (`ELECTRON_RUN_AS_NODE`), so nothing extra is installed. If that fails, it falls back to a system deno/node.
- ffmpeg/ffprobe are bundled.
- Settings → Tools shows tool versions and a live YouTube self-test, with **Update now** and **Run test** buttons.
- For age-restricted songs, add cookies (from a browser or a `cookies.txt`) in Settings.

## Development

```bash
npm install
npm run fetch-binaries   # downloads yt-dlp/ffmpeg for this OS into resources/bin
npm run dev
```

Checks: `npm run typecheck`, `npm run lint`, `npm test`.

## Testing the UI without Electron

`npm run preview:web` serves the real React UI in a normal browser with a fake backend
(`src/renderer/src/mock`), at <http://localhost:5199/preview.html>. Pick a situation with `?scenario=`:

| scenario | what it shows |
| --- | --- |
| `default` | 300 songs (Hebrew/English, long names, missing albums/covers), downloads in every state, playlists, a followed artist |
| `empty` | brand-new library, nothing downloaded |
| `firstrun` | the welcome screen |
| `broken` | yt-dlp missing and the YouTube self-test failing |
| `errors` | every YouTube request fails (offline) |
| `slow` | 2.5 s latency, for loading states |
| `huge` | 5,000 songs, for performance |
| `notrash` | the music drive has no trash folder |
| `spotify-setup` / `spotify-signin` | Spotify import before setup / before sign-in |

Add `&theme=light` for the light theme.

To drive the real app (with real YouTube), start it with `npx electron-vite dev -w --remoteDebuggingPort 9333`
and use `node scripts/cdp.mjs 9333 eval "<js>"` or `node scripts/cdp.mjs 9333 shot out.png`. The same fake backend drives the UI tests in `test/ui`
(Vitest + Testing Library in jsdom), which run as part of `npm test`.

## Building

```bash
npm run build:linux   # dist/TuneBox-<version>-x86_64.AppImage
npm run build:win     # dist/TuneBox-<version>-setup.exe and -portable.exe
```

Each build script downloads the right binaries for the target first.

### Android

The phone app is the same React UI in a [Capacitor](https://capacitorjs.com) shell
(`android/`, entry `src/renderer/mobile.html`). Its backend (`src/renderer/src/mobile`) implements
the same `window.api` on top of native plugins in `android/app/src/main/java/com/tunebox/app`:
yt-dlp with Python, QuickJS and ffmpeg ([youtubedl-android](https://github.com/JunkFood02/youtubedl-android)),
file operations, and a Media3 player for background playback with lock-screen controls.
yt-dlp updates itself on the phone, so the app keeps working without reinstalling.

Needs the Android SDK and JDK 21. With the SDK in `~/Android/Sdk`:

```bash
npm run android:apk        # debug APK for every CPU type (android/app/build/outputs/apk/debug)
npm run android:release    # one APK per CPU type (…/apk/release)
scripts/android-emulator.sh   # start the "tunebox" emulator
scripts/android-run.sh        # build, install, start; DevTools on localhost:9230
```

Release APKs are signed with the keystore in `TUNEBOX_KEYSTORE` (password in
`TUNEBOX_KEYSTORE_PASSWORD`); without it they use the debug key. In GitHub Actions the keystore
comes from the `ANDROID_KEYSTORE_BASE64` and `ANDROID_KEYSTORE_PASSWORD` secrets.

`npx electron scripts/phone-shot.mjs out.png` screenshots the browser preview at phone size
(open it with `?phone` to get the phone layout in a normal browser).

### iPhone

Same UI and phone backend as Android; the native side is in `ios/App/App/Native`. iOS doesn't
let apps start other programs, so yt-dlp runs inside the app in embedded Python
([Python-Apple-support](https://github.com/beeware/Python-Apple-support)), driven by
`ios/App/python-app/tunebox_bridge.py`. YouTube's JavaScript challenges are solved by
JavaScriptCore through a yt-dlp challenge provider registered by the bridge; the solver scripts
come with yt-dlp, so yt-dlp updates downloaded at runtime keep everything current. Tags are
written with mutagen (there's no ffmpeg on iOS, so songs stay in YouTube's AAC as `.m4a`), and
streams play as HLS in AVPlayer.

Building needs a Mac, so it runs on GitHub Actions (`.github/workflows/ios.yml`): a simulator
build with an end-to-end self-test (screenshots and results under the run's Artifacts) and an
unsigned `.ipa` to sign with Signulous. YouTube usually blocks GitHub's servers, so the self-test
then checks the same pieces with non-YouTube media. Locally, `scripts/ios-prepare.sh` fetches
Python, yt-dlp, mutagen and certifi, and `scripts/ios-configure-project.py` (re)applies the Xcode
project setup. The Python bridge can be tested on Linux with Node standing in for JavaScriptCore.

### Releases

Bump the version, then push a matching tag. GitHub Actions builds Windows (installer + portable
`.exe`), Linux (`.AppImage`), Android (`.apk` per CPU type) and iPhone (unsigned `.ipa`) and publishes them as a GitHub Release:

```bash
npm version 1.2.3 && git push && git push --tags
```

The release is refused if the tag doesn't match `package.json`.

Without Wine, `npm run build:win:zip` still makes a portable Windows build on Linux
(`dist/TuneBox-<version>-win-x64.zip`: unzip and run `TuneBox.exe`). It has no installer and
uses Electron's default icon; the installer needs Wine or the GitHub Actions build. Building the Windows target on Linux needs Wine. Instead, push a `v*` tag (or run the **Build** workflow manually) and GitHub Actions builds both on native runners.

## Layout

```
src/main/        Node backend: tools manager, YouTube search/stream, download queue, library (node:sqlite)
src/preload/     contextBridge: exposes the typed window.api
src/shared/      types and logic shared by the desktop backend and the phone app
src/renderer/    React UI (Tailwind, Zustand, Radix); src/renderer/src/mobile is the phone backend
android/         Android project (Capacitor) with the native plugins
ios/             iOS project (Capacitor): Swift plugins, embedded Python bridge
scripts/         fetch-binaries.mjs, emulator/test helpers
test/            vitest unit tests; test/ui renders the app against the fake backend
```
