import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react'

interface Entry {
  data?: unknown
  error?: unknown
  loading: boolean
  at: number
}

const TTL = 10 * 60 * 1000
const cache = new Map<string, Entry>()
const listeners = new Set<() => void>()

const subscribe = (l: () => void): (() => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}
const emit = (): void => listeners.forEach((l) => l())

function load(key: string, fetcher: () => Promise<unknown>, force: boolean): void {
  const e = cache.get(key)
  if (!force && e && (e.loading || (e.data !== undefined && Date.now() - e.at < TTL))) return
  cache.set(key, { data: e?.data, loading: true, at: e?.at ?? 0 })
  emit()
  fetcher().then(
    (data) => {
      cache.set(key, { data, loading: false, at: Date.now() })
      emit()
    },
    (error) => {
      cache.set(key, { error, loading: false, at: 0 })
      emit()
    }
  )
}

/** Fetch with a small shared cache so navigating back is instant. */
export function useCached<T>(
  key: string | null,
  fetcher: () => Promise<T>
): { data: T | undefined; error: unknown; loading: boolean; reload: () => void } {
  const entry = useSyncExternalStore(subscribe, () => (key ? cache.get(key) : undefined))
  const fetcherRef = useRef(fetcher)
  useEffect(() => {
    fetcherRef.current = fetcher
  })
  useEffect(() => {
    if (key) load(key, () => fetcherRef.current(), false)
  }, [key])
  const reload = useCallback(() => {
    if (key) load(key, () => fetcherRef.current(), true)
  }, [key])
  return {
    data: entry?.data as T | undefined,
    error: entry?.error,
    loading: !entry || entry.loading,
    reload
  }
}
