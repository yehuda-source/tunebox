// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { within } from '@testing-library/react'
import { renderApp, goTo, main, screen, waitFor } from './helpers'

describe('Spotify import', () => {
  it('imports a playlist after review and creates a TuneBox playlist', async () => {
    const { user } = renderApp()
    await goTo(user, 'Spotify import')
    await user.click(await within(main()).findByRole('button', { name: /Shabbos Mix/ }))

    // Review: filters with counts, guesses unticked, songs you have shown as such.
    const ready = await within(main()).findByRole('button', { name: /^Ready/ }, { timeout: 4000 })
    expect(ready).toBeInTheDocument()
    expect(within(main()).getAllByText('Already in your library').length).toBeGreaterThan(0)
    expect(within(main()).getAllByText(/best guess/).length).toBeGreaterThan(0)

    const download = within(main()).getByRole('button', { name: /^Download \d+ songs?$/ })
    const before = Number(download.textContent!.match(/\d+/)![0])
    // Untick the first ready song.
    const firstReady = within(main())
      .getAllByRole('checkbox', { name: /^Include/ })
      .find((c) => (c as HTMLInputElement).checked && !(c as HTMLInputElement).disabled)!
    await user.click(firstReady)
    expect(
      Number(
        within(main())
          .getByRole('button', { name: /^Download \d+ songs?$/ })
          .textContent!.match(/\d+/)![0]
      )
    ).toBe(before - 1)

    // Playlist option defaults on for playlists, named after the Spotify playlist.
    expect(within(main()).getByRole('textbox', { name: 'Playlist name' })).toHaveValue(
      'Shabbos Mix'
    )
    await user.click(within(main()).getByRole('button', { name: /^Download \d+ songs?$/ }))

    expect(await screen.findByText('Playlist “Shabbos Mix” created')).toBeInTheDocument()
    await waitFor(() =>
      expect(within(main()).getByRole('heading', { name: 'Downloads' })).toBeInTheDocument()
    )
    await waitFor(() =>
      expect(document.querySelector('aside')!.textContent).toContain('Shabbos Mix')
    )
  })

  it('filters the review to songs that need checking, with an explanation', async () => {
    const { user } = renderApp()
    await goTo(user, 'Spotify import')
    await user.click(await within(main()).findByRole('button', { name: /Road Trip/ }))
    await user.click(
      await within(main()).findByRole('button', { name: /^Check/ }, { timeout: 4000 })
    )
    expect(within(main()).getByText(/length differs by 5–30 seconds/)).toBeInTheDocument()
    expect(within(main()).queryByText('Already in your library')).not.toBeInTheDocument()
  })

  it('explains short links instead of failing silently', async () => {
    const { user } = renderApp()
    await goTo(user, 'Spotify import')
    await user.type(
      await screen.findByPlaceholderText(/Paste a Spotify/),
      'https://spotify.link/abc{Enter}'
    )
    expect(await screen.findByText('Could not load from Spotify')).toBeInTheDocument()
  })
})
