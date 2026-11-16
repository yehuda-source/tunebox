import { describe, expect, it } from 'vitest'
import { SongIndex, mainArtist, pickAlternative, songKey } from '../src/shared/songKey'

describe('songKey', () => {
  it('treats album, compilation and search copies of a song as the same', () => {
    expect(songKey('Ashir LaKel', 'Yaakov Shwekey')).toBe(songKey('Ashir LaKel', 'Yaakov Shwekey'))
    expect(songKey('Kel Be’oni Habet', 'Yaakov Shwekey')).toBe(
      songKey("Kel Be'oni Habet", 'Yaakov Shwekey')
    )
  })
  it('ignores video tags, featured artists and "Artist - Title" prefixes', () => {
    const base = songKey('Get Lucky', 'Daft Punk')
    expect(
      songKey(
        'Get Lucky (feat. Pharrell Williams and Nile Rodgers)',
        'Daft Punk, Pharrell Williams'
      )
    ).toBe(base)
    expect(songKey('Daft Punk - Get Lucky (Official Audio)', 'Daft Punk')).toBe(base)
    expect(songKey('Get Lucky [Official Music Video]', 'Daft Punk')).toBe(base)
    expect(songKey('GET LUCKY!', 'daft punk')).toBe(base)
  })
  it('keeps different versions apart', () => {
    const base = songKey('Get Lucky', 'Daft Punk')
    expect(songKey('Get Lucky (Radio Edit)', 'Daft Punk')).not.toBe(base)
    expect(songKey('Kel Be’oni Habet (Instrumental)', 'Yaakov Shwekey')).not.toBe(
      songKey('Kel Be’oni Habet', 'Yaakov Shwekey')
    )
    expect(songKey('Get Lucky', 'Someone Else')).not.toBe(base)
  })
  it('handles Hebrew titles and keeps a dash that is part of the title', () => {
    expect(songKey('מזמור שיר', 'ישי ריבו')).toBe(songKey('מזמור שיר', 'ישי ריבו'))
    expect(songKey('Rock - Paper - Scissors', 'Band')).toContain('rock paper scissors')
  })
  it('takes the main artist from multi-artist credits', () => {
    expect(mainArtist('Yaakov Shwekey, Avraham Fried')).toBe('yaakov shwekey')
    expect(mainArtist('Yaakov Shwekey & Avraham Fried')).toBe('yaakov shwekey')
  })
})

describe('SongIndex', () => {
  const idx = new SongIndex<{ id: number; durationSec: number | null }>()
  idx.add('Ashir LaKel', 'Yaakov Shwekey', { id: 1, durationSec: 146 })
  idx.add('Lecha Dodi', 'Yaakov Shwekey', { id: 2, durationSec: 240 })

  it('finds the same song within 3 seconds', () => {
    expect(idx.find('Ashir LaKel', 'Yaakov Shwekey', 147)?.id).toBe(1)
  })
  it('does not match a different recording with a different length', () => {
    expect(idx.find('Lecha Dodi', 'Yaakov Shwekey', 300)).toBeUndefined()
  })
  it('matches on name alone when a length is unknown', () => {
    expect(idx.find('Lecha Dodi', 'Yaakov Shwekey', null)?.id).toBe(2)
  })
})

describe('pickAlternative', () => {
  // The real case: the official video needs a sign-in, the official audio doesn't.
  const blocked = {
    videoId: 'blockedvid1',
    title: 'SHWEKEY -  I Can Be',
    artists: ['Yaakov Shwekey יעקב שוואקי'],
    durationSec: 262
  }
  const found = [
    {
      videoId: 'version2vid',
      title: 'I Can Be 2.0',
      artists: ['Yaakov Shwekey'],
      durationSec: 290
    },
    {
      videoId: 'livevideo01',
      title: 'I Can Be (Live)',
      artists: ['Yaakov Shwekey'],
      durationSec: 302
    },
    {
      videoId: 'blockedvid1',
      title: 'SHWEKEY -  I Can Be',
      artists: ['Yaakov Shwekey'],
      durationSec: 262
    },
    {
      videoId: 'covervideo1',
      title: 'I Can Be Stronger',
      artists: ['Juda Alcabes'],
      durationSec: 293
    },
    { videoId: 'officialaud', title: 'I Can Be', artists: ['Yaakov Shwekey'], durationSec: 272 }
  ]

  it('finds the official audio and skips versions, covers and the blocked upload', () => {
    expect(pickAlternative({ ...blocked, artists: ['Yaakov Shwekey'] }, found)?.videoId).toBe(
      'officialaud'
    )
  })
  it('does not guess when the artist name is different', () => {
    expect(mainArtist('Yaakov Shwekey יעקב שוואקי')).not.toBe(mainArtist('Yaakov Shwekey'))
    // Artist names that differ entirely don't match: better to fail than download the wrong song.
    expect(pickAlternative(blocked, found)).toBeUndefined()
  })
  it('rejects a same-named song of a very different length', () => {
    expect(
      pickAlternative({ ...blocked, artists: ['Yaakov Shwekey'], durationSec: 500 }, found)
    ).toBeUndefined()
  })
})
