import { accountsOf, dispatchOf, type Agent } from './live'
import { lastRun, openInbox, uiState } from './state'
import type { Snapshot } from './feed'
import type { AgendaEvent, SectionBody, TodayEvent } from './types'
import { title } from '../format'
import { workCounts, workOf } from './work'

// Phone Home (item_171): quota HUD, status HUD, Needs you first, one Running list
// and the next agenda slots, all from one snapshot.

// One `crow-usage json` limit row, the part Home reads.
export interface Limit {
  account: string
  remaining_5h_pct: number
  remaining_week_pct: number
  reset_5h_at?: string | null
  reset_week_at?: string | null
  active?: boolean
}

// One `crow-checks json` row.
export interface Check {
  id: string
  check: string
  what: string
  why: string
  action: string
  due?: string | null
}

const obj = (b: SectionBody | undefined) => (b?.data && typeof b.data === 'object' ? (b.data as Record<string, unknown>) : {})
const list = <T>(v: unknown) => (Array.isArray(v) ? (v as T[]) : [])
const pct = (v: unknown) => (typeof v === 'number' && isFinite(v) ? Math.max(0, Math.min(100, Math.round(v))) : null)

export function usageOf(b: SectionBody | undefined): Limit[] {
  return list<Limit>(obj(b).limits).flatMap((l) => {
    const h = pct(l?.remaining_5h_pct)
    const w = pct(l?.remaining_week_pct)
    return l && typeof l.account === 'string' && h !== null && w !== null ? [{ ...l, remaining_5h_pct: h, remaining_week_pct: w }] : []
  })
}

export const checksOf = (b: SectionBody | undefined) => list<Check>(obj(b).rows).filter((r) => r && r.id && r.what)

// Minutes since the data was made: the script's own stamp when it has one, else the section's.
export function ageMin(b: SectionBody | undefined, now: Date, stamp?: unknown): number | null {
  const at = typeof stamp === 'string' ? stamp : b?.updated_at
  if (!at) return null
  const t = new Date(at).getTime()
  return isNaN(t) ? null : Math.max(0, Math.floor((now.getTime() - t) / 60000))
}

const mins = (iso: string | null | undefined, now: Date) => {
  if (!iso) return ''
  const m = Math.max(0, Math.floor((now.getTime() - new Date(iso).getTime()) / 60000))
  return m < 60 ? `${m} min` : m < 1440 ? `${Math.floor(m / 60)} h` : `${Math.floor(m / 1440)} d`
}

export type NeedKind = 'alert' | 'session' | 'ask'
export interface NeedRow { key: string; kind: NeedKind; title: string; sub: string; action: string; href: string }

export type RunKind = 'mission' | 'session' | 'run'
export interface RunRow { key: string; kind: RunKind; title: string; state: string; step?: string; age: string; account: string; waiting: boolean; href: string }

export interface QuotaRow { account: string; h: number; w: number }

// Bar class of a percent left: lo under 15, md under 40.
export const quotaCls = (p: number) => (p < 15 ? 'lo' : p < 40 ? 'md' : '')

export interface HomeModel {
  needs: NeedRow[]
  running: RunRow[]
  working: number
  slots: { busy: number; max: number }
  quota: QuotaRow[]
  // Minutes old; null when unknown. stale is true when the last refresh failed.
  usage: { age: number | null; stale: boolean }
  status: { age: number | null; stale: boolean }
  agenda: { label: string; events: AgendaEvent[] }
}

const agentName = (a: Agent) => (a.kind === 'run' ? a.label || a.run_id || String(a.pid) : a.title || a.project)
// Session titles start with "project: "; the row already shows the project.
const bare = (a: Agent) => agentName(a).replace(new RegExp(`^${a.project.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:\\s*`), '')
const deskOf = (a: Agent, tell = false) => `/desk?pid=${a.pid}${tell ? '&tell=1' : ''}`
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

// The quota HUD and the laptop header gauges show the accounts crow may use (policy
// other than never), in accounts order; without the accounts section, every limit row.
export function quotaOf(snap: Snapshot): QuotaRow[] {
  const limits = usageOf(snap.sections.usage)
  const allowed = accountsOf(snap.sections.accounts).map((a) => a.name)
  const pick = allowed.length ? allowed.flatMap((n) => limits.filter((l) => l.account === n)) : limits
  return pick.map((l) => ({ account: l.account, h: l.remaining_5h_pct, w: l.remaining_week_pct }))
}

