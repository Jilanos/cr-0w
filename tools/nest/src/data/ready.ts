import { sameDay } from '../format'
import type { Agent, FinishedRun, ReadyItem, Resumable } from './live'
import type { Mission, SectionBody } from './types'
import type { WorkItem } from './work'

// Ready to run (item_246): Logics backlog items with status Ready (crow-ready), then the few
// sessions parked in the last day. Older parked sessions stay out (owner 2026-11-18).
export const PARKED_MAX = 3
// The Desk shows a short list (owner 2026-11-18): 5 rows, 2 per project.
export const READY_MAX = 5
export const PER_PROJECT = 2
const DAY = 24 * 3600 * 1000

export function readyOf(b: SectionBody | undefined): ReadyItem[] {
  const d = b?.data as { items?: unknown } | undefined
  return Array.isArray(d?.items) ? (d.items as ReadyItem[]).filter((i) => i && typeof i.ref === 'string') : []
}

// item_189_nest_side_by_side_chats -> item_189
export const shortRef = (ref: string) => /^(item_\d+|req_\d+|task_\d+)/.exec(ref)?.[1] ?? ref

export type ReadyRow =
  | { kind: 'logics'; key: string; item: ReadyItem }
  | { kind: 'parked'; key: string; session: Resumable }

// Keeps the first `per` rows of each project, in order.
function perProject<T>(rows: T[], project: (r: T) => string, per = PER_PROJECT): T[] {
  const n = new Map<string, number>()
  return rows.filter((r) => { const k = project(r); n.set(k, (n.get(k) ?? 0) + 1); return n.get(k)! <= per })
}

// A Ready item already running (its short id in a live run label or title) is left out.
// Parked sessions keep their seats; Logics items fill the rest up to READY_MAX.
export function readyRows(items: ReadyItem[], parked: Resumable[], agents: Agent[], now: Date): ReadyRow[] {
  const live = agents.map((a) => `${a.label ?? ''} ${a.title ?? ''}`).join(' ').toLowerCase()
  const free = items.filter((i) => !new RegExp(`\\b${shortRef(i.ref)}\\b`, 'i').test(live))
  const recent = parked
    .filter((r) => r.last_event && now.getTime() - Date.parse(r.last_event) < DAY)
    .sort((a, b) => Date.parse(b.last_event!) - Date.parse(a.last_event!))
  const seats = perProject(recent, (r) => r.project).slice(0, PARKED_MAX)
  const used = new Map<string, number>()
  for (const r of seats) used.set(r.project, (used.get(r.project) ?? 0) + 1)
  const logics = free.filter((i) => { const n = (used.get(i.project) ?? 0) + 1; used.set(i.project, n); return n <= PER_PROJECT })
    .slice(0, READY_MAX - seats.length)
  return [
    ...logics.map((item): ReadyRow => ({ kind: 'logics', key: `${item.project}:${item.ref}`, item })),
    ...seats.map((session): ReadyRow => ({ kind: 'parked', key: session.conversation_id, session })),
  ]
}

// Work filter chips: needs counts failed items too, they wait on the owner as well.
export type WorkFilter = 'needs' | 'running' | 'ready' | 'all'
export function inFilter(w: WorkItem, f: WorkFilter): boolean {
  if (f === 'all') return true
  if (f === 'needs') return w.state === 'needs' || w.state === 'failed'
  if (f === 'running') return w.state === 'working' || w.state === 'sleeping' || w.state === 'queued'
  return false
}

// KPIs of the laptop Desk: runs done today, and the share of mission runs over 7 days that
// did not end on an error. null when no run ended in the window.
export function doneToday(finished: FinishedRun[], now: Date): number {
  return finished.filter((r) => r.status === 'done' && r.ended_at && sameDay(new Date(r.ended_at), now)).length
}

export function okRate(missions: Mission[], now: Date, days = 7): number | null {
  const from = now.getTime() - days * DAY
  const ended = missions.flatMap((m) => m.runs).filter((r) => r.ended && Date.parse(r.ended) >= from && r.cause)
  if (!ended.length) return null
  return Math.round((100 * ended.filter((r) => r.cause !== 'error' && r.cause !== 'timeout').length) / ended.length)
}
