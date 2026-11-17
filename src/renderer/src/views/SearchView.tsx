import { useState } from 'react'
import { Search as SearchIcon, Info } from 'lucide-react'
import type { SearchResults } from '@shared/types'
import { useCached } from '../lib/useCached'
import { TrackList } from '../components/TrackList'
import { Tabs, SectionTitle, Empty, Cover } from '../components/ui'
import {
  Page,
  AlbumCard,
  ArtistCard,
  ShowCard,
  Grid,
  GridSkeleton,
  ListSkeleton,
  ErrorState
} from './common'
import { pickTopResult } from '../lib/topResult'
import { go } from '../store/nav'

type Tab = 'all' | 'songs' | 'albums' | 'artists' | 'podcasts' | 'channels' | 'videos'

function TopResult({ r }: { r: SearchResults }): React.JSX.Element | null {
  const top = pickTopResult(r)
  if (!top) return null
  const isArtist = top.kind === 'artist'
  const title = isArtist ? top.artist.name : top.show.title
  const subtitle = isArtist
    ? (top.artist.subtitle ?? 'Artist')
    : top.show.kind === 'channel'
      ? `Channel${top.show.subtitle ? ` • ${top.show.subtitle}` : ''}`
      : `Podcast${top.show.author ? ` • ${top.show.author}` : ''}`
  const thumb = isArtist ? top.artist.thumbnail : top.show.thumbnail
  const round = isArtist || top.show.kind === 'channel'
  return (
    <button
      onClick={() =>
        isArtist
          ? go({ name: 'artist', id: top.artist.channelId })
          : go({ name: 'show', kind: top.show.kind, id: top.show.id })
      }
      className="flex h-full w-full items-center gap-5 rounded-2xl bg-panel p-5 text-left transition-colors hover:bg-hover xl:flex-col xl:items-start xl:gap-4"
    >
      <Cover src={thumb} size={96} rounded={round ? 'full' : 'lg'} className="shadow-xl" />
      <div className="min-w-0">
        <div className="truncate text-2xl font-bold tracking-tight xl:text-3xl">{title}</div>
        <div className="mt-1 truncate text-muted">{subtitle}</div>
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
          Find songs, albums, artists, podcasts and channels. Play anything instantly, or download
          it to your library.
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
            {
              id: 'podcasts',
              label: 'Podcasts',
              count: data ? data.podcasts.length + data.episodes.length : undefined
            },
            { id: 'channels', label: 'Channels', count: data?.channels.length },
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
              {(data.songs.length > 0 || pickTopResult(data)) && (
                <div className="mt-4 grid grid-cols-1 gap-6 xl:grid-cols-[minmax(320px,2fr)_5fr]">
                  {pickTopResult(data) && (
                    <div>
                      <h2 className="mb-3 text-xl font-bold">Top result</h2>
                      <TopResult r={data} />
                    </div>
                  )}
                  {data.songs.length > 0 && (
                    <div className={pickTopResult(data) ? '' : 'xl:col-span-2'}>
                      <h2 className="mb-3 text-xl font-bold">Songs</h2>
                      <TrackList tracks={data.songs} limit={5} showAlbum={false} />
                    </div>
                  )}
                </div>
              )}
              {data.podcasts.length + data.channels.length > 0 && (
                <>
                  <SectionTitle>Podcasts & channels</SectionTitle>
                  <Grid>
                    {[
                      ...data.podcasts.slice(0, 3),
                      ...data.channels.slice(0, 6 - Math.min(3, data.podcasts.length))
                    ].map((sh) => (
                      <ShowCard key={`${sh.kind}:${sh.id}`} show={sh} />
                    ))}
                  </Grid>
                </>
              )}
              {data.episodes.length > 0 && (
                <>
                  <SectionTitle>Episodes</SectionTitle>
                  <TrackList tracks={data.episodes} limit={5} showAlbum={false} />
                </>
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
                !data.videos.length &&
                !data.podcasts.length &&
                !data.episodes.length &&
                !data.channels.length && (
                  <Empty icon={<SearchIcon className="h-7 w-7" />} title={`No results for “${q}”`}>
                    Check the spelling or try different words.
                  </Empty>
                )}
            </>
          )}
          {tab === 'songs' && <TrackList tracks={data.songs} />}
          {tab === 'videos' && <TrackList tracks={data.videos} showAlbum={false} />}
          {tab === 'podcasts' && (
            <>
              {data.podcasts.length > 0 && (
                <Grid>
                  {data.podcasts.map((p) => (
                    <ShowCard key={p.id} show={p} />
                  ))}
                </Grid>
              )}
              {data.episodes.length > 0 && (
                <>
                  <SectionTitle>Episodes</SectionTitle>
                  <TrackList tracks={data.episodes} showAlbum={false} />
                </>
              )}
              {!data.podcasts.length && !data.episodes.length && (
                <Empty icon={<SearchIcon className="h-7 w-7" />} title="No podcasts found" />
              )}
            </>
          )}
          {tab === 'channels' &&
            (data.channels.length ? (
              <Grid>
                {data.channels.map((c) => (
                  <ShowCard key={c.id} show={c} />
                ))}
              </Grid>
            ) : (
              <Empty icon={<SearchIcon className="h-7 w-7" />} title="No channels found" />
            ))}
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