// Next slots: what is left of today, else tomorrow's timed events.
function agendaOf(snap: Snapshot): HomeModel['agenda'] {
  const left = snap.agenda.filter((e) => new Date(e.end) > snap.now)
  if (left.length) return { label: 'Today', events: left.slice(0, 3) }
  const tomorrow = list<TodayEvent>(obj(snap.sections.today).tomorrow).filter((e) => !e.all_day)
  return { label: 'Tomorrow', events: tomorrow.slice(0, 3).map((e, i) => ({ id: `t${i}`, title: e.subject, start: e.start, end: e.end })) }
}

export function homeModel(snap: Snapshot): HomeModel {
  const { missions, inbox, now, sections } = snap
  const d = dispatchOf(sections.dispatch)
  const agents = d.agents
  const asks = openInbox(inbox)
    .filter((r) => r.type !== 'fyi')
    .sort((a, b) => Number(!!b.blocking) - Number(!!a.blocking) || a.created.localeCompare(b.created))

  const needs: NeedRow[] = [
    ...checksOf(sections.checks).map((c): NeedRow => ({
      key: `c:${c.id}`, kind: 'alert', title: c.what, sub: [c.why, c.due].filter(Boolean).join(' · '), action: cap(c.action), href: '/desk',
    })),
    // setup (item_240): a headless session stuck on a first-run dialog, answered in its Terminal tab.
    ...agents.filter((a) => a.kind === 'session' && (a.state === 'waiting' || a.state === 'setup')).map((a): NeedRow => ({
      key: `s:${a.pid}`, kind: 'session', title: `${a.project} · ${bare(a)}`, sub: `${a.state === 'setup' ? 'session waits on setup' : 'session waits'} · ${mins(a.started_at, now)} · ${a.account}`, action: 'Answer', href: deskOf(a),
    })),
    ...asks.map((r): NeedRow => {
      const m = missions.find((x) => x.id === r.mission)
      return { key: `i:${r.id}`, kind: 'ask', title: r.ask, sub: [m ? title(m) : r.project, r.source, mins(r.created, now)].join(' · '), action: 'Answer', href: '/inbox' }
    }),
  ]

  const live = missions.filter((m) => !['done', 'failed'].includes(uiState(m, inbox)))
  const running: RunRow[] = [
    ...live.map((m): RunRow => {
      const s = uiState(m, inbox)
      const run = lastRun(m)
      return {
        key: `m:${m.id}`, kind: 'mission', title: `${m.project} · ${title(m)}`, state: s === 'needs' ? 'waiting' : s,
        step: m.runs.length > 1 ? `run ${m.runs.length}` : undefined, age: mins(run?.started ?? m.updated, now), account: run?.account ?? '',
        waiting: s === 'needs', href: s === 'needs' ? '/inbox' : '/desk',
      }
    }),
    ...agents.map((a): RunRow => ({
      key: `a:${a.pid}`, kind: a.kind, title: `${a.project} · ${bare(a)}`, state: a.state ?? 'working', age: mins(a.started_at, now),
      account: a.account, waiting: a.state === 'waiting' || a.state === 'setup', href: deskOf(a, a.kind === 'session'),
    })),
  ]

  const working = live.filter((m) => uiState(m, inbox) === 'working').length + agents.filter((a) => a.state === 'working').length
  const u = sections.usage
  const st = sections.dispatch
  return {
    needs, running, working, slots: d.slots, quota: quotaOf(snap),
    usage: { age: ageMin(u, now, obj(u).generated_at), stale: !!u?.stale },
    status: { age: ageMin(st, now, obj(st).generated_at), stale: !!st?.stale },
    agenda: agendaOf(snap),
  }
}

// Header chips, tab badges and the butler line share these counts: the work feed
// (item_204) when core serves it, else the Home lists.
export function homeCounts(snap: Snapshot) {
  const work = workOf(snap.sections.work)
  if (work) {
    const c = workCounts(work)
    return { needs: c.needs, working: c.working, failed: c.failed }
  }
  const m = homeModel(snap)
  return { needs: m.needs.length, working: m.working, failed: 0 }
}
