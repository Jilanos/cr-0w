import type { ReactNode } from 'react'

export type TabKey = 'home' | 'desk' | 'ops' | 'inbox' | 'mrs' | 'agenda' | 'reports'

export const TABS: Array<{ key: TabKey; label: string; path: string; icon: ReactNode }> = [
  { key: 'home', label: 'Home', path: '/', icon: <path d="M3 10 11 3l8 7v9h-5v-6H8v6H3Z" /> },
  { key: 'desk', label: 'Desk', path: '/desk', icon: <><rect x="2.5" y="4" width="17" height="13" rx="2" /><path d="M6 9l3 2-3 2M11 14h5" /></> },
  { key: 'ops', label: 'Ops', path: '/ops', icon: <><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="12" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="12" width="7" height="7" rx="1.5" /><rect x="12" y="12" width="7" height="7" rx="1.5" /></> },
  { key: 'inbox', label: 'Inbox', path: '/inbox', icon: <><path d="M3 12 5.5 4h11L19 12v6H3Z" /><path d="M3 12h5l1 2h4l1-2h5" /></> },
  { key: 'mrs', label: 'MRs', path: '/mrs', icon: <><circle cx="6" cy="5" r="2" /><circle cx="6" cy="17" r="2" /><circle cx="16" cy="17" r="2" /><path d="M6 7v8M16 15V9a3 3 0 0 0-3-3h-3" /></> },
  { key: 'agenda', label: 'Agenda', path: '/agenda', icon: <><rect x="3" y="4.5" width="16" height="14.5" rx="2" /><path d="M3 9h16M7.5 2.5v4M14.5 2.5v4" /></> },
  { key: 'reports', label: 'Reports', path: '/reports', icon: <><path d="M5 2.5h8l4 4v13H5Z" /><path d="M13 2.5v4h4M8 11h6M8 14.5h6" /></> },
]

// Phone tab bar B (item_206): three outlined dots open the More sheet.
export const MORE_ICON: ReactNode = <><circle cx="5" cy="11" r="1.8" /><circle cx="11" cy="11" r="1.8" /><circle cx="17" cy="11" r="1.8" /></>

// Scope chip icons (item_206 header A): all = stacked layers, work = briefcase, perso = person.
export const SCOPE_ICONS: Record<'all' | 'work' | 'perso', ReactNode> = {
  all: <><path d="M11 3 19 7.5 11 12 3 7.5Z" /><path d="M3 11.5 11 16l8-4.5M3 15.5 11 20l8-4.5" /></>,
  work: <><rect x="3" y="7" width="16" height="11.5" rx="2" /><path d="M8 7V5.5A1.5 1.5 0 0 1 9.5 4h3A1.5 1.5 0 0 1 14 5.5V7M3 12h16" /></>,
  perso: <><circle cx="11" cy="7.5" r="3.5" /><path d="M4 19c.8-3.6 3.6-5.5 7-5.5s6.2 1.9 7 5.5" /></>,
}

export function TabIcon({ children }: { children: ReactNode }) {
  return (
    <svg aria-hidden="true" width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round">
      {children}
    </svg>
  )
}
