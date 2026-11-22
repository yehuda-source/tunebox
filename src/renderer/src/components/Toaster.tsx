import { useState } from 'react'
import { CheckCircle2, Info, AlertTriangle, X } from 'lucide-react'
import { useToasts, type Toast } from '../store/toast'
import { cn } from '../lib/format'

function Item({ t }: { t: Toast }): React.JSX.Element {
  const dismiss = useToasts((s) => s.dismiss)
  const [open, setOpen] = useState(t.kind !== 'error')
  const Icon = t.kind === 'success' ? CheckCircle2 : t.kind === 'error' ? AlertTriangle : Info
  return (
    <div className="pointer-events-auto flex w-[360px] max-w-full gap-3 rounded-xl border border-line bg-panel/95 p-3.5 shadow-2xl backdrop-blur">
      <Icon
        className={cn(
          'mt-0.5 h-5 w-5 shrink-0',
          t.kind === 'success' && 'text-ok',
          t.kind === 'error' && 'text-danger',
          t.kind === 'info' && 'text-accent'
        )}
      />
      <div className="min-w-0 flex-1">
        <div className="font-medium leading-snug">{t.title}</div>
        {t.detail && open && (
          <div className="mt-1 break-words text-[13px] text-muted select-text">{t.detail}</div>
        )}
        {t.detail && !open && (
          <button
            className="mt-1 text-[13px] text-accent hover:underline"
            onClick={() => setOpen(true)}
          >
            Details
          </button>
        )}
      </div>
      <button
        className="h-6 w-6 shrink-0 rounded-full text-faint hover:bg-hover hover:text-fg"
        onClick={() => dismiss(t.id)}
        aria-label="Dismiss"
      >
        <X className="mx-auto h-4 w-4" />
      </button>
    </div>
  )
}

export function Toaster(): React.JSX.Element {
  const toasts = useToasts((s) => s.toasts)
  return (
    <div className="pointer-events-none fixed bottom-28 right-5 z-50 flex flex-col gap-2 max-sm:bottom-36 max-sm:left-3 max-sm:right-3 max-sm:items-center">
      {toasts.map((t) => (
        <Item key={t.id} t={t} />
      ))}
    </div>
  )
}
