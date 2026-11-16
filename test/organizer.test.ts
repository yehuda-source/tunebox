import { describe, expect, it } from 'vitest'
import { join } from 'path'
import { libraryPath } from '../src/main/library/organizer'

const base = { videoId: 'x', title: 'Get Lucky', artists: ['Daft Punk', 'Pharrell Williams'] }

describe('libraryPath', () => {
  it('uses Artist/Album/NN - Title', () => {
    expect(
      libraryPath('/m', { ...base, album: 'Random Access Memories', trackNumber: 8 }, 'mp3')
    ).toBe(join('/m', 'Daft Punk', 'Random Access Memories', '08 - Get Lucky.mp3'))
  })
  it('prefers the album artist', () => {
    expect(libraryPath('/m', { ...base, album: 'X', albumArtist: 'Various Artists' }, 'm4a')).toBe(
      join('/m', 'Various Artists', 'X', 'Get Lucky.m4a')
    )
  })
  it('puts loose songs in Singles without a number', () => {
    expect(libraryPath('/m', { ...base, trackNumber: 3 }, 'opus')).toBe(
      join('/m', 'Daft Punk', 'Singles', 'Get Lucky.opus')
    )
  })
  it('sanitizes every part', () => {
    expect(
      libraryPath('/m', { ...base, title: 'What?', artists: ['AC/DC'], album: 'Live: 1991' }, 'mp3')
    ).toBe(join('/m', 'AC_DC', 'Live_ 1991', 'What_.mp3'))
  })
})
