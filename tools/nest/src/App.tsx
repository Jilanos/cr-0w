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

const LATER: Record<string, [string, string]> = {
  mrs: ['MRs', 'Merge requests arrive with the live API.'],
  agenda: ['Agenda', 'The calendar arrives with the live API.'],
  reports: ['Reports', 'Reports arrive with the live API.'],
  missing: ['Not found', 'This page does not exist.'],
}

export function App() {
  const route = match(usePath())
  const [raw, refresh] = useFeed()
  const [scope] = useScope()
  // Every screen reads the scoped snapshot; Chat reads the whole one so a link to any session opens.
  const snap = useMemo(() => raw && scopeSnapshot(raw, scope), [raw, scope])
  const active = route.tab === 'missing' ? 'home' : route.tab === 'chat' ? 'desk' : route.tab
  let body = null
  if (snap && raw) {
    if (route.tab === 'home') body = <Home snap={snap} />
    else if (route.tab === 'missions') body = <Missions snap={snap} />
    else if (route.tab === 'inbox') body = <Inbox snap={snap} refresh={refresh} />
    else if (route.tab === 'desk') body = <Desk snap={snap} refresh={refresh} />
    else if (route.tab === 'chat') body = <Chat snap={raw} refresh={refresh} target={route.target} />
    else body = <Placeholder name={LATER[route.tab][0]} note={LATER[route.tab][1]} />
  }
  return <Shell active={active} snap={snap}>{body}</Shell>
}
