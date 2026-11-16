import { createContext, useContext } from 'react'

/** The main scroll container, needed by virtualized lists. */
export const ScrollContext = createContext<HTMLElement | null>(null)
export const useScrollEl = (): HTMLElement | null => useContext(ScrollContext)
