import { BrowserWindow } from 'electron'
import type { TuneboxEvents } from '../shared/types'

export function emit<K extends keyof TuneboxEvents>(event: K, payload: TuneboxEvents[K]): void {
  for (const w of BrowserWindow.getAllWindows()) {
    if (!w.isDestroyed()) w.webContents.send(event, payload)
  }
}
