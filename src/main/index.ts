import { app, BrowserWindow, Menu, Tray, nativeImage, shell } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import log from './log'
import { registerSchemePrivileges, handleMediaProtocol } from './media-protocol'
import { registerIpc } from './ipc'
import { initTools, refresh as refreshTools } from './binaries/manager'
import { startLibrary, stopLibrary, restartWatcher, scan } from './library/library'
import { initQueue, stopAll } from './downloads/queue'
import { startFollowChecks } from './follows'
import { getSettings, onSettingsChanged } from './settings'
import { emit } from './events'

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let quitting = false

registerSchemePrivileges()

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => showWindow())
  app.whenReady().then(boot)
}

function showWindow(): void {
  if (!mainWindow) return createWindow()
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1320,
    height: 840,
    minWidth: 960,
    minHeight: 620,
    show: false,
    title: 'TuneBox',
    backgroundColor: '#0b0b0f',
    autoHideMenuBar: true,
    icon,
    webPreferences: {
      preload: join(import.meta.dirname, '../preload/index.cjs'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  })
  Menu.setApplicationMenu(null)

  mainWindow.on('ready-to-show', () => mainWindow?.show())
  mainWindow.on('close', (e) => {
    if (!quitting && getSettings().closeToTray && tray) {
      e.preventDefault()
      mainWindow?.hide()
    }
  })
  mainWindow.on('closed', () => (mainWindow = null))

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) shell.openExternal(url)
    return { action: 'deny' }
  })
  mainWindow.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith(process.env['ELECTRON_RENDERER_URL'] ?? 'file://')) e.preventDefault()
  })
  mainWindow.webContents.on('before-input-event', (_e, input) => {
    if (input.type === 'keyDown' && input.key === 'F12' && is.dev)
      mainWindow?.webContents.toggleDevTools()
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(import.meta.dirname, '../renderer/index.html'))
  }
}

function createTray(): void {
  try {
    tray = new Tray(nativeImage.createFromPath(icon).resize({ width: 22, height: 22 }))
  } catch (err) {
    log.warn('Tray not available', err)
    return
  }
  tray.setToolTip('TuneBox')
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Show TuneBox', click: showWindow },
      { type: 'separator' },
      { label: 'Play / Pause', click: () => emit('media:command', 'toggle') },
      { label: 'Next', click: () => emit('media:command', 'next') },
      { label: 'Previous', click: () => emit('media:command', 'prev') },
      { type: 'separator' },
      {
        label: 'Quit',
        click: () => {
          quitting = true
          app.quit()
        }
      }
    ])
  )
  tray.on('click', showWindow)
}

async function boot(): Promise<void> {
  log.info(`TuneBox ${app.getVersion()} starting (Electron ${process.versions.electron})`)
  app.setAppUserModelId('com.tunebox.app')
  handleMediaProtocol()
  registerIpc()
  createWindow()
  createTray()

  onSettingsChanged((s, prev) => {
    if (s.libraryDir !== prev.libraryDir || s.extraDirs.join('|') !== prev.extraDirs.join('|')) {
      void scan().then(restartWatcher)
    }
    if (s.ytdlpPath !== prev.ytdlpPath || s.ffmpegPath !== prev.ffmpegPath) void refreshTools()
  })

  // Tools first (downloads need them), library and queue in parallel.
  await Promise.all([
    initTools().catch((err) => log.error('Tool setup failed', err)),
    startLibrary().catch((err) => log.error('Library start failed', err))
  ])
  await initQueue().catch((err) => log.error('Queue start failed', err))
  startFollowChecks()
}

app.on('before-quit', () => {
  quitting = true
})

app.on('will-quit', () => {
  stopAll()
  void stopLibrary()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})
