// @vitest-environment jsdom
// @vitest-environment-options {"url": "http://localhost/?scenario=spotify-setup"}
import { describe, expect, it } from 'vitest'
import { within } from '@testing-library/react'
import { renderApp, goTo, main, screen } from './helpers'

describe('Spotify setup', () => {
  it('walks through the developer app, validates the Client ID, then offers sign-in', async () => {
    const { user } = renderApp()
    await goTo(user, 'Spotify import')
    expect(await within(main()).findByText('http://127.0.0.1:43821/callback')).toBeInTheDocument()
    const input = within(main()).getByPlaceholderText('32 letters and numbers')
    await user.type(input, 'not-an-id')
    await user.click(within(main()).getByRole('button', { name: 'Save' }))
    expect(await screen.findByText('Could not save the Client ID')).toBeInTheDocument()

    await user.clear(input)
    await user.type(input, '0123456789abcdef0123456789abcdef')
    await user.click(within(main()).getByRole('button', { name: 'Save' }))
    await user.click(await within(main()).findByRole('button', { name: 'Sign in with Spotify' }))
    expect(await screen.findByText(/Connected to Spotify as Preview User/)).toBeInTheDocument()
    expect(await within(main()).findByRole('button', { name: /Liked Songs/ })).toBeInTheDocument()
  })
})
