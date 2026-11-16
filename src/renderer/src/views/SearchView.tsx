import { useState } from 'react'
import { Search as SearchIcon, Info } from 'lucide-react'
import type { SearchResults } from '@shared/types'
import { useCached } from '../lib/useCached'
import { TrackList } from '../components/TrackList'
import { Tabs, SectionTitle, Empty, Cover } from '../components/ui'
import { Page, AlbumCard, ArtistCard, Grid, GridSkeleton, ListSkeleton, ErrorState } from './common'
import { go } from '../store/nav'

type Tab = 'all' | 'songs' | 'albums' | 'artists' | 'videos'

function TopResult({ r }: { r: SearchResults }): React.JSX.Element | null {
  const artist = r.artists[0]
  if (!artist) return null
  return (
    <button
      onClick={() => go({ name: 'artist', id: artist.channelId })}
      className="flex h-full w-full items-center gap-5 rounded-2xl bg-panel p-5 text-left transition-colors hover:bg-hover xl:flex-col xl:items-start xl:gap-4"
    >
      <Cover src={artist.thumbnail} size={96} rounded="full" className="shadow-xl" />
      <div>
        <div className="text-2xl font-bold tracking-tight xl:text-3xl">{artist.name}</div>
        <div className="mt-1 text-muted">{artist.subtitle ?? 'Artist'}</div>
      </div>
    </button>
  )
}

export function SearchView({ q }: { q: string }): React.JSX.Element {
  const [tab, setTab] = useState<Tab>('all')
  const { data, error, loading, reload } = useCached(q.trim() ? `search:${q.trim()}` : null, () =>
    window.api.search.query(q)
  )

  if (!q.trim())
    return (
      <Page>
        <Empty icon={<SearchIcon className="h-7 w-7" />} title="Search YouTube Music">
          Find songs, albums and artists. Play anything instantly, or download it to your library.
        </Empty>
      </Page>
    )

  return (
    <Page>
      <div className="sticky top-0 z-10 -mx-8 mb-2 bg-bg/90 px-8 py-3 backdrop-blur">
        <Tabs<Tab>
          value={tab}
          onChange={setTab}
          tabs={[
            { id: 'all', label: 'All' },
            { id: 'songs', label: 'Songs', count: data?.songs.length },
            { id: 'albums', label: 'Albums', count: data?.albums.length },
            { id: 'artists', label: 'Artists', count: data?.artists.length },
            { id: 'videos', label: 'Videos', count: data?.videos.length }
          ]}
        />
      </div>

      {error ? (
        <ErrorState error={error} retry={reload} />
      ) : loading || !data ? (
        <>
          <SectionTitle>Songs</SectionTitle>
          <ListSkeleton n={6} />
          <SectionTitle>Albums</SectionTitle>
          <GridSkeleton />
        </>
      ) : (
        <>
          {data.source === 'ytdlp' && (
            <div className="mb-4 flex items-center gap-2 rounded-xl border border-line bg-panel px-4 py-3 text-[13px] text-muted">
              <Info className="h-4 w-4 text-accent" /> YouTube Music couldn’t be reached, so these
              are basic YouTube results.
            </div>
          )}
          {tab === 'all' && (
            <>
              {data.songs.length > 0 && (
                <div className="mt-4 grid grid-cols-1 gap-6 xl:grid-cols-[minmax(320px,2fr)_5fr]">
                  {data.artists[0] && (
                    <div>
                      <h2 className="mb-3 text-xl font-bold">Top result</h2>
                      <TopResult r={data} />
                    </div>
                  )}
                  <div className={data.artists[0] ? '' : 'xl:col-span-2'}>
                    <h2 className="mb-3 text-xl font-bold">Songs</h2>
                    <TrackList tracks={data.songs} limit={5} showAlbum={false} />
                  </div>
                </div>
              )}
              {data.albums.length > 0 && (
                <>
                  <SectionTitle>Albums</SectionTitle>
                  <Grid>
                    {data.albums.slice(0, 6).map((a) => (
                      <AlbumCard key={a.browseId} album={a} />
                    ))}
                  </Grid>
                </>
              )}
              {data.artists.length > 1 && (
                <>
                  <SectionTitle>Artists</SectionTitle>
                  <Grid>
                    {data.artists.slice(0, 6).map((a) => (
                      <ArtistCard key={a.channelId} artist={a} />
                    ))}
                  </Grid>
                </>
              )}
              {data.videos.length > 0 && (
                <>
                  <SectionTitle>Videos</SectionTitle>
                  <TrackList tracks={data.videos} limit={5} showAlbum={false} />
                </>
              )}
              {!data.songs.length &&
                !data.albums.length &&
                !data.artists.length &&
                !data.videos.length && (
                  <Empty icon={<SearchIcon className="h-7 w-7" />} title={`No results for “${q}”`}>
                    Check the spelling or try different words.
                  </Empty>
                )}
            </>
          )}
          {tab === 'songs' && <TrackList tracks={data.songs} />}
          {tab === 'videos' && <TrackList tracks={data.videos} showAlbum={false} />}
          {tab === 'albums' && (
            <Grid>
              {data.albums.map((a) => (
                <AlbumCard key={a.browseId} album={a} />
              ))}
            </Grid>
          )}
          {tab === 'artists' && (
            <Grid>
              {data.artists.map((a) => (
                <ArtistCard key={a.channelId} artist={a} />
              ))}
            </Grid>
          )}
        </>
      )}
    </Page>
  )
}
