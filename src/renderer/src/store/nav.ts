import { create } from 'zustand'
import type { ShowKind } from '@shared/types'

export type Route =
  | { name: 'home' }
  | { name: 'search'; q: string }
  | { name: 'album'; id: string }
  | { name: 'artist'; id: string }
  | { name: 'library'; tab: 'songs' | 'albums' | 'artists' | 'playlists'; artist?: string }
  | { name: 'libalbum'; artist: string; album: string }
  | { name: 'downloads' }
  | { name: 'playlist'; id: number }
  | { name: 'settings' }
  | { name: 'following' }
  | { name: 'spotify' }
  | { name: 'show'; kind: ShowKind; id: string }

interface NavState {
  stack: Route[]
  index: number
  route: Route
  go: (r: Route) => void
  back: () => void
  forward: () => void
}

const same = (a: Route, b: Route): boolean => JSON.stringify(a) === JSON.stringify(b)

export const useNav = create<NavState>((set, get) => ({
  stack: [{ name: 'home' }],
  index: 0,
  route: { name: 'home' },
  go: (r) => {
    const { stack, index } = get()
    if (same(stack[index], r)) return
    const next = [...stack.slice(0, index + 1), r].slice(-50)
    set({ stack: next, index: next.length - 1, route: r })
  },
  back: () => {
    const { stack, index } = get()
    if (index > 0) set({ index: index - 1, route: stack[index - 1] })
  },
  forward: () => {
    const { stack, index } = get()
    if (index < stack.length - 1) set({ index: index + 1, route: stack[index + 1] })
  }
}))

export const go = (r: Route): void => useNav.getState().go(r)
