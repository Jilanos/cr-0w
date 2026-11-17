import { ago, time } from '../format'
import type { UiState } from './state'
import type { Mission, MissionState, SectionBody } from './types'

// The core work feed (item_202, GET /api/state/work): every kind of work in one
// list, most urgent first. Same fields as contract.WorkItem.
export type WorkKind = 'session' | 'run' | 'parked' | 'mr' | 'mission'
export const WORK_KINDS: WorkKind[] = ['session', 'run', 'parked', 'mr', 'mission']

export interface WorkItem {
  // <kind>:<source id>
  id: string
  kind: WorkKind
  project: string
  title: string
  state: UiState
  since?: string
  why?: string
  // Seconds the item has waited on the owner (needs only).
  wait_s?: number
  // Usage limit reset, RFC 3339 (sleeping only).
  resets_at?: string
  // Mission the item belongs to; a mission item names itself.
  mission?: string
  source: { section: 'dispatch' | 'sessions' | 'mrs' | 'missions'; ref: string }
}

export const KIND_LABEL: Record<WorkKind, string> = { session: 'Session', run: 'Run', parked: 'Parked', mr: 'MR', mission: 'Mission' }

const STATES: UiState[] = ['failed', 'needs', 'working', 'sleeping', 'queued', 'done']
const isItem = (v: unknown): v is WorkItem => {
  const w = v as WorkItem
  return !!w && typeof w.id === 'string' && WORK_KINDS.includes(w.kind) && STATES.includes(w.state) && !!w.source
}

// Items of the work section; null while the section has no data (not loaded, or a core without the feed).
export function workOf(b: SectionBody | undefined): WorkItem[] | null {
  return Array.isArray(b?.data) ? (b.data as unknown[]).filter(isItem) : null
}

export function workCounts(items: WorkItem[]): Record<UiState, number> {
  const c: Record<UiState, number> = { failed: 0, needs: 0, working: 0, sleeping: 0, queued: 0, done: 0 }
  for (const w of items) c[w.state]++
  return c
}

// One Desk row: a work item alone, or a mission goal with the items it rolls up.
export interface WorkGroup { item: WorkItem; children: WorkItem[] }

// The Desk work list (item_204 option A): done items hidden, the feed order kept.
// A mission's items sit under its goal at the goal's place; an item whose mission
// has no shown goal stands alone.
export function deskWork(items: WorkItem[]): WorkGroup[] {
  const shown = items.filter((w) => w.state !== 'done')
  const goals = new Map(shown.filter((w) => w.kind === 'mission').map((w) => [w.source.ref, w]))
  const under = (w: WorkItem) => w.kind !== 'mission' && !!w.mission && goals.has(w.mission)
  return shown.filter((w) => !under(w)).map((w) => ({
    item: w,
    children: w.kind === 'mission' ? shown.filter((c) => under(c) && c.mission === w.source.ref) : [],
  }))
}

const valid = (iso: string | undefined) => !!iso && !isNaN(Date.parse(iso))

// Time line of a row: how long it waits on you, when a usage limit resets, else its age.
export function workWhen(w: WorkItem, now: Date): string {
  if (w.state === 'needs') {
    if (w.wait_s != null) return `waits ${ago(new Date(now.getTime() - w.wait_s * 1000).toISOString(), now)}`
    return valid(w.since) ? `waits ${ago(w.since!, now)}` : ''
  }
  if (w.state === 'sleeping' && valid(w.resets_at)) return `resets ${time(w.resets_at!)}`
  return valid(w.since) ? ago(w.since!, now) : ''
}

// Linked missions (crow handoff / dispatch, item_203) stay "running" in the store with no run
// of their own; the core rolls their real state up in the work feed. Missions take that state,
// and a linked mission the feed no longer lists is done. Without a feed they are left as is.
export const isLinked = (m: Mission) => m.kind === 'build' && m.state === 'running' && m.runs.length === 0
const AS_MISSION: Record<UiState, MissionState> = { done: 'done', failed: 'failed', needs: 'waiting', working: 'running', sleeping: 'queued', queued: 'queued' }
export function withLinkedStates(missions: Mission[], work: WorkItem[] | null): Mission[] {
  if (!work || !missions.some(isLinked)) return missions
  const st = new Map(work.filter((w) => w.kind === 'mission').map((w) => [w.source.ref, w.state]))
  return missions.map((m) => (isLinked(m) ? { ...m, state: AS_MISSION[st.get(m.id) ?? 'done'] } : m))
}
