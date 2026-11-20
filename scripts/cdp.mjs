/* eslint-disable @typescript-eslint/explicit-function-return-type -- plain JS script, no type annotations */
// Drive a running TuneBox for testing through the Chrome DevTools Protocol.
// Start the app with:  npx electron-vite dev --remoteDebuggingPort 9333
//   node scripts/cdp.mjs 9333 eval "<js, can await>"   prints the JSON result
//   node scripts/cdp.mjs 9333 shot out.png             saves a screenshot
const [port, cmd, arg] = process.argv.slice(2)
if (!port || !['eval', 'shot'].includes(cmd) || !arg) {
  console.error('usage: node scripts/cdp.mjs <port> eval "<js>" | shot <file.png>')
  process.exit(2)
}
const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json()
const page = targets.find((t) => t.type === 'page' && !t.url.startsWith('devtools'))
const ws = new WebSocket(page.webSocketDebuggerUrl)
await new Promise((resolve) => (ws.onopen = resolve))
let nextId = 0
const send = (method, params = {}) =>
  new Promise((resolve) => {
    const id = ++nextId
    const onMessage = (m) => {
      const data = JSON.parse(m.data)
      if (data.id !== id) return
      ws.removeEventListener('message', onMessage)
      resolve(data)
    }
    ws.addEventListener('message', onMessage)
    ws.send(JSON.stringify({ id, method, params }))
  })
if (cmd === 'eval') {
  const r = await send('Runtime.evaluate', {
    expression: arg,
    awaitPromise: true,
    returnByValue: true
  })
  const ex = r.result?.exceptionDetails
  console.log(JSON.stringify(ex ? ex.exception?.description : r.result?.result?.value, null, 1))
} else {
  const r = await send('Page.captureScreenshot', { format: 'png' })
  ;(await import('node:fs')).writeFileSync(arg, Buffer.from(r.result.data, 'base64'))
  console.log('saved', arg)
}
ws.close()
