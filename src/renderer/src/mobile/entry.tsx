// Phone entry: install the phone backend as window.api, then start the shared UI.
import { App } from '@capacitor/app'
import { installMobileApi } from './api'

await installMobileApi()
await import('../main')

const { useApp } = await import('../store/app')
const { useNav } = await import('../store/nav')

// Android back: close what's on top (open menu or dialog, full-screen player, queue), then go back.
void App.addListener('backButton', () => {
  if (document.querySelector('[role="menu"],[role="dialog"]:not([aria-label="Now playing"])')) {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    return
  }
  const app = useApp.getState()
  if (app.nowPlayingOpen) return useApp.setState({ nowPlayingOpen: false })
  if (app.queueOpen) return useApp.setState({ queueOpen: false })
  const nav = useNav.getState()
  if (nav.index > 0) nav.back()
  else void App.minimizeApp()
})
