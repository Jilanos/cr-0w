import type { ChatTarget } from './data/conversation'
import { createContext, useContext, useEffect, useState, type AnchorHTMLAttributes, type MouseEvent } from 'react'

const PathContext = createContext('/')
const SearchContext = createContext('')
export const usePath = () => useContext(PathContext)
// Query string of the current route (e.g. ?project= on Ops).
export const useQuery = () => new URLSearchParams(useContext(SearchContext))

export function navigate(to: string) {
  if (to === location.pathname + location.search) return
  history.pushState(null, '', to)
  dispatchEvent(new PopStateEvent('popstate'))
}

// Old Missions links (/missions, /missions/<id>) land on Ops (item_190), the query kept.
export function redirect(path: string): string | null {
  return /^\/missions(\/[^/]+)?\/?$/.test(path) ? '/ops' : null
}

const fixUrl = () => {
  const to = redirect(location.pathname)
  if (to) history.replaceState(null, '', to + location.search)
}

export function Router({ children }: { children: React.ReactNode }) {
  fixUrl()
  const [path, setPath] = useState(location.pathname)
  const [search, setSearch] = useState(location.search)
  useEffect(() => {
    const on = () => {
      fixUrl()
      setPath(location.pathname)
      setSearch(location.search)
      document.querySelector('.main')?.scrollTo(0, 0)
    }
    addEventListener('popstate', on)
    return () => removeEventListener('popstate', on)
  }, [])
  return <PathContext.Provider value={path}><SearchContext.Provider value={search}>{children}</SearchContext.Provider></PathContext.Provider>
}

// A real <a href> that routes in place on a plain click.
export function Link({ href, onClick, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) {
  const click = (e: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(e)
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
    e.preventDefault()
    navigate(href)
  }
  return <a href={href} onClick={click} {...rest} />
}

export type Route =
  | { tab: 'home' | 'desk' | 'ops' | 'inbox' | 'mrs' | 'agenda' | 'reports' }
  | { tab: 'chat'; target: ChatTarget }
  | { tab: 'missing' }

export function match(path: string): Route {
  const p = path.replace(/\/+$/, '') || '/'
  if (p === '/') return { tab: 'home' }
  const old = redirect(p)
  if (old) return match(old)
  // The chat of a live session or run (/desk/<pid>) or of a mission's last run (/desk/m/<id>).
  const c = /^\/desk\/(?:(\d+)|m\/([^/]+))$/.exec(p)
  if (c) return { tab: 'chat', target: c[1] ? { pid: Number(c[1]) } : { mission: decodeURIComponent(c[2]) } }
  const key = p.slice(1)
  if (['desk', 'ops', 'inbox', 'mrs', 'agenda', 'reports'].includes(key)) return { tab: key as 'desk' }
  return { tab: 'missing' }
}
