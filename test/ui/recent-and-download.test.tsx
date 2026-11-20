// @vitest-environment jsdom
import { describe, expect, it, beforeEach } from 'vitest'
import { within } from '@testing-library/react'
import { renderApp, goTo, main, screen, waitFor } from './helpers'
import { clearRecentSearches, matchRecent } from '../../src/renderer/src/store/recentSearches'

const dropdown = (): string[] =>
  [...document.querySelectorAll('header [role=option]')].map((o) => o.textContent!.trim())

describe('recent searches', () => {
  beforeEach(() => clearRecentSearches())

  it('remembers searches and shows them when the search bar is empty', async () => {
    const { user } = renderApp()
    const box = document.getElementById('global-search')!
    await user.type(box, 'yaakov shwekey{Enter}')
    await user.clear(box)
    await user.type(box, 'ben shapiro{Enter}')
    await user.clear(box)
    await user.click(box)
    await waitFor(() => expect(dropdown()).toEqual(['ben shapiro', 'yaakov shwekey']))
    expect(screen.getByText('Recent searches')).toBeInTheDocument()
  })

  it('shows matching recent searches first while typing', async () => {
    const { user } = renderApp()
    const box = document.getElementById('global-search')!
    await user.type(box, 'ben shapiro{Enter}')
    await user.clear(box)
    await user.type(box, 'sha')
    await waitFor(() => expect(dropdown()[0]).toBe('ben shapiro'))
    // YouTube suggestions follow.
    await waitFor(() => expect(dropdown()).toContain('sha live'))
  })

  it('counts searches started outside the search bar, and can remove one', async () => {
    const { user } = renderApp()
    await user.click(await screen.findByRole('button', { name: 'Radiohead' }))
    const box = document.getElementById('global-search')!
    await user.clear(box)
    await user.click(box)
    await waitFor(() => expect(dropdown()).toEqual(['Radiohead']))
    await user.click(screen.getByRole('button', { name: /Remove “Radiohead”/ }))
    expect(dropdown()).toEqual([])
  })

  it('orders matches: starts-with before contains, without the exact query', () => {
    expect(matchRecent(['ben shapiro', 'shalom', 'shabbos songs'], 'sha', 4)).toEqual([
      'shalom',
      'shabbos songs',
      'ben shapiro'
    ])
    expect(matchRecent(['shalom'], 'shalom', 4)).toEqual([])
  })
})

describe('podcast Download menu', () => {
  it('queues the latest 10 episodes', async () => {
    const { user } = renderApp()
    await user.type(document.getElementById('global-search')!, 'ben shapiro{Enter}')
    await user.click(await within(main()).findByRole('button', { name: /The Example Show/ }))
    // The page's Download menu (each episode row also has its own Download button).
    const menuButton = (await within(main()).findAllByRole('button', { name: /^Download/ })).find(
      (b) => b.getAttribute('aria-haspopup') === 'menu'
    )!
    await user.click(menuButton)
    await user.click(await screen.findByRole('menuitem', { name: 'Latest 10 episodes' }))
    expect(await screen.findByText('Queued 10 downloads')).toBeInTheDocument()
    await goTo(user, 'Downloads')
    expect((await within(main()).findAllByText('The Example Show')).length).toBeGreaterThan(0)
  })
})
