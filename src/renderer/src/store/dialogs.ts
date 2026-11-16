import type { ReactNode } from 'react'
import { create } from 'zustand'
import type { LibraryTrack } from '@shared/types'

export type DialogRequest =
  | {
      kind: 'prompt'
      title: string
      label?: string
      initial?: string
      resolve: (v: string | null) => void
    }
  | {
      kind: 'confirm'
      title: string
      body: ReactNode
      confirm: string
      danger?: boolean
      resolve: (v: boolean) => void
    }
  | { kind: 'tags'; track: LibraryTrack; resolve: () => void }

export const useDialog = create<{ req: DialogRequest | null }>(() => ({ req: null }))

export const dialogs = {
  prompt: (title: string, initial = '', label?: string): Promise<string | null> =>
    new Promise((resolve) =>
      useDialog.setState({ req: { kind: 'prompt', title, initial, label, resolve } })
    ),
  confirm: (
    title: string,
    body: ReactNode,
    confirm = 'Confirm',
    danger = false
  ): Promise<boolean> =>
    new Promise((resolve) =>
      useDialog.setState({ req: { kind: 'confirm', title, body, confirm, danger, resolve } })
    ),
  editTags: (track: LibraryTrack): Promise<void> =>
    new Promise((resolve) => useDialog.setState({ req: { kind: 'tags', track, resolve } }))
}
