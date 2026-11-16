import { describe, expect, it } from 'vitest'
import { matchSong, songKey } from '../src/shared/songKey'
import { parseSpotifySource, toSpotifyTrack } from '../src/main/spotify/parse'

describe('parseSpotifySource', () => {
  it('reads playlist, album and track links in their usual forms', () => {
    expect(
      parseSpotifySource('https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M?si=abc')
    ).toEqual({
      kind: 'playlist',
      id: '37i9dQZF1DXcBWIGoYBM5M'
    })
    expect(
      parseSpotifySource('https://open.spotify.com/intl-de/album/4m2880jivSbbyEGAKfITCa')
    ).toEqual({
      kind: 'album',
      id: '4m2880jivSbbyEGAKfITCa'
    })
    expect(parseSpotifySource('spotify:track:2Foc5Q5nqNiosCNqttzHof')).toEqual({
      kind: 'track',
      id: '2Foc5Q5nqNiosCNqttzHof'
    })
    expect(parseSpotifySource('Liked Songs')).toEqual({ kind: 'liked' })
  })
  it('explains short links and rejects other sites', () => {
    expect(() => parseSpotifySource('https://spotify.link/AbCd')).toThrow(/Copy link/)
    expect(() => parseSpotifySource('https://youtube.com/watch?v=x')).toThrow(/Spotify/)
  })
})

describe('toSpotifyTrack', () => {
  it('maps a track and skips local files and episodes', () => {
    const t = toSpotifyTrack({
      id: 'x',
      name: 'Get Lucky (feat. Pharrell Williams & Nile Rodgers)',
      duration_ms: 369_626,
      track_number: 8,
      artists: [{ name: 'Daft Punk' }, { name: 'Pharrell Williams' }],
      album: {
        name: 'Random Access Memories',
        artists: [{ name: 'Daft Punk' }],
        release_date: '2013-05-17',
        images: [{ url: 'https://i.scdn.co/x' }]
      }
    })
    expect(t).toMatchObject({
      durationSec: 370,
      year: '2013',
      albumArtist: 'Daft Punk',
      trackNumber: 8
    })
    expect(
      toSpotifyTrack({ id: 'y', name: 'a', is_local: true, duration_ms: 1, artists: [] })
    ).toBeNull()
    expect(
      toSpotifyTrack({ id: 'z', name: 'Ep', type: 'episode', duration_ms: 1, artists: [] })
    ).toBeNull()
  })
})

describe('matchSong (Spotify → YouTube Music)', () => {
  const spotify = {
    title: 'Get Lucky (feat. Pharrell Williams & Nile Rodgers)',
    artists: ['Daft Punk', 'Pharrell Williams'],
    durationSec: 370
  }
  it('matches the official audio when the length agrees', () => {
    const r = matchSong(spotify, [
      { videoId: 'live', title: 'Get Lucky (Live)', artists: ['Daft Punk'], durationSec: 420 },
      {
        videoId: 'audio',
        title: 'Get Lucky (feat. Pharrell Williams and Nile Rodgers)',
        artists: ['Daft Punk'],
        durationSec: 369
      }
    ])
    expect(r).toEqual({ candidate: expect.objectContaining({ videoId: 'audio' }), status: 'match' })
  })
  it('flags a same-titled upload with a different length for checking', () => {
    const r = matchSong(spotify, [
      {
        videoId: 'video',
        title: 'Daft Punk - Get Lucky (Official Video)',
        artists: ['Daft Punk'],
        durationSec: 395
      }
    ])
    expect(r?.status).toBe('check')
  })
  it('treats Spotify remaster names like YouTube ones', () => {
    expect(songKey('Bohemian Rhapsody - Remastered 2011', 'Queen')).toBe(
      songKey('Bohemian Rhapsody (2011 Remaster)', 'Queen')
    )
    expect(songKey('Bohemian Rhapsody - Remastered 2011', 'Queen')).toBe(
      songKey('Bohemian Rhapsody', 'Queen')
    )
  })
  it('returns nothing rather than a different song', () => {
    expect(
      matchSong(spotify, [
        { videoId: 'cover', title: 'Get Lucky', artists: ['Some Cover Band'], durationSec: 370 }
      ])
    ).toBeUndefined()
  })
})
