import { useState } from 'react'
import { BellPlus, BellRing } from 'lucide-react'
import type { ArtistRef } from '@shared/types'
import { useFollows, toggleFollow } from '../store/follows'
import { Button, Spinner } from './ui'
import { platform } from '../lib/platform'

export function FollowButton({ artist }: { artist: ArtistRef }): React.JSX.Element | null {
  // Following (auto-downloads) isn't in the phone app yet.
  return platform.phone ? null : <DesktopFollowButton artist={artist} />
}

function DesktopFollowButton({ artist }: { artist: ArtistRef }): React.JSX.Element {
  const following = useFollows((s) => s.ids.has(artist.channelId))
  const [busy, setBusy] = useState(false)
  return (
    <Button
      size="lg"
      variant={following ? 'secondary' : 'ghost'}
      className={following ? 'text-accent' : 'border border-line'}
      title={
        following
          ? 'New releases download automatically. Click to unfollow.'
          : 'Download new releases automatically'
      }
      icon={
        busy ? (
          <Spinner />
        ) : following ? (
          <BellRing className="h-4 w-4" />
        ) : (
          <BellPlus className="h-4 w-4" />
        )
      }
      disabled={busy}
      onClick={async () => {
        setBusy(true)
        await toggleFollow(artist)
        setBusy(false)
      }}
    >
      {following ? 'Following' : 'Follow'}
    </Button>
  )
}
