import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Clock, Search, X } from 'lucide-react'
import { useNav, go } from '../store/nav'
import { useApp } from '../store/app'
import { downloadUrl } from '../store/downloads'
import { IconButton } from './ui'
import { cn } from '../lib/format'
import { platform } from '../lib/platform'
import {
  useRecentSearches,
  matchRecent,
  removeRecentSearch,
  clearRecentSearches
} from '../store/recentSearches'

export function TopBar(): React.JSX.Element {
  const { route, index, stack, back, forward } = useNav()
  const [q, setQ] = useState(route.name === 'search' ? route.q : '')
  const [suggestions, setSuggestions] = useState<{ q: string; list: string[] }>({ q: '', list: [] })
  const [open, setOpen] = useState(false)
  const [sel, setSel] = useState(-1)
  const input = useRef<HTMLInputElement>(null)
  // Closing on blur is delayed so clicks in the dropdown land; refocusing must cancel it.
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

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
  const recentAll = useRecentSearches((st) => st.list)
  // Matching recent searches first, then YouTube's suggestions (without repeats).
  const recent = matchRecent(recentAll, q, q.trim() ? 4 : 8)
  const seen = new Set(recent.map((r) => r.toLowerCase()))
  const suggested = (wantSuggestions ? suggestions.list : [])
    .filter((x) => !seen.has(x.toLowerCase()))
    .slice(0, Math.max(0, 8 - recent.length))
  const items: { text: string; recent: boolean }[] = [
    ...recent.map((text) => ({ text, recent: true })),
    ...suggested.map((text) => ({ text, recent: false }))
  ]
  const shown = items.map((i) => i.text)

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
    <header
      className={cn(
        'flex shrink-0 items-center',
        platform.phone ? 'h-14 gap-2 px-3' : 'h-16 gap-3 px-6'
      )}
    >
      {(!platform.phone || index > 0) && (
        <IconButton
          label="Back (Alt+←)"
          onClick={back}
          disabled={index === 0}
          size={platform.phone ? 40 : 32}
          className="bg-elev"
        >
          <ChevronLeft className="h-5 w-5" />
        </IconButton>
      )}
      {!platform.phone && (
        <IconButton
          label="Forward (Alt+→)"
          onClick={forward}
          disabled={index >= stack.length - 1}
          className="bg-elev"
        >
          <ChevronRight className="h-5 w-5" />
        </IconButton>
      )}
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
          onFocus={() => {
            if (closeTimer.current) clearTimeout(closeTimer.current)
            setOpen(true)
          }}
          onBlur={() => {
            closeTimer.current = setTimeout(() => setOpen(false), 120)
          }}
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
          placeholder={
            platform.phone
              ? 'Search or paste a YouTube link'
              : 'Search songs, albums, artists — or paste a YouTube link'
          }
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
        {open && items.length > 0 && (
          <div className="absolute left-0 right-0 top-12 z-30 overflow-hidden rounded-xl border border-line bg-panel p-1 shadow-2xl">
            {!q.trim() && (
              <div className="flex items-center justify-between px-3 pb-1 pt-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-faint">
                  Recent searches
                </span>
                <button
                  className="text-xs text-muted hover:text-fg"
                  onMouseDown={(e) => {
                    e.preventDefault()
                    clearRecentSearches()
                  }}
                >
                  Clear
                </button>
              </div>
            )}
            {items.map((item, i) => (
              <div
                key={`${item.recent ? 'r' : 's'}:${item.text}`}
                role="option"
                aria-selected={i === sel}
                onMouseDown={(e) => {
                  e.preventDefault()
                  setQ(item.text)
                  submit(item.text)
                }}
                className={cn(
                  'group flex h-9 w-full cursor-default items-center gap-3 rounded-lg px-3 text-left text-[14px]',
                  i === sel ? 'bg-hover' : 'hover:bg-hover'
                )}
              >
                {item.recent ? (
                  <Clock className="h-3.5 w-3.5 shrink-0 text-faint" />
                ) : (
                  <Search className="h-3.5 w-3.5 shrink-0 text-faint" />
                )}
                <span className="min-w-0 flex-1 truncate">{item.text}</span>
                {item.recent && (
                  <button
                    aria-label={`Remove “${item.text}” from recent searches`}
                    title="Remove"
                    className="rounded-full p-0.5 text-faint opacity-0 hover:text-fg group-hover:opacity-100"
                    onMouseDown={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      removeRecentSearch(item.text)
                      setSel(-1)
                    }}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
      {!platform.phone && (
        <button
          onClick={() => useApp.setState({ paletteOpen: true })}
          className="ml-auto flex h-9 shrink-0 items-center gap-2 whitespace-nowrap rounded-full border border-line px-3 text-[13px] text-muted hover:bg-hover hover:text-fg"
          title="Command palette"
        >
          Ctrl K
        </button>
      )}
    </header>
  )
}
