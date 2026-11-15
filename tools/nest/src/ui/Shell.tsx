import { useCallback, useEffect, useId, useRef, useState, type FocusEvent, type ReactNode } from 'react'
import { countByState, openInbox } from '../data/state'
import { homeCounts } from '../data/home'
import { workCounts, workOf } from '../data/work'
import type { Snapshot } from '../data/useData'
import { ago, headerClock, time } from '../format'
import { Link } from '../router'
import { Glyph } from './Glyph'
import { MORE_ICON, SCOPE_ICONS, TABS, TabIcon, type TabKey } from './icons'
import { BAR_KEYS, MORE_KEYS, barTab } from './tabs'
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
  // Inbox counts what the work feed says needs you or failed (item_204); without the feed, open asks.
  const work = workOf(snap.sections.work)
  const w = work && workCounts(work)
  const inbox = w ? { n: w.needs + w.failed, failed: w.failed > 0 } : { n: openInbox(snap.inbox).filter((r) => r.type !== 'fyi').length }
  return { missions: { n: c.failed, failed: true }, inbox }
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
      <TabBar active={active} b={b} />
    </div>
  )
}

type Badges = ReturnType<typeof badges>

// Phone tab bar B (item_206): Home, Desk, Missions, Inbox, More. More opens a sheet
// with MRs, Agenda and Reports and stays highlighted while one of them is open.
function TabBar({ active, b }: { active: TabKey; b: Badges }) {
  const [open, setOpen] = useState(false)
  const btn = useRef<HTMLButtonElement>(null)
  const sheet = useRef<HTMLUListElement>(null)
  const id = useId()
  const cur = barTab(active)
  const close = useCallback((refocus: boolean) => {
    setOpen(false)
    if (refocus) btn.current?.focus()
  }, [])
  useEffect(() => {
    if (!open) return
    const items = sheet.current
    ;(items?.querySelector<HTMLElement>('[aria-current="page"]') ?? items?.querySelector<HTMLElement>('a'))?.focus()
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); close(true) } }
    const down = (e: PointerEvent) => {
      const t = e.target as Node
      if (!items?.contains(t) && !btn.current?.contains(t)) close(false)
    }
    addEventListener('keydown', key)
    document.addEventListener('pointerdown', down)
    return () => {
      removeEventListener('keydown', key)
      document.removeEventListener('pointerdown', down)
    }
  }, [open, close])
  const blur = (e: FocusEvent<HTMLUListElement>) => {
    const to = e.relatedTarget as Node | null
    if (to && !sheet.current?.contains(to) && to !== btn.current) close(false)
  }
  const tabs = TABS.filter((t) => (BAR_KEYS as readonly TabKey[]).includes(t.key))
  const more = TABS.filter((t) => (MORE_KEYS as readonly TabKey[]).includes(t.key))
  const openMore = more.find((t) => t.key === active)
  return (
    <nav className="tabbar" aria-label="Tabs">
      {tabs.map((t) => (
        <Link key={t.key} href={t.path} className="tab" aria-current={t.key === cur ? 'page' : undefined}>
          <TabIcon>{t.icon}</TabIcon>
          {t.label}
          {b[t.key]?.n ? (
            <span className={`badge${b[t.key]!.failed ? ' f' : ''}`} aria-label={`${b[t.key]!.n} ${b[t.key]!.failed ? 'failed' : 'to answer'}`}>{b[t.key]!.n}</span>
          ) : null}
        </Link>
      ))}
      <button
        ref={btn}
        type="button"
        className="tab"
        aria-expanded={open}
        aria-controls={id}
        aria-current={cur === 'more' ? 'page' : undefined}
        onClick={() => (open ? close(false) : setOpen(true))}
      >
        <TabIcon>{MORE_ICON}</TabIcon>
        More{openMore && <span className="sr-only">, {openMore.label} open</span>}
      </button>
      {open && (
        <ul ref={sheet} id={id} className="more-sheet" aria-label="More screens" onBlur={blur}>
          {more.map((t) => (
            <li key={t.key}>
              <Link href={t.path} className="more-item" aria-current={t.key === active ? 'page' : undefined} onClick={() => close(true)}>
                <TabIcon>{t.icon}</TabIcon>
                {t.label}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </nav>
  )
}
