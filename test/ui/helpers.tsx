import { afterEach } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from '../../src/renderer/src/App'
import { useNav } from '../../src/renderer/src/store/nav'

// Testing Library only auto-unmounts with vitest globals; do it explicitly, and start each test at Home.
afterEach(() => {
  cleanup()
  useNav.setState({ stack: [{ name: 'home' }], index: 0, route: { name: 'home' } })
})

export function renderApp(): { user: ReturnType<typeof userEvent.setup> } {
  const user = userEvent.setup()
  render(<App />)
  return { user }
}

export async function goTo(user: ReturnType<typeof userEvent.setup>, label: string): Promise<void> {
  const nav = document.querySelector('aside nav')!
  const button = [...nav.querySelectorAll('button')].find((b) =>
    b.textContent?.trim().startsWith(label)
  )
  if (!button) throw new Error(`No nav item ${label}`)
  await user.click(button)
}

export const main = (): HTMLElement => document.querySelector('main')!
export { screen, waitFor }
