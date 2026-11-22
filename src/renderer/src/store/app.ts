import { create } from 'zustand'
import type { Settings, ToolStatus } from '@shared/types'
import { toast } from './toast'

interface AppState {
  settings: Settings | null
  tools: ToolStatus | null
  queueOpen: boolean
  paletteOpen: boolean
  /** Phone: the full-screen player. */
  nowPlayingOpen: boolean
  update: (patch: Partial<Settings>) => Promise<void>
}

export const useApp = create<AppState>((set) => ({
  settings: null,
  tools: null,
  queueOpen: false,
  paletteOpen: false,
  nowPlayingOpen: false,
  update: async (patch) => {
    try {
      set({ settings: await window.api.settings.set(patch) })
    } catch (err) {
      toast.error('Could not save settings', err)
    }
  }
}))

export function applyTheme(theme: Settings['theme']): void {
  const dark =
    theme === 'dark' || (theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.dataset.theme = dark ? 'dark' : 'light'
}

export function initAppStore(): void {
  void window.api.settings.get().then((settings) => {
    useApp.setState({ settings })
    applyTheme(settings.theme)
  })
  void window.api.tools.status().then((tools) => useApp.setState({ tools }))
  window.api.on('tools:status', (tools) => useApp.setState({ tools }))
  useApp.subscribe((s, prev) => {
    if (s.settings && s.settings.theme !== prev.settings?.theme) applyTheme(s.settings.theme)
  })
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    const t = useApp.getState().settings?.theme
    if (t === 'system') applyTheme(t)
  })
}
