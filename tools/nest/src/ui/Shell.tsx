import { useEffect, useState, type ReactNode } from 'react'
import { countByState, openInbox } from '../data/state'
import { homeCounts } from '../data/home'
import type { Snapshot } from '../data/useData'
import { ago, headerClock, time } from '../format'
import { Link } from '../router'
import { Glyph } from './Glyph'
import { SCOPE_ICONS, TABS, TabIcon, type TabKey } from './icons'
import { nextScope, scopeChip, type ScopeMode } from '../data/scope'

type Theme = 'modern' | 'cyber'

function useTheme(): [Theme, () => void] {
  const [theme, setTheme] = useState<Theme>(() => (document.documentElement.dataset.theme === 'cyber' ? 'cyber' : 'modern'))
  useEffect(() => {
    document.documentElement.dataset.theme = theme
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'cyber' ? '#05070c' : '#24273a')
    try { localStorage.setItem('nest.theme', theme) } catch { /* storage blocked: theme stays per visit */ }
  }, [theme])
  return [theme, () => setTheme((t) => (t === 'modern' ? 'cyber' : 'modern'))]
}

function badges(snap: Snapshot | null): Partial<Record<TabKey, { n: number; failed?: boolean }>> {
  if (!snap) return {}
  const c = countByState(snap.missions, snap.inbox)
  const asks = openInbox(snap.inbox).filter((r) => r.type !== 'fyi').length
  return { missions: { n: c.failed, failed: true }, inbox: { n: asks } }
}

// Header A (item_206): one chip after the logo cycles the scope filter.
function ScopeChip({ scope, setScope }: { scope: ScopeMode; setScope: (m: ScopeMode) => void }) {
  const t = scopeChip(scope)
  return (
    <button type="button" className="scope-chip" aria-label={t.name} aria-pressed={t.pressed} title={t.name} onClick={() => setScope(nextScope(scope))}>
      <svg aria-hidden="true" width="14" height="14" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round" strokeLinecap="round">
        {SCOPE_ICONS[scope]}
      </svg>
      {t.label}
    </button>
  )
}

interface ShellProps { active: TabKey; snap: Snapshot | null; scope: ScopeMode; setScope: (m: ScopeMode) => void; children: ReactNode }

export function Shell({ active, snap, scope, setScope, children }: ShellProps) {
  const [theme, toggle] = useTheme()
  const b = badges(snap)
  const c = snap ? homeCounts(snap) : null
  // Account gauges (laptop): names from the runs, usage waits for the live API.
  const accts = [...new Set(snap?.missions.flatMap((m) => m.runs.map((r) => r.account)) ?? [])].sort().slice(0, 3)
  return (
    <div className="app">
      <header className="top">
        <Link href="/" className="logo" aria-label="CR-0W home">CR-0W</Link>
        <ScopeChip scope={scope} setScope={setScope} />
        <span className="hdr-sep" aria-hidden="true" />
        <nav className="pills" aria-label="Tabs">
          {TABS.map((t, i) => (
            <Link key={t.key} href={t.path} className="pill" aria-current={t.key === active ? 'page' : undefined}>
              <span className="tn">{i + 1}</span>{t.label}
              {b[t.key]?.n ? <span className={`badge-t num${b[t.key]!.failed ? ' f' : ''}`}>{b[t.key]!.n}</span> : null}
            </Link>
          ))}
        </nav>
        <span className="grow" />
        {accts.length > 0 && (
          <span className="accts" title="Usage arrives with the live API">
            {accts.map((a) => (
              <span key={a} className="acct">{a}<span className="gb" aria-hidden="true" /><span className="pc">–</span></span>
            ))}
          </span>
        )}
        {c && (
          <span className="chips wrap" aria-label={`${c.needs} need you, ${c.working} working`}>
            <span className="chip c-n"><Glyph state="needs" size={12} />{c.needs}</span>
            <span className="chip c-w"><Glyph state="working" size={12} />{c.working}</span>
          </span>
        )}
        {snap?.down && (
          <span className="link-down" role="status">
            <span className="long">core </span>down{snap.synced ? <> · <span className="num">{ago(snap.synced.toISOString(), snap.now)}</span></> : null}
          </span>
        )}
        {snap && <span className="clock"><span className="short">{time(snap.now)}</span><span className="long">{headerClock(snap.now, theme === 'cyber')}</span></span>}
        <button type="button" className="icon-btn" onClick={toggle} aria-label={`Theme: ${theme}. Switch to ${theme === 'modern' ? 'cyber' : 'modern'}`} title="Switch theme">
          <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <circle cx="12" cy="12" r="8" /><path d="M12 4a8 8 0 0 1 0 16Z" fill="currentColor" />
          </svg>
        </button>
      </header>
      <main className="main" id="main">{children}</main>
      <nav className="tabbar" aria-label="Tabs">
        {TABS.map((t) => (
          <Link key={t.key} href={t.path} className="tab" aria-current={t.key === active ? 'page' : undefined}>
            <TabIcon>{t.icon}</TabIcon>
            {t.label}
            {b[t.key]?.n ? (
              <span className={`badge${b[t.key]!.failed ? ' f' : ''}`} aria-label={`${b[t.key]!.n} ${b[t.key]!.failed ? 'failed' : 'to answer'}`}>{b[t.key]!.n}</span>
            ) : null}
          </Link>
        ))}
      </nav>
    </div>
  )
}
