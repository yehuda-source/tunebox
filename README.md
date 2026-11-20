# TuneBox

Search YouTube Music, play anything instantly, and download it into a tagged local library.
Runs on Windows and Linux as a self-contained app (`.exe` / `.AppImage`); no browser or system tools needed.

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

### Releases

Bump the version, then push a matching tag. GitHub Actions builds Windows (installer + portable
`.exe`) and Linux (`.AppImage`) and publishes them as a GitHub Release:

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
src/shared/      types shared by both sides
src/renderer/    React UI (Tailwind, Zustand, Radix)
scripts/         fetch-binaries.mjs
test/            vitest unit tests; test/ui renders the app against the fake backend
```
