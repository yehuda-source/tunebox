import { forwardRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react'
import * as RSlider from '@radix-ui/react-slider'
import { Music, Loader2 } from 'lucide-react'
import { cn } from '../lib/format'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'

export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: Variant
    icon?: ReactNode
    size?: 'sm' | 'md' | 'lg'
  }
>(function Button({ variant = 'secondary', icon, size = 'md', className, children, ...rest }, ref) {
  return (
    <button
      ref={ref}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-full font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none whitespace-nowrap',
        size === 'sm' && 'h-8 px-3 text-[13px]',
        size === 'md' && 'h-9 px-4 text-sm',
        size === 'lg' && 'h-11 px-6 text-[15px]',
        variant === 'primary' && 'bg-accent text-accent-fg hover:brightness-110',
        variant === 'secondary' && 'bg-elev text-fg hover:bg-hover border border-line',
        variant === 'ghost' && 'text-muted hover:text-fg hover:bg-hover',
        variant === 'danger' && 'bg-danger/15 text-danger hover:bg-danger/25',
        className
      )}
      {...rest}
    >
      {icon}
      {children}
    </button>
  )
})

export const IconButton = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & { label: string; active?: boolean; size?: number }
>(function IconButton({ label, active, size = 32, className, children, ...rest }, ref) {
  return (
    <button
      ref={ref}
      title={label}
      aria-label={label}
      style={{ width: size, height: size }}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full transition-colors disabled:opacity-40 disabled:pointer-events-none',
        active ? 'text-accent' : 'text-muted hover:text-fg',
        'hover:bg-hover',
        className
      )}
      {...rest}
    >
      {children}
    </button>
  )
})

export function Cover({
  src,
  size = 48,
  rounded = 'md',
  className
}: {
  src?: string
  size?: number | string
  rounded?: 'md' | 'lg' | 'full'
  className?: string
}): React.JSX.Element {
  // Image hosts fail now and then; retry twice before showing the placeholder.
  const [state, setState] = useState<{ src?: string; attempt: number; failed: boolean }>({
    attempt: 0,
    failed: false
  })
  const current = state.src === src ? state : { src, attempt: 0, failed: false }
  const show = src && !current.failed
  return (
    <div
      className={cn(
        'relative shrink-0 overflow-hidden bg-elev flex items-center justify-center text-faint',
        rounded === 'md' && 'rounded-md',
        rounded === 'lg' && 'rounded-xl',
        rounded === 'full' && 'rounded-full',
        className
      )}
      style={{ width: size, height: size }}
    >
      {show ? (
        <img
          key={current.attempt}
          src={src}
          alt=""
          loading="lazy"
          draggable={false}
          className="h-full w-full object-cover"
          onError={() => {
            if (current.attempt < 2) {
              setTimeout(
                () => setState({ src, attempt: current.attempt + 1, failed: false }),
                1500 * (current.attempt + 1)
              )
            } else setState({ src, attempt: current.attempt, failed: true })
          }}
        />
      ) : (
        <Music className="w-2/5 h-2/5" />
      )}
    </div>
  )
}

export function Slider({
  value,
  max,
  onChange,
  onCommit,
  className,
  label
}: {
  value: number
  max: number
  onChange: (v: number) => void
  onCommit?: (v: number) => void
  className?: string
  label: string
}): React.JSX.Element {
  return (
    <RSlider.Root
      className={cn('group relative flex h-4 touch-none select-none items-center', className)}
      value={[Math.min(value, max)]}
      max={max || 1}
      step={max > 10 ? 0.1 : 0.01}
      onValueChange={(v) => onChange(v[0])}
      onValueCommit={(v) => onCommit?.(v[0])}
      aria-label={label}
    >
      <RSlider.Track className="relative h-1 grow overflow-hidden rounded-full bg-line">
        <RSlider.Range className="absolute h-full rounded-full bg-fg group-hover:bg-accent" />
      </RSlider.Track>
      <RSlider.Thumb className="block h-3 w-3 rounded-full bg-fg opacity-0 shadow group-hover:opacity-100 focus:opacity-100 outline-none" />
    </RSlider.Root>
  )
}

export function ProgressBar({
  value,
  className
}: {
  value: number
  className?: string
}): React.JSX.Element {
  return (
    <div className={cn('h-1 w-full overflow-hidden rounded-full bg-line', className)}>
      <div
        className="h-full rounded-full bg-accent transition-[width] duration-300"
        style={{ width: `${Math.round(value * 100)}%` }}
      />
    </div>
  )
}

export function ProgressRing({
  value,
  size = 22
}: {
  value: number
  size?: number
}): React.JSX.Element {
  const r = (size - 4) / 2
  const c = 2 * Math.PI * r
  return (
    <svg width={size} height={size} className="-rotate-90">
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="var(--line)"
        strokeWidth="2.5"
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="var(--accent)"
        strokeWidth="2.5"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - Math.max(0.03, value))}
        strokeLinecap="round"
        className="transition-[stroke-dashoffset] duration-300"
      />
    </svg>
  )
}

export const Spinner = ({ className }: { className?: string }): React.JSX.Element => (
  <Loader2 className={cn('animate-spin', className ?? 'h-4 w-4')} />
)

export function Skeleton({ className }: { className?: string }): React.JSX.Element {
  return <div className={cn('skeleton rounded-md', className)} />
}

export function Empty({
  icon,
  title,
  children
}: {
  icon: ReactNode
  title: string
  children?: ReactNode
}): React.JSX.Element {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-elev text-faint">
        {icon}
      </div>
      <div className="text-lg font-semibold">{title}</div>
      {children && <div className="max-w-md text-muted">{children}</div>}
    </div>
  )
}

export function Eq({ paused }: { paused?: boolean }): React.JSX.Element {
  return (
    <span className={cn('eq inline-flex items-end', paused && 'paused')}>
      <span />
      <span />
      <span />
    </span>
  )
}

export function SectionTitle({
  children,
  action
}: {
  children: ReactNode
  action?: ReactNode
}): React.JSX.Element {
  return (
    <div className="mb-3 mt-8 flex items-end justify-between">
      <h2 className="text-xl font-bold tracking-tight">{children}</h2>
      {action}
    </div>
  )
}

export function Tabs<T extends string>({
  tabs,
  value,
  onChange
}: {
  tabs: { id: T; label: string; count?: number }[]
  value: T
  onChange: (v: T) => void
}): React.JSX.Element {
  return (
    <div className="flex gap-2">
      {tabs.map((t) => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className={cn(
            'h-8 rounded-full px-4 text-[13px] font-medium transition-colors',
            value === t.id ? 'bg-fg text-bg' : 'bg-elev text-fg hover:bg-hover'
          )}
        >
          {t.label}
          {t.count != null && <span className="ml-1.5 opacity-60">{t.count}</span>}
        </button>
      ))}
    </div>
  )
}
