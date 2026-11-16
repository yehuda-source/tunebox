import { useState } from 'react'
import { Play, Download } from 'lucide-react'
import type { AlbumRef, TrackRef } from '@shared/types'
import { useCached } from '../lib/useCached'
import { TrackList } from '../components/TrackList'
import { Button, SectionTitle, Skeleton, Spinner } from '../components/ui'
import { Page, AlbumCard, Grid, GridSkeleton, ListSkeleton, ErrorState } from './common'
import { player, fromRef } from '../store/player'
import { download } from '../store/downloads'
import { dialogs } from '../store/dialogs'
import { toast } from '../store/toast'
import { FollowButton } from '../components/FollowButton'

export function ArtistView({ id }: { id: string }): React.JSX.Element {
  const { data, error, loading, reload } = useCached(`artist:${id}`, () =>
    window.api.search.artist(id)
  )
  const [showAll, setShowAll] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [bannerFailed, setBannerFailed] = useState(false)

  if (error)
    return (
      <Page>
        <ErrorState error={error} retry={reload} />
      </Page>
    )

  const downloadAll = async (): Promise<void> => {
    if (!data) return
    const releases: AlbumRef[] = [...data.albums, ...data.singles]
    const ok = await dialogs.confirm(
      `Download everything by ${data.name}?`,
      `This queues ${data.albums.length} albums and ${data.singles.length} singles & EPs. Songs already in your library are skipped.`,
      'Download all'
    )
    if (!ok) return
    const tracks: TrackRef[] = []
    try {
      for (let i = 0; i < releases.length; i++) {
        setBusy(`Loading ${i + 1}/${releases.length}…`)
        const album = await window.api.search.album(releases[i].browseId)
        tracks.push(...album.tracks)
      }
      await download(tracks, data.name)
    } catch (err) {
      toast.error('Could not load the discography', err)
    } finally {
      setBusy(null)
    }
  }

  return (
    <div>
      <div className="relative h-80 overflow-hidden">
        {data?.banner && !bannerFailed ? (
          <img
            src={data.banner}
            alt=""
            className="absolute inset-0 h-full w-full object-cover object-[center_25%]"
            draggable={false}
            onError={() => setBannerFailed(true)}
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-accent/40 to-bg" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-bg via-bg/50 to-transparent" />
        <div className="absolute bottom-0 left-0 right-0 mx-auto max-w-[1400px] px-8 pb-6">
          {loading || !data ? (
            <Skeleton className="h-16 w-96" />
          ) : (
            <>
              <h1 className="text-7xl font-black tracking-tight drop-shadow-lg">{data.name}</h1>
              {data.subtitle && <div className="mt-2 text-muted">{data.subtitle}</div>}
            </>
          )}
        </div>
      </div>
      <Page>
        {data && (
          <div className="flex gap-3 pt-6">
            <Button
              variant="primary"
              size="lg"
              icon={<Play className="h-5 w-5 fill-current" />}
              onClick={() => player.playList(data.topSongs.map(fromRef))}
              disabled={!data.topSongs.length}
            >
              Play
            </Button>
            <Button
              size="lg"
              icon={busy ? <Spinner /> : <Download className="h-4 w-4" />}
              onClick={downloadAll}
              disabled={!!busy || !(data.albums.length + data.singles.length)}
            >
              {busy ?? 'Download discography'}
            </Button>
            <FollowButton
              artist={{ channelId: data.channelId, name: data.name, thumbnail: data.thumbnail }}
            />
          </div>
        )}
        <SectionTitle
          action={
            data && data.topSongs.length > 5 ? (
              <button
                className="text-[13px] font-semibold text-muted hover:text-fg"
                onClick={() => setShowAll(!showAll)}
              >
                {showAll ? 'Show less' : 'Show all'}
              </button>
            ) : undefined
          }
        >
          Top songs
        </SectionTitle>
        {loading || !data ? (
          <ListSkeleton n={5} />
        ) : (
          <TrackList tracks={data.topSongs} limit={showAll ? undefined : 5} />
        )}

        {(loading || (data && data.albums.length > 0)) && <SectionTitle>Albums</SectionTitle>}
        {loading || !data ? (
          <GridSkeleton />
        ) : (
          <Grid>
            {data.albums.map((a) => (
              <AlbumCard key={a.browseId} album={a} />
            ))}
          </Grid>
        )}

        {data && data.singles.length > 0 && (
          <>
            <SectionTitle>Singles & EPs</SectionTitle>
            <Grid>
              {data.singles.map((a) => (
                <AlbumCard key={a.browseId} album={a} />
              ))}
            </Grid>
          </>
        )}

        {data?.description && (
          <>
            <SectionTitle>About</SectionTitle>
            <p className="max-w-3xl whitespace-pre-line leading-relaxed text-muted select-text">
              {data.description}
            </p>
          </>
        )}
      </Page>
    </div>
  )
}
