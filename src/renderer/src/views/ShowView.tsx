import { useState } from 'react'
import { Play, ChevronDown, Download } from 'lucide-react'
import type { ShowKind } from '@shared/types'
import { useCached } from '../lib/useCached'
import { TrackList } from '../components/TrackList'
import { ShowFollowButton } from '../components/ShowFollowButton'
import { Button, Cover, Skeleton, Spinner, Empty } from '../components/ui'
import { Page, ListSkeleton, ErrorState } from './common'
import { player, fromRef } from '../store/player'
import { download } from '../store/downloads'
import { DropdownMenu } from '../components/menus'

const PAGE = 100

/** A podcast or YouTube channel: newest episodes first, with Follow for auto-downloads. */
export function ShowView({ kind, id }: { kind: ShowKind; id: string }): React.JSX.Element {
  const [limit, setLimit] = useState(PAGE)
  const [showAbout, setShowAbout] = useState(false)
  const { data, error, loading, reload } = useCached(`show:${kind}:${id}:${limit}`, () =>
    window.api.search.show(kind, id, limit)
  )
  // Keep showing the previous page while more episodes load.
  const prev = useCached(limit > PAGE ? `show:${kind}:${id}:${limit - PAGE}` : null, () =>
    window.api.search.show(kind, id, limit - PAGE)
  )
  const shown = data ?? prev.data

  if (error && !shown)
    return (
      <Page>
        <ErrorState error={error} retry={reload} />
      </Page>
    )

  const round = kind === 'channel'
  return (
    <Page>
      <div className="flex items-end gap-8 pb-8 pt-4">
        {!shown ? (
          <>
            <Skeleton className={round ? 'h-48 w-48 rounded-full' : 'h-48 w-48 rounded-xl'} />
            <div className="flex flex-1 flex-col gap-3">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-12 w-2/3" />
              <Skeleton className="h-4 w-1/3" />
            </div>
          </>
        ) : (
          <>
            <Cover
              src={shown.thumbnail}
              size={192}
              rounded={round ? 'full' : 'lg'}
              className="shadow-2xl"
            />
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-semibold uppercase tracking-wider text-muted">
                {round ? 'Channel' : 'Podcast'}
              </div>
              <h1 className="mt-2 line-clamp-2 text-5xl font-black tracking-tight">
                {shown.title}
              </h1>
              <div className="mt-3 text-muted">
                {[
                  shown.author && shown.author !== shown.title ? shown.author : '',
                  shown.total != null ? `${shown.total.toLocaleString()} episodes` : ''
                ]
                  .filter(Boolean)
                  .join(' • ') || (round ? 'Latest uploads' : '')}
              </div>
              <div className="mt-6 flex flex-wrap gap-3">
                <Button
                  variant="primary"
                  size="lg"
                  icon={<Play className="h-5 w-5 fill-current" />}
                  disabled={!shown.episodes.length}
                  onClick={() => player.playList(shown.episodes.map(fromRef))}
                >
                  Play latest
                </Button>
                <DropdownMenu
                  actions={() => {
                    const eps = shown.episodes
                    const batch = shown.title
                    const plural = (n: number): string => `${n} episode${n === 1 ? '' : 's'}`
                    return [
                      {
                        label: 'Latest episode',
                        onSelect: () => void download(eps.slice(0, 1), batch)
                      },
                      ...(eps.length > 1
                        ? [
                            {
                              label: `Latest ${plural(Math.min(10, eps.length))}`,
                              onSelect: () => void download(eps.slice(0, 10), batch)
                            }
                          ]
                        : []),
                      ...(eps.length > 10
                        ? [
                            {
                              label: `All ${plural(eps.length)} shown`,
                              onSelect: () => void download(eps, batch)
                            }
                          ]
                        : [])
                    ]
                  }}
                >
                  <Button
                    size="lg"
                    disabled={!shown.episodes.length}
                    icon={<Download className="h-4 w-4" />}
                  >
                    Download
                    <ChevronDown className="-mr-1 h-4 w-4" />
                  </Button>
                </DropdownMenu>
                <ShowFollowButton
                  show={{
                    kind,
                    id,
                    title: shown.title,
                    thumbnail: shown.thumbnail,
                    author: shown.author
                  }}
                />
              </div>
            </div>
          </>
        )}
      </div>

      {shown?.description && (
        <div className="mb-6">
          <button
            className="flex items-center gap-1 text-[13px] font-semibold text-muted hover:text-fg"
            onClick={() => setShowAbout(!showAbout)}
          >
            About <ChevronDown className={showAbout ? 'h-4 w-4 rotate-180' : 'h-4 w-4'} />
          </button>
          {showAbout && (
            <p className="mt-2 max-w-3xl whitespace-pre-line text-[14px] leading-relaxed text-muted select-text">
              {shown.description}
            </p>
          )}
        </div>
      )}

      {!shown ? (
        <ListSkeleton />
      ) : shown.episodes.length === 0 ? (
        <Empty icon={<Play className="h-7 w-7" />} title="No episodes yet" />
      ) : (
        <>
          <h2 className="mb-2 text-xl font-bold">{round ? 'Latest uploads' : 'Episodes'}</h2>
          <TrackList tracks={shown.episodes} showAlbum={false} />
          {shown.hasMore && (
            <div className="mt-4 flex justify-center">
              <Button
                disabled={loading}
                icon={loading ? <Spinner /> : undefined}
                onClick={() => setLimit(limit + PAGE)}
              >
                {loading ? 'Loading…' : 'Load more'}
              </Button>
            </div>
          )}
        </>
      )}
    </Page>
  )
}
