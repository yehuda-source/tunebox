# TuneBox

Search YouTube Music, play anything instantly, and download it into a tagged local library.
Runs on Windows and Linux as a self-contained app (`.exe` / `.AppImage`); no browser or system tools needed.

Built with Electron + React (renderer) and Node (main process).

## Features

- **Search** YouTube Music: songs, albums, artists, videos, with suggestions. Paste any YouTube / YouTube Music link to download a song, album or playlist.
- **Stream before downloading**: play any result immediately, with seeking.
- **Download** single songs, whole albums or an artist's discography as MP3 320, M4A or Opus. Files are tagged (title, artist, album, track number, year, square cover art) and filed as `Artist/Album/NN - Title.ext`.
- **Download queue**: concurrent, retries automatically, cancel/retry per item, survives restarts.
- **Library**: scans and watches your folders, songs/albums/artists views, tag editing, playlists (export `.m3u8`).
- **Player**: queue with drag-to-reorder, shuffle/repeat, media keys and OS media controls, remembers where you left off.
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

## Building

```bash
npm run build:linux   # dist/TuneBox-<version>-x86_64.AppImage
npm run build:win     # dist/TuneBox-<version>-setup.exe and -portable.exe
```

Each build script downloads the right binaries for the target first. Building the Windows target on Linux needs Wine. Instead, push a `v*` tag (or run the **Build** workflow manually) and GitHub Actions builds both on native runners.

## Layout

```
src/main/        Node backend: tools manager, YouTube search/stream, download queue, library (node:sqlite)
src/preload/     contextBridge: exposes the typed window.api
src/shared/      types shared by both sides
src/renderer/    React UI (Tailwind, Zustand, Radix)
scripts/         fetch-binaries.mjs
test/            vitest unit tests
```
