import { useMemo } from 'react'
import { scopeSnapshot } from './data/scope'
import { useFeed } from './data/useData'
import { useScope } from './data/useScope'
import { match, usePath } from './router'
import { Home } from './screens/Home'
import { Inbox } from './screens/Inbox'
import { Chat } from './screens/Chat'
import { Desk } from './screens/Desk'
import { Missions } from './screens/Missions'
import { Placeholder } from './screens/Placeholder'
import { Shell } from './ui/Shell'
import { ButlerRail } from './ui/ButlerRail'
import { ButlerBadge, ButlerSheet } from './ui/ButlerSheet'
import { ButlerProvider } from './data/useButler'
import { LAPTOP, useMedia } from './ui/useMedia'
import { screenTab } from './ui/tabs'

const LATER: Record<string, [string, string]> = {
  mrs: ['MRs', 'Merge requests arrive with the live API.'],
  agenda: ['Agenda', 'The calendar arrives with the live API.'],
  reports: ['Reports', 'Reports arrive with the live API.'],
  missing: ['Not found', 'This page does not exist.'],
}

export function App() {
  const route = match(usePath())
  const [raw, refresh] = useFeed()
  const [scope, setScope] = useScope()
  // Every screen reads the scoped snapshot; Chat reads the whole one so a link to any session opens.
  const snap = useMemo(() => raw && scopeSnapshot(raw, scope), [raw, scope])
  const active = screenTab(route)
  const laptop = useMedia(LAPTOP)
  let body = null
  if (snap && raw) {
    if (route.tab === 'home') body = <Home snap={snap} />
    else if (route.tab === 'missions') body = <Missions snap={snap} />
    else if (route.tab === 'inbox') body = <Inbox snap={snap} refresh={refresh} />
    else if (route.tab === 'desk') body = <Desk snap={snap} refresh={refresh} />
    else if (route.tab === 'chat') body = <Chat snap={raw} refresh={refresh} target={route.target} />
    else body = <Placeholder name={LATER[route.tab][0]} note={LATER[route.tab][1]} />
  }
  // Butler rail on every laptop screen (item_176); Home keeps its own hero, so no head there.
  const home = route.tab === 'home'
  const rail = laptop && snap ? <ButlerRail snap={snap} head={!home} pinned={home} /> : null
  // Phone and Fold: a header badge and a chat sheet instead of the rail.
  const badge = !laptop && snap ? <ButlerBadge snap={snap} /> : null
  return (
    <ButlerProvider>
      <Shell active={active} snap={snap} scope={scope} setScope={setScope} rail={rail} badge={badge}>{body}</Shell>
      {!laptop && snap && <ButlerSheet snap={snap} />}
    </ButlerProvider>
  )
}
