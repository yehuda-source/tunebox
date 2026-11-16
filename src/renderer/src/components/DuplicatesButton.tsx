import { useState } from 'react'
import { CopyX } from 'lucide-react'
import { Button, Spinner } from './ui'
import { dialogs } from '../store/dialogs'
import { toast } from '../store/toast'

/** Finds songs stored more than once and, after confirmation, trashes the extra copies. */
export function DuplicatesButton(): React.JSX.Element {
  const [busy, setBusy] = useState(false)

  const run = async (): Promise<void> => {
    setBusy(true)
    try {
      const groups = await window.api.library.duplicates()
      const extras = groups.reduce((n, g) => n + g.extras.length, 0)
      if (!extras) {
        toast.success('No duplicates', 'Every song is in your library only once.')
        return
      }
      const examples = groups.slice(0, 5)
      const ok = await dialogs.confirm(
        `Remove ${extras} duplicate${extras === 1 ? '' : 's'}?`,
        <div className="flex flex-col gap-3">
          <p>
            {groups.length} song{groups.length === 1 ? ' is' : 's are'} stored more than once,
            usually because they appear on several albums or compilations. The first copy you
            downloaded is kept; the others move to the system trash, and playlists switch to the
            kept copy.
          </p>
          <ul className="flex flex-col gap-1 rounded-lg bg-elev p-3 text-[13px]">
            {examples.map((g) => (
              <li key={g.keep.id} className="truncate">
                <span className="text-fg">{g.keep.title}</span> — keeping{' '}
                <span className="text-fg">{g.keep.album}</span>, removing{' '}
                {g.extras.map((e) => e.album).join(', ')}
              </li>
            ))}
            {groups.length > examples.length && (
              <li>…and {groups.length - examples.length} more</li>
            )}
          </ul>
        </div>,
        'Move to trash',
        true
      )
      if (!ok) return
      let { removed, failed } = await window.api.library.removeDuplicates()
      let permanent = false
      if (failed) {
        // Usually a drive without a trash folder (USB or Windows-formatted drives).
        permanent = await dialogs.confirm(
          `Delete ${failed} cop${failed === 1 ? 'y' : 'ies'} permanently?`,
          'They couldn’t be moved to the trash, probably because the drive your music is on has no trash folder. Deleting them permanently can’t be undone. The kept copy of each song stays.',
          'Delete permanently',
          true
        )
        if (permanent) {
          const second = await window.api.library.removeDuplicates(true)
          removed += second.removed
          failed = second.failed
        }
      }
      if (removed) {
        toast.success(
          `Removed ${removed} duplicate${removed === 1 ? '' : 's'}`,
          permanent ? undefined : 'You can restore them from the system trash.'
        )
      }
      if (failed) {
        toast.error(
          `${failed} duplicate${failed === 1 ? '' : 's'} could not be removed`,
          'See the log in Settings → About.'
        )
      }
    } catch (err) {
      toast.error('Could not remove duplicates', err)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Button
      size="sm"
      icon={busy ? <Spinner /> : <CopyX className="h-3.5 w-3.5" />}
      disabled={busy}
      onClick={run}
    >
      Find duplicates
    </Button>
  )
}
