import { useState, type ReactNode } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import type { LibraryTrack, TagEdit } from '@shared/types'
import { useDialog, type DialogRequest } from '../store/dialogs'
import { Button } from './ui'
import { toast } from '../store/toast'

const inputCls =
  'h-10 w-full rounded-lg border border-line bg-elev px-3 text-fg outline-none placeholder:text-faint focus:border-accent'

function Field({ label, children }: { label: string; children: ReactNode }): React.JSX.Element {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-medium uppercase tracking-wide text-muted">{label}</span>
      {children}
    </label>
  )
}

function TagsForm({ track, done }: { track: LibraryTrack; done: () => void }): React.JSX.Element {
  const [t, setT] = useState<TagEdit>({
    title: track.title,
    artist: track.artist,
    album: track.album,
    albumArtist: track.albumArtist,
    trackNumber: track.trackNumber,
    year: track.year
  })
  const [saving, setSaving] = useState(false)
  const field = (
    k: keyof TagEdit
  ): { value: string | number; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void } => ({
    value: t[k] ?? '',
    onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
      setT({
        ...t,
        [k]: k === 'trackNumber' ? (e.target.value ? Number(e.target.value) : null) : e.target.value
      })
  })
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={async (e) => {
        e.preventDefault()
        setSaving(true)
        try {
          await window.api.library.editTags(track.id, { ...t, year: t.year || null })
          toast.success('Tags saved')
          done()
        } catch (err) {
          toast.error('Could not save tags', err)
        } finally {
          setSaving(false)
        }
      }}
    >
      <Field label="Title">
        <input className={inputCls} {...field('title')} autoFocus />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Artist">
          <input className={inputCls} {...field('artist')} />
        </Field>
        <Field label="Album artist">
          <input className={inputCls} {...field('albumArtist')} />
        </Field>
      </div>
      <Field label="Album">
        <input className={inputCls} {...field('album')} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Track #">
          <input className={inputCls} type="number" min={0} {...field('trackNumber')} />
        </Field>
        <Field label="Year">
          <input className={inputCls} {...field('year')} />
        </Field>
      </div>
      <div className="truncate text-xs text-faint" title={track.path}>
        {track.path}
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={done}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </form>
  )
}

function PromptForm({
  req,
  close
}: {
  req: Extract<DialogRequest, { kind: 'prompt' }>
  close: (v: string | null) => void
}): React.JSX.Element {
  const [value, setValue] = useState(req.initial ?? '')
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        if (value.trim()) close(value.trim())
      }}
      className="flex flex-col gap-4"
    >
      <Dialog.Title className="text-lg font-semibold">{req.title}</Dialog.Title>
      <Field label={req.label ?? 'Name'}>
        <input
          className={inputCls}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          autoFocus
        />
      </Field>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={() => close(null)}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" disabled={!value.trim()}>
          Save
        </Button>
      </div>
    </form>
  )
}

export function DialogHost(): React.JSX.Element {
  const req = useDialog((s) => s.req)

  const close = (result?: unknown): void => {
    if (!req) return
    if (req.kind === 'prompt') req.resolve((result as string | null) ?? null)
    else if (req.kind === 'confirm') req.resolve(Boolean(result))
    else req.resolve()
    useDialog.setState({ req: null })
  }

  return (
    <Dialog.Root open={!!req} onOpenChange={(o) => !o && close()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[85dvh] w-[min(480px,92vw)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-line bg-panel p-6 shadow-2xl outline-none">
          {req?.kind === 'prompt' && <PromptForm key={req.title} req={req} close={close} />}
          {req?.kind === 'confirm' && (
            <div className="flex flex-col gap-4">
              <Dialog.Title className="text-lg font-semibold">{req.title}</Dialog.Title>
              <Dialog.Description asChild>
                <div className="text-muted">{req.body}</div>
              </Dialog.Description>
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => close(false)}>
                  Cancel
                </Button>
                <Button
                  variant={req.danger ? 'danger' : 'primary'}
                  onClick={() => close(true)}
                  autoFocus
                >
                  {req.confirm}
                </Button>
              </div>
            </div>
          )}
          {req?.kind === 'tags' && (
            <div className="flex flex-col gap-4">
              <Dialog.Title className="text-lg font-semibold">Edit tags</Dialog.Title>
              <TagsForm track={req.track} done={() => close()} />
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
