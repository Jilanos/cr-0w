import type { Route } from '../router'
import type { TabKey } from './icons'

// Phone tab bar B (item_206): four tabs plus More. More holds the rarer screens.
export const BAR_KEYS = ['home', 'desk', 'ops', 'inbox'] as const
export const MORE_KEYS = ['mrs', 'agenda', 'reports'] as const
export type BarKey = (typeof BAR_KEYS)[number] | 'more'

// The screen a route belongs to: a chat sits under Desk, an unknown page under Home.
export function screenTab(route: Route): TabKey {
  if (route.tab === 'missing') return 'home'
  if (route.tab === 'chat') return 'desk'
  return route.tab
}

// The highlighted bar tab: More while one of its screens is open.
export function barTab(active: TabKey): BarKey {
  return (MORE_KEYS as readonly TabKey[]).includes(active) ? 'more' : (active as BarKey)
}
