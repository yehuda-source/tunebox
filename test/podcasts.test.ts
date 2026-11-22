import { describe, expect, it } from 'vitest'
import { join } from 'path'
import { splitNewEpisodes } from '../src/main/follow-filter'
import { formatUploadDate, libraryPath } from '../src/main/library/organizer'
import { audience, pickTopResult } from '../src/renderer/src/lib/topResult'
import type { SearchResults } from '../src/shared/types'

describe('splitNewEpisodes', () => {
  const eps = ['n1', 'n2', 'old1', 'old2'].map((videoId) => ({ videoId }))
  it('returns unseen episodes, newest first', () => {
    expect(splitNewEpisodes(eps, new Set(['old1', 'old2'])).fresh.map((e) => e.videoId)).toEqual([
      'n1',
      'n2'
    ])
  })
  it('caps a flood of unseen episodes and marks the rest as skipped', () => {
    const many = Array.from({ length: 25 }, (_, i) => ({ videoId: `e${i}` }))
    const r = splitNewEpisodes(many, new Set(), 10)
    expect(r.fresh).toHaveLength(10)
    expect(r.fresh[0].videoId).toBe('e0')
    expect(r.skipped).toHaveLength(15)
  })
})

describe('episode files', () => {
  const ep = { videoId: 'x', title: 'Episode 12: What? Why!', artists: ['Host'], show: 'The Show' }
  it('go under Podcasts/<show>/ with the upload date first', () => {
    expect(libraryPath('/m', ep, 'mp3', '2026-11-16')).toBe(
      join('/m', 'Podcasts', 'The Show', '2026-11-16 - Episode 12_ What_ Why!.mp3')
    )
    expect(libraryPath('/m', ep, 'mp3')).toBe(
      join('/m', 'Podcasts', 'The Show', 'Episode 12_ What_ Why!.mp3')
    )
  })
  it('read yt-dlp upload dates', () => {
    expect(formatUploadDate('20261116')).toBe('2026-11-16')
    expect(formatUploadDate('NA')).toBeUndefined()
  })
})

describe('top result', () => {
  const base: SearchResults = {
    query: 'ben shapiro',
    songs: [],
    albums: [],
    videos: [],
    episodes: [],
    artists: [{ channelId: 'UCa', name: 'Ben Shapiro', subtitle: 'Artist • 1.5K subscribers' }],
    podcasts: [
      { kind: 'podcast', id: 'PL1', title: 'The Ben Shapiro Show', author: 'Ben Shapiro' }
    ],
    channels: [
      {
        kind: 'channel',
        id: 'UCc',
        title: 'Ben Shapiro',
        subtitle: '@BenShapiro • 6.96M subscribers'
      }
    ],
    source: 'ytmusic'
  }
  it('reads audience sizes', () => {
    expect(audience('Artist • 66.1M monthly audience')).toBe(66_100_000)
    expect(audience('@x • 1.5K subscribers')).toBe(1500)
    expect(audience(undefined)).toBe(0)
  })
  it('prefers the big channel over a small namesake artist', () => {
    expect(pickTopResult(base)).toMatchObject({ kind: 'show', show: { id: 'UCc' } })
  })
  it('keeps the artist for music searches', () => {
    const music = {
      ...base,
      query: 'daft punk',
      artists: [
        { channelId: 'UCd', name: 'Daft Punk', subtitle: 'Artist • 66.1M monthly audience' }
      ],
      channels: [
        {
          kind: 'channel' as const,
          id: 'UCx',
          title: 'Daft Punk',
          subtitle: '@daftpunk • 10M subscribers'
        }
      ]
    }
    expect(pickTopResult(music)).toMatchObject({ kind: 'artist' })
  })
  it('falls back to a matching podcast when there is no artist or channel', () => {
    expect(pickTopResult({ ...base, artists: [], channels: [] })).toMatchObject({
      kind: 'show',
      show: { id: 'PL1' }
    })
  })
})

describe('isListedEpisode', () => {
  it('skips private and deleted placeholders, including ones with no title', async () => {
    const { isListedEpisode } = await import('../src/shared/ytdlpEntries')
    expect(isListedEpisode({ id: 'a', title: 'The 2028 Race Is Already Here' })).toBe(true)
    expect(isListedEpisode({ id: '2DTVpXAT7Pg', title: null })).toBe(false)
    expect(isListedEpisode({ id: 'b', title: '  ' })).toBe(false)
    expect(isListedEpisode({ id: 'c', title: '[Private video]' })).toBe(false)
    expect(isListedEpisode({ id: 'd', title: '[Deleted video]' })).toBe(false)
    expect(isListedEpisode({ id: null, title: 'x' })).toBe(false)
  })
})
