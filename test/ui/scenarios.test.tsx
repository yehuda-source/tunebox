// @vitest-environment jsdom
// @vitest-environment-options {"url": "http://localhost/?scenario=errors"}
import { describe, expect, it } from 'vitest'
import { within } from '@testing-library/react'
import { renderApp, main, screen } from './helpers'

describe('when YouTube is unreachable', () => {
  it('explains the problem in plain language and offers a retry', async () => {
    const { user } = renderApp()
    await user.type(document.getElementById('global-search')!, 'anything{Enter}')
    expect(await within(main()).findByText(/Can’t reach YouTube/)).toBeInTheDocument()
    expect(within(main()).getByRole('button', { name: 'Try again' })).toBeInTheDocument()
    expect(screen.queryByText(/ENOTFOUND/)).not.toBeInTheDocument()
  })
})
