import { describe, expect, it } from 'vitest'
import { chooseDestination } from '../src/main/library/organizer'
import { splitNewReleases } from '../src/main/follow-filter'
import { friendlyError } from '../src/main/errors'
import { pickShuffle } from '../src/renderer/src/store/shuffle'

describe('chooseDestination', () => {
  const none = (): boolean => false
  it('keeps the path when it is free', () => {
    expect(chooseDestination('/m/a.mp3', 'v1', none, () => null, new Map())).toBe('/m/a.mp3')
  })
  it('overwrites its own earlier download', () => {
    expect(
      chooseDestination(
        '/m/a.mp3',
        'v1',
        () => true,
        () => 'v1',
        new Map()
      )
    ).toBe('/m/a.mp3')
  })
  it('keeps both when a different song has the name', () => {
    expect(
      chooseDestination(
        '/m/a.mp3',
        'v2',
        () => true,
        () => 'v1',
        new Map()
      )
    ).toBe('/m/a [v2].mp3')
  })
  it('does not overwrite files TuneBox did not download', () => {
    expect(
      chooseDestination(
        '/m/a.mp3',
        'v2',
        () => true,
        () => null,
        new Map()
      )
    ).toBe('/m/a [v2].mp3')
    expect(
      chooseDestination(
        '/m/a.mp3',
        'v2',
        () => true,
        () => '',
        new Map()
      )
    ).toBe('/m/a [v2].mp3')
  })
  it('respects a path another running download has reserved', () => {
    const reserved = new Map([['/m/a.mp3', 'v1']])
    expect(chooseDestination('/m/a.mp3', 'v2', none, () => null, reserved)).toBe('/m/a [v2].mp3')
    expect(chooseDestination('/m/a.mp3', 'v1', none, () => null, reserved)).toBe('/m/a.mp3')
  })
})

describe('splitNewReleases', () => {
  const followedAt = new Date('2026-03-01').getTime()
  const rel = (
    id: string,
    year?: string
  ): { browseId: string; title: string; artist: string; year?: string } => ({
    browseId: id,
    title: id,
    artist: 'A',
    year
  })
  it('downloads unseen releases from the follow year onwards', () => {
    const r = splitNewReleases(
      [rel('new', '2026'), rel('seen', '2026')],
      new Set(['seen']),
      followedAt
    )
    expect(r.fresh.map((a) => a.browseId)).toEqual(['new'])
  })
  it('treats unseen old albums (back catalogue) as seen, not new', () => {
    const r = splitNewReleases([rel('old', '2010'), rel('new', '2027')], new Set(), followedAt)
    expect(r.old.map((a) => a.browseId)).toEqual(['old'])
    expect(r.fresh.map((a) => a.browseId)).toEqual(['new'])
  })
  it('counts releases without a year as new', () => {
    expect(splitNewReleases([rel('x')], new Set(), followedAt).fresh).toHaveLength(1)
  })
})

describe('pickShuffle', () => {
  it('never picks the current track or one already played', () => {
    const played = new Set([0, 2])
    for (let n = 0; n < 50; n++) {
      const i = pickShuffle(5, 1, (k) => played.has(k))
      expect([3, 4]).toContain(i)
    }
  })
  it('plays every track once per round', () => {
    const played = new Set<number>([0])
    let cur = 0
    for (let n = 0; n < 9; n++) {
      cur = pickShuffle(10, cur, (k) => played.has(k))
      expect(played.has(cur)).toBe(false)
      played.add(cur)
    }
    expect(played.size).toBe(10)
    expect(pickShuffle(10, cur, (k) => played.has(k))).toBe(-1)
  })
  it('handles a single-track queue', () => {
    expect(pickShuffle(1, 0, () => false)).toBe(-1)
  })
})

describe('friendlyError', () => {
  it('explains sign-in and age gates with the real settings section', () => {
    expect(friendlyError("ERROR: [youtube] x: Sign in to confirm you're not a bot")).toMatch(
      /YouTube sign-in/
    )
    expect(friendlyError('Sign in to confirm your age')).toMatch(/age-restricted/)
  })
  it('recognises network, disk and permission problems', () => {
    expect(friendlyError('getaddrinfo ENOTFOUND www.youtube.com')).toMatch(/internet/)
    expect(friendlyError('OSError: [Errno 28] No space left on device')).toMatch(/disk is full/)
    expect(friendlyError("EACCES: permission denied, mkdir '/music'")).toMatch(/download folder/)
  })
  it('strips the yt-dlp prefix from unknown errors and caps the length', () => {
    expect(friendlyError('ERROR: something odd')).toBe('something odd')
    expect(friendlyError('x'.repeat(1000))).toHaveLength(300)
  })
})
