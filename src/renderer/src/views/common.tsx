import type { ReactNode } from 'react'
import { AlertTriangle } from 'lucide-react'
import type { AlbumRef, ArtistRef, ShowRef } from '@shared/types'
import { Cover, Skeleton, Button } from '../components/ui'
import { go } from '../store/nav'
import { cn, errorMessage } from '../lib/format'

export function Page({ children }: { children: ReactNode }): React.JSX.Element {
  return (
    <div className="mx-auto w-full max-w-[1400px] px-8 pb-16 max-sm:px-4 max-sm:pb-8">
      {children}
    </div>
  )
}

export function AlbumCard({ album }: { album: AlbumRef }): React.JSX.Element {
  return (
    <button
      onClick={() => go({ name: 'album', id: album.browseId })}
      className="group flex flex-col gap-2 rounded-xl p-3 text-left transition-colors hover:bg-hover"
    >
      <Cover src={album.thumbnail} size="100%" rounded="lg" className="aspect-square shadow-lg" />
      <div className="min-w-0">
        <div className="truncate font-medium">{album.title}</div>
        <div className="truncate text-[13px] text-muted">
          {[
            album.kind && album.kind[0].toUpperCase() + album.kind.slice(1),
            album.year,
            album.artist
          ]
            .filter(Boolean)
            .join(' • ')}
        </div>
      </div>
    </button>
  )
}

export function ArtistCard({ artist }: { artist: ArtistRef }): React.JSX.Element {
  return (
    <button
      onClick={() => go({ name: 'artist', id: artist.channelId })}
      className="group flex flex-col items-center gap-2 rounded-xl p-3 text-center transition-colors hover:bg-hover"
    >
      <Cover
        src={artist.thumbnail}
        size="100%"
        rounded="full"
        className="aspect-square shadow-lg"
      />
      <div className="w-full min-w-0">
        <div className="truncate font-medium">{artist.name}</div>
        <div className="truncate text-[13px] text-muted">
          {artist.subtitle?.split('•').slice(1).join('•').trim() || 'Artist'}
        </div>
      </div>
    </button>
  )
}

/** A podcast (square) or YouTube channel (round) in search results. */
export function ShowCard({ show }: { show: ShowRef }): React.JSX.Element {
  const round = show.kind === 'channel'
  return (
    <button
      onClick={() => go({ name: 'show', kind: show.kind, id: show.id })}
      className={cn(
        'group flex flex-col gap-2 rounded-xl p-3 transition-colors hover:bg-hover',
        round ? 'items-center text-center' : 'text-left'
      )}
    >
      <Cover
        src={show.thumbnail}
        size="100%"
        rounded={round ? 'full' : 'lg'}
        className="aspect-square shadow-lg"
      />
      <div className="w-full min-w-0">
        <div className="truncate font-medium">{show.title}</div>
        <div className="truncate text-[13px] text-muted">
          {[round ? show.subtitle : 'Podcast', round ? '' : show.author]
            .filter(Boolean)
            .join(' • ')}
        </div>
      </div>
    </button>
  )
}

export const Grid = ({ children }: { children: ReactNode }): React.JSX.Element => (
  <div className="grid grid-cols-[repeat(auto-fill,minmax(170px,1fr))] gap-1">{children}</div>
)

export function GridSkeleton({ n = 6, round }: { n?: number; round?: boolean }): React.JSX.Element {
  return (
    <Grid>
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className="flex flex-col gap-2 p-3">
          <Skeleton className={round ? 'aspect-square rounded-full' : 'aspect-square rounded-xl'} />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      ))}
    </Grid>
  )
}

export function ListSkeleton({ n = 8 }: { n?: number }): React.JSX.Element {
  return (
    <div className="flex flex-col gap-1">
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className="flex h-14 items-center gap-3 px-3">
          <Skeleton className="h-10 w-10" />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-3.5 w-1/3" />
            <Skeleton className="h-3 w-1/5" />
          </div>
        </div>
      ))}
    </div>
  )
}

export function ErrorState({
  error,
  retry
}: {
  error: unknown
  retry: () => void
}): React.JSX.Element {
  return (
    <div className="mt-10 flex flex-col items-center gap-3 rounded-2xl border border-line bg-panel p-10 text-center">
      <AlertTriangle className="h-8 w-8 text-danger" />
      <div className="text-lg font-semibold">Something went wrong</div>
      <div className="max-w-lg text-muted select-text">{errorMessage(error)}</div>
      <Button onClick={retry}>Try again</Button>
    </div>
  )
}
