// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { within } from '@testing-library/react'
import { renderApp, goTo, main, screen, waitFor } from './helpers'

describe('podcasts and channels', () => {
  it('shows the big channel as the top result, plus podcasts, channels and episodes', async () => {
    const { user } = renderApp()
    await user.type(document.getElementById('global-search')!, 'ben shapiro{Enter}')
    expect(await within(main()).findByText('Podcasts & channels')).toBeInTheDocument()
    expect(within(main()).getByText(/Channel • @example • 6.96M subscribers/)).toBeInTheDocument()
    expect(within(main()).getByRole('heading', { name: 'Episodes' })).toBeInTheDocument()
    expect(within(main()).getByRole('button', { name: /^Podcasts/ })).toBeInTheDocument()
    expect(within(main()).getByRole('button', { name: /^Channels/ })).toBeInTheDocument()
  })

  it('opens a podcast, loads more episodes and follows it', async () => {
    const { user } = renderApp()
    await user.type(document.getElementById('global-search')!, 'ben shapiro{Enter}')
    await user.click(await within(main()).findByRole('button', { name: /The Example Show/ }))
    expect(
      await within(main()).findByRole('heading', { name: 'The Example Show' })
    ).toBeInTheDocument()
    expect(within(main()).getByText('Example Host • 260 episodes')).toBeInTheDocument()
    const rows = (): number => within(main()).getAllByRole('button', { name: 'Play' }).length
    await waitFor(() => expect(rows()).toBe(100))
    await user.click(within(main()).getByRole('button', { name: 'Load more' }))
    await waitFor(() => expect(rows()).toBe(200))

    await user.click(within(main()).getByRole('button', { name: /^Follow$/ }))
    expect(await screen.findByText('Following The Example Show')).toBeInTheDocument()
    await goTo(user, 'Following')
    expect(await within(main()).findByText('Podcasts & channels')).toBeInTheDocument()
    expect(within(main()).getByText('The Example Show')).toBeInTheDocument()
  })

  it('lists channels in their own tab and opens a channel page', async () => {
    const { user } = renderApp()
    await user.type(document.getElementById('global-search')!, 'ben shapiro{Enter}')
    await user.click(await within(main()).findByRole('button', { name: /^Channels/ }))
    await user.click(within(main()).getByRole('button', { name: /Example Clips/ }))
    expect(
      await within(main()).findByRole('heading', { name: 'Latest uploads' })
    ).toBeInTheDocument()
    expect(within(main()).getByText('Channel')).toBeInTheDocument()
  })
})
