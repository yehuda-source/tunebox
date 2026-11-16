// @vitest-environment jsdom
// @vitest-environment-options {"url": "http://localhost/?scenario=notrash"}
import { describe, expect, it } from 'vitest'
import { within } from '@testing-library/react'
import { renderApp, main, screen, waitFor } from './helpers'

describe('removing duplicates on a drive without a trash folder', () => {
  // Declining first: the fake library is shared within this file.
  it('removes nothing when the permanent delete is declined', async () => {
    const { user } = renderApp()
    const before = (await window.api.library.tracks()).length
    await user.click(screen.getByRole('button', { name: 'Settings' }))
    await user.click(await within(main()).findByRole('button', { name: /Find duplicates/ }))
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Move to trash' })
    )
    const second = await screen.findByRole('dialog', { name: /permanently/ })
    await user.click(within(second).getByRole('button', { name: 'Cancel' }))
    expect(await screen.findByText(/could not be removed/)).toBeInTheDocument()
    expect((await window.api.library.tracks()).length).toBe(before)
  })

  it('asks again before deleting permanently, then removes them', async () => {
    const { user } = renderApp()
    await user.click(screen.getByRole('button', { name: 'Settings' }))
    await user.click(await within(main()).findByRole('button', { name: /Find duplicates/ }))
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Move to trash' })
    )
    const second = await screen.findByRole('dialog', { name: /permanently/ })
    expect(within(second).getByText(/can’t be undone/)).toBeInTheDocument()
    await user.click(within(second).getByRole('button', { name: 'Delete permanently' }))
    expect(await screen.findByText(/^Removed \d+ duplicate/)).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })
})
