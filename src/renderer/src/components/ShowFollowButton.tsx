import { useState } from 'react'
import { BellPlus, BellRing } from 'lucide-react'
import type { ShowRef } from '@shared/types'
import { useFollows, toggleFollowShow } from '../store/follows'
import { Button, Spinner } from './ui'
import { platform } from '../lib/platform'

export function ShowFollowButton({ show }: { show: ShowRef }): React.JSX.Element | null {
  // Following (auto-downloads) isn't in the phone app yet.
  return platform.phone ? null : <DesktopShowFollowButton show={show} />
}

function DesktopShowFollowButton({ show }: { show: ShowRef }): React.JSX.Element {
  const following = useFollows((s) => s.ids.has(show.id))
  const [busy, setBusy] = useState(false)
  return (
    <Button
      size="lg"
      variant={following ? 'secondary' : 'ghost'}
      className={following ? 'text-accent' : 'border border-line'}
      title={
        following
          ? 'New episodes download automatically. Click to unfollow.'
          : 'Download new episodes automatically'
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
        await toggleFollowShow(show)
        setBusy(false)
      }}
    >
      {following ? 'Following' : 'Follow'}
    </Button>
  )
}
