import { contextBridge, ipcRenderer } from 'electron'
import { API_CHANNELS, EVENT_CHANNELS, type TuneboxApi } from '../shared/types'

// Build window.api from the channel list: api.search.query(q) -> invoke('search:query', q)
const api: Record<string, unknown> = {}
for (const [ns, methods] of Object.entries(API_CHANNELS)) {
  const group: Record<string, (...args: unknown[]) => Promise<unknown>> = {}
  for (const m of methods) group[m] = (...args) => ipcRenderer.invoke(`${ns}:${m}`, ...args)
  api[ns] = group
}

api.on = (event: string, cb: (payload: unknown) => void) => {
  if (!EVENT_CHANNELS.includes(event as never)) throw new Error(`Unknown event ${event}`)
  const listener = (_: unknown, payload: unknown): void => cb(payload)
  ipcRenderer.on(event, listener)
  return () => ipcRenderer.removeListener(event, listener)
}

contextBridge.exposeInMainWorld('api', api as unknown as TuneboxApi)
