// Screenshot the browser preview at phone size, for checking the phone layout without the emulator.
// Usage: npx electron scripts/phone-shot.mjs <out.png> [url] [js to run first] [wait ms]
// Needs `npm run preview:web` running. Example:
//   npx electron scripts/phone-shot.mjs /tmp/lib.png "http://localhost:5199/preview.html?phone" \
//     "document.querySelector('[aria-label=\"Library\"]')?.click()"
import { app, BrowserWindow } from 'electron'
import { writeFileSync } from 'fs'

const [out, url = 'http://localhost:5199/preview.html?phone', script = '', wait = '1500'] =
  process.argv.slice(2).filter((a) => !a.startsWith('--'))

app.commandLine.appendSwitch('force-device-scale-factor', '2.625')
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 412, height: 915, show: false, useContentSize: true })
  await win.loadURL(url)
  await new Promise((r) => setTimeout(r, 1200))
  if (script) await win.webContents.executeJavaScript(`(async () => { ${script} })()`)
  await new Promise((r) => setTimeout(r, Number(wait)))
  writeFileSync(out, (await win.webContents.capturePage()).toPNG())
  app.quit()
})
