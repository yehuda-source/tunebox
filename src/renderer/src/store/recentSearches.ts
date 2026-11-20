import { create } from 'zustand'
import { useNav } from './nav'

// Recent searches live in this computer's browser storage: a per-user convenience, not data.
const KEY = 'tunebox.recentSearches'
const MAX = 20

function read(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '[]')
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0, MAX) : []
  } catch {
    return []
  }
}

function write(list: string[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(list))
  } catch {
    /* storage unavailable: keep them in memory for this session */
  }
}

export const useRecentSearches = create<{ list: string[] }>(() => ({ list: read() }))

const same = (a: string, b: string): boolean => a.trim().toLowerCase() === b.trim().toLowerCase()

/** Most recent first; searching again moves an entry to the top. Links aren't searches. */
export function addRecentSearch(q: string): void {
  const query = q.trim()
  if (!query || /^https?:\/\//i.test(query)) return
  const list = [query, ...useRecentSearches.getState().list.filter((x) => !same(x, query))].slice(
    0,
    MAX
  )
  useRecentSearches.setState({ list })
  write(list)
}

export function removeRecentSearch(q: string): void {
  const list = useRecentSearches.getState().list.filter((x) => !same(x, q))
  useRecentSearches.setState({ list })
  write(list)
}

export function clearRecentSearches(): void {
  useRecentSearches.setState({ list: [] })
  write([])
}

/** Recent searches to offer for what's typed so far: all of them when empty, else matches. */
export function matchRecent(list: string[], typed: string, limit: number): string[] {
  const t = typed.trim().toLowerCase()
  if (!t) return list.slice(0, limit)
  const starts = list.filter((x) => x.toLowerCase().startsWith(t) && x.toLowerCase() !== t)
  const contains = list.filter((x) => !x.toLowerCase().startsWith(t) && x.toLowerCase().includes(t))
  return [...starts, ...contains].slice(0, limit)
}

// Every search counts, wherever it started (search bar, Home chips, command palette, artist links).
useNav.subscribe((state, prev) => {
  if (state.route !== prev.route && state.route.name === 'search' && state.route.q.trim()) {
    addRecentSearch(state.route.q)
  }
})
