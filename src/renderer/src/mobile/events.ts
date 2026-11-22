// Backend → UI events (the phone version of the main process's webContents.send).
import type { TuneboxEvents } from '@shared/types'

type Listener = (payload: unknown) => void
const listeners = new Map<string, Set<Listener>>()

export function emit<K extends keyof TuneboxEvents>(event: K, payload: TuneboxEvents[K]): void {
  listeners.get(event)?.forEach((cb) => cb(payload))
}

export function on<K extends keyof TuneboxEvents>(
  event: K,
  cb: (payload: TuneboxEvents[K]) => void
): () => void {
  const set = listeners.get(event) ?? new Set()
  set.add(cb as Listener)
  listeners.set(event, set)
  return () => set.delete(cb as Listener)
}
