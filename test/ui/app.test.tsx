// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { within } from '@testing-library/react'
import { renderApp, goTo, main, screen, waitFor } from './helpers'

describe('TuneBox UI (fake backend)', () => {
  it('has a single search bar and searches from it', async () => {
    const { user } = renderApp()
    await screen.findByText(/Search above, or start with one of these/)
    expect(screen.getAllByRole('textbox')).toHaveLength(1)
    await user.type(document.getElementById('global-search')!, 'shwekey{Enter}')
    expect(await within(main()).findByText('Top result')).toBeInTheDocument()
    expect(within(main()).getByRole('button', { name: /^Songs/ })).toBeInTheDocument()
  })

  it('searches when a suggestion chip on the home page is clicked', async () => {
    const { user } = renderApp()
    await user.click(await screen.findByRole('button', { name: 'Radiohead' }))
    expect(await within(main()).findByText('Top result')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Radiohead')).toBeInTheDocument()
  })

  it('shows a friendly empty state when nothing matches', async () => {
    const { user } = renderApp()
    const top = document.getElementById('global-search')!
    await user.type(top, 'nothing at all{Enter}')
    expect(await within(main()).findByText(/No results for “nothing at all”/)).toBeInTheDocument()
  })

  it('keeps the library filter when switching tabs', async () => {
    const { user } = renderApp()
    await goTo(user, 'Library')
    const filter = await screen.findByPlaceholderText('Filter library')
    await user.type(filter, 'Shabbos')
    await user.click(within(main()).getByRole('button', { name: 'Albums' }))
    await user.click(within(main()).getByRole('button', { name: 'Songs' }))
    expect(screen.getByPlaceholderText('Filter library')).toHaveValue('Shabbos')
  })

  it('filters the library and updates the counts', async () => {
    const { user } = renderApp()
    await goTo(user, 'Library')
    // The filter is remembered across visits, so start from a clear field.
    await user.clear(await screen.findByPlaceholderText('Filter library'))
    const summary = await within(main()).findByText(/300 songs/)
    await user.type(screen.getByPlaceholderText('Filter library'), 'zzzz-no-match')
    await waitFor(() => expect(summary).toHaveTextContent(/^0 songs/))
  })

  it('lists downloads with retry for failures and a clear action', async () => {
    const { user } = renderApp()
    await goTo(user, 'Downloads')
    expect(
      await within(main()).findByRole('button', { name: /Retry failed \(1\)/ })
    ).toBeInTheDocument()
    expect(within(main()).getByText(/^YouTube wants you to sign in/)).toBeInTheDocument()
    // A song that was swapped for another upload says so.
    expect(within(main()).getByText(/another upload of the same song was used/)).toBeInTheDocument()
    expect(within(main()).getByRole('button', { name: 'Clear finished' })).toBeInTheDocument()
  })

  it('rejects a link that is not YouTube', async () => {
    const { user } = renderApp()
    await goTo(user, 'Downloads')
    await user.type(
      await screen.findByPlaceholderText(/Paste a YouTube/),
      'https://example.com/song{Enter}'
    )
    expect(await screen.findByText('Could not read that link')).toBeInTheDocument()
  })

  it('follows and unfollows an artist', async () => {
    const { user } = renderApp()
    await user.type(document.getElementById('global-search')!, 'radiohead{Enter}')
    // The first artist card (the top result may be a channel now).
    const [artistCard] = await within(main()).findAllByRole('button', { name: /monthly audience/ })
    await user.click(artistCard)
    // The fake backend already follows this artist: unfollow, then follow again.
    await user.click(await within(main()).findByRole('button', { name: /^Following$/ }))
    const follow = await within(main()).findByRole('button', { name: /^Follow$/ })
    await goTo(user, 'Following')
    // The artist is gone from Following (a followed podcast remains in the fake data).
    expect(await within(main()).findByText('Podcasts & channels')).toBeInTheDocument()
    expect(within(main()).queryByRole('heading', { name: 'Artists' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Back/ }))
    expect(follow).not.toBeInTheDocument()
    await user.click(await within(main()).findByRole('button', { name: /^Follow$/ }))
    expect(await within(main()).findByRole('button', { name: /^Following$/ })).toBeInTheDocument()
  })

  it('finds and removes duplicate songs after confirmation', async () => {
    const { user } = renderApp()
    await goTo(user, 'Library')
    await user.clear(await screen.findByPlaceholderText('Filter library'))
    const before = Number(
      (await within(main()).findByText(/^\d+ songs/)).textContent!.match(/^(\d+)/)![1]
    )
    await user.click(screen.getByRole('button', { name: 'Settings' }))
    await user.click(await within(main()).findByRole('button', { name: /Find duplicates/ }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText(/The first copy you downloaded is/)).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Move to trash' }))
    expect(await screen.findByText(/^Removed \d+ duplicate/)).toBeInTheDocument()
    await goTo(user, 'Library')
    // The library reloads shortly after a change.
    await waitFor(() => {
      const after = Number(
        within(main())
          .getByText(/^\d+ songs/)
          .textContent!.match(/^(\d+)/)![1]
      )
      expect(after).toBeLessThan(before)
    })
  })

  it('opens and filters the command palette with Ctrl+K', async () => {
    const { user } = renderApp()
    await user.keyboard('{Control>}k{/Control}')
    const input = await screen.findByPlaceholderText(/Type a command/)
    await user.type(input, 'settings')
    expect(await screen.findByRole('option', { name: /Settings/ })).toBeInTheDocument()
  })
})
