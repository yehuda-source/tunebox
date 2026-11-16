import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Search, X } from 'lucide-react'
import { useNav, go } from '../store/nav'
import { useApp } from '../store/app'
import { downloadUrl } from '../store/downloads'
import { IconButton } from './ui'
import { cn } from '../lib/format'

export function TopBar(): React.JSX.Element {
  const { route, index, stack, back, forward } = useNav()
  const [q, setQ] = useState(route.name === 'search' ? route.q : '')
  const [suggestions, setSuggestions] = useState<{ q: string; list: string[] }>({ q: '', list: [] })
  const [open, setOpen] = useState(false)
  const [sel, setSel] = useState(-1)
  const input = useRef<HTMLInputElement>(null)

  // Follow the route when navigating to a different search.
  const [prevRoute, setPrevRoute] = useState(route)
  if (route !== prevRoute) {
    setPrevRoute(route)
    if (route.name === 'search') setQ(route.q)
  }

  const wantSuggestions = q.trim() !== '' && !/^https?:/.test(q)
  useEffect(() => {
    if (!wantSuggestions) return
    const t = setTimeout(() => {
      void window.api.search.suggest(q).then((list) => setSuggestions({ q, list }))
    }, 180)
    return () => clearTimeout(t)
  }, [q, wantSuggestions])
  const shown = wantSuggestions ? suggestions.list : []

  const submit = (value: string): void => {
    const v = value.trim()
    if (!v) return
    setOpen(false)
    input.current?.blur()
    if (/^https?:\/\//.test(v)) {
      setQ('')
      go({ name: 'downloads' })
      void downloadUrl(v)
    } else go({ name: 'search', q: v })
  }

  return (
    <header className="flex h-16 shrink-0 items-center gap-3 px-6">
      <IconButton label="Back (Alt+←)" onClick={back} disabled={index === 0} className="bg-elev">
        <ChevronLeft className="h-5 w-5" />
      </IconButton>
      <IconButton
        label="Forward (Alt+→)"
        onClick={forward}
        disabled={index >= stack.length - 1}
        className="bg-elev"
      >
        <ChevronRight className="h-5 w-5" />
      </IconButton>
      <div className="relative w-full max-w-xl">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
        <input
          id="global-search"
          ref={input}
          value={q}
          onChange={(e) => {
            setQ(e.target.value)
            setOpen(true)
            setSel(-1)
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              setSel((s) => Math.min(s + 1, shown.length - 1))
            } else if (e.key === 'ArrowUp') {
              e.preventDefault()
              setSel((s) => Math.max(s - 1, -1))
            } else if (e.key === 'Enter') submit(sel >= 0 ? shown[sel] : q)
            else if (e.key === 'Escape') input.current?.blur()
          }}
          placeholder="Search songs, albums, artists — or paste a YouTube link"
          className="h-11 w-full rounded-full border border-transparent bg-elev pl-11 pr-10 text-[14px] outline-none placeholder:text-faint focus:border-line focus:bg-panel"
          spellCheck={false}
        />
        {q && (
          <button
            className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted hover:text-fg"
            onClick={() => {
              setQ('')
              input.current?.focus()
            }}
            aria-label="Clear"
          >
            <X className="h-4 w-4" />
          </button>
        )}
        {open && shown.length > 0 && (
          <div className="absolute left-0 right-0 top-12 z-30 overflow-hidden rounded-xl border border-line bg-panel p-1 shadow-2xl">
            {shown.map((s, i) => (
              <button
                key={s}
                onMouseDown={(e) => {
                  e.preventDefault()
                  setQ(s)
                  submit(s)
                }}
                className={cn(
                  'flex h-9 w-full items-center gap-3 rounded-lg px-3 text-left text-[14px]',
                  i === sel ? 'bg-hover' : 'hover:bg-hover'
                )}
              >
                <Search className="h-3.5 w-3.5 text-faint" />
                {s}
              </button>
            ))}
          </div>
        )}
      </div>
      <button
        onClick={() => useApp.setState({ paletteOpen: true })}
        className="ml-auto flex h-9 shrink-0 items-center gap-2 whitespace-nowrap rounded-full border border-line px-3 text-[13px] text-muted hover:bg-hover hover:text-fg"
        title="Command palette"
      >
        Ctrl K
      </button>
    </header>
  )
}
