import type { UiState } from '../data/state'
import { countByState, lastRun, openInbox, uiState } from '../data/state'
import type { InboxItem, Mission, SectionBody, SectionName } from '../data/types'
import { dispatchOf, registryOf, resumableOf, type Agent, type RegProject, type Resumable } from '../data/live'
import { title } from '../format'
import { workCounts, workOf, type WorkItem } from '../data/work'

// What the hero shows, derived from the data layer only (item_155, holotable item_162).

export type Mood = 'idle' | 'ask' | 'fail' | 'run'

const RANK: Record<UiState, number> = { needs: 0, failed: 1, working: 2, sleeping: 3, queued: 4, done: 5 }

export interface HeroMission { id: string; title: string; state: UiState; started?: string }
// A live interactive session or dispatch run on the project.
export interface HeroAgent { pid: number; kind: Agent['kind']; title: string; state: UiState; action?: string }
// open = missions not done (planet size). wait = minutes the oldest ask has waited (stalk height).
// runFrom = start of the oldest live run (working label). cause = what failed (failed label).
export interface HeroProject {
  name: string; state: UiState; live: boolean; missions: HeroMission[]; agents: HeroAgent[]
  open: number; wait?: number; runFrom?: string; cause?: string
  // No mission, agent or ask: a registered project at rest (item_200 decides how it shows).
  quiet?: boolean
  // A system planet (item_200): its registered projects, most urgent first. label = short name.
  members?: HeroProject[]; label?: string
}

// Everything the hero shows besides missions (req_059): the project registry, live
// sessions and dispatch runs, and sessions parked on a usage limit. work is the
// core work feed (item_204); when present, mood and line count it.
export interface HeroLive { registry: RegProject[]; agents: Agent[]; parked: Resumable[]; work?: WorkItem[] }
export const NO_LIVE: HeroLive = { registry: [], agents: [], parked: [] }

export const heroLiveOf = (s: Partial<Record<SectionName, SectionBody>> | undefined): HeroLive => s
  ? { registry: registryOf(s.projects), agents: dispatchOf(s.dispatch).agents, parked: resumableOf(s.sessions), work: workOf(s.work) ?? undefined }
  : NO_LIVE

// Planet state order (item_199): failed > needs > working > sleeping > queued > done.
const PRANK: Record<UiState, number> = { failed: 0, needs: 1, working: 2, sleeping: 3, queued: 4, done: 5 }

// Project of a cwd: the longest registry path holding it, its `<repo>.wt/` worktrees included.
export function projectOfCwd(cwd: string | null | undefined, registry: RegProject[]): string | undefined {
  if (!cwd) return undefined
  let best: RegProject | undefined
  for (const p of registry) {
    if (!p.path) continue
    const root = p.path.replace(/\/+$/, '')
    const under = cwd === root || cwd.startsWith(root + '/') || cwd === root + '.wt' || cwd.startsWith(root + '.wt/')
    if (under && (!best || root.length > best.path!.replace(/\/+$/, '').length)) best = p
  }
  return best?.name
}

// Project of a live agent: cwd first, then its own project name, then its largest share.
export function projectOfAgent(a: Agent, registry: RegProject[], known: Set<string>): string {
  const byCwd = projectOfCwd(a.cwd, registry)
  if (byCwd) return byCwd
  if (known.has(a.project)) return a.project
  const top = [...(a.projects ?? [])].sort((x, y) => (y.share_pct ?? 0) - (x.share_pct ?? 0))[0]
  return top?.name ?? a.project
}


export interface HeroModel {
  mood: Mood
  asks: number
  line: string
  projects: HeroProject[]
}

const WORDS = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine']
const word = (n: number) => WORDS[n] ?? String(n)

// Core mood, most urgent first (item_158, owner 2026-11-11): a failed run, then an open
// question, then live work, otherwise idle.
export function moodOf(c: Record<UiState, number>, asks = 0): Mood {
  if (c.failed > 0) return 'fail'
  if (asks > 0) return 'ask'
  if (c.working > 0) return 'run'
  return 'idle'
}

export function heroModel(missions: Mission[], inbox: InboxItem[], live: HeroLive = NO_LIVE, now: Date = new Date()): HeroModel {
  const c = countByState(missions, inbox)
  const asks = openInbox(inbox).filter((r) => r.type !== 'fyi').length
  const agentState = (a: Agent): UiState => (a.state === 'waiting' ? 'needs' : 'working')
  const waiting = live.agents.filter((a) => agentState(a) === 'needs').length
  // Live sessions and runs count like missions: waiting ones ask, the others work.
  // The work feed already holds every kind: its needs ask, its working work.
  const wc = live.work && workCounts(live.work)
  const working = wc ? wc.working : c.working + live.agents.length - waiting
  const asking = wc ? wc.needs : asks + waiting
  const mood = moodOf(wc ? { ...c, failed: wc.failed, working } : { ...c, working }, asking)

  const known = new Set([...live.registry.map((p) => p.name), ...missions.map((m) => m.project)])
  const names = new Map<string, true>()
  for (const p of live.registry) names.set(p.name, true)
  for (const r of openInbox(inbox)) if (r.type !== 'fyi') names.set(r.project, true)
  const byProject = new Map<string, HeroMission[]>()
  for (const m of missions) {
    const run = lastRun(m)
    const hm: HeroMission = { id: m.id, title: title(m), state: uiState(m, inbox), started: run && !run.ended ? run.started : undefined }
    byProject.set(m.project, [...(byProject.get(m.project) ?? []), hm])
    names.set(m.project, true)
  }
  const mins = (iso: string) => Math.max(0, Math.round((now.getTime() - Date.parse(iso)) / 60000))
  const ago = (s: number | null | undefined) => (s == null ? undefined : new Date(now.getTime() - s * 1000).toISOString())
  const byAgent = new Map<string, Array<{ a: Agent; h: HeroAgent; from?: string }>>()
  for (const a of live.agents) {
    const name = projectOfAgent(a, live.registry, known)
    const h: HeroAgent = { pid: a.pid, kind: a.kind, title: a.title || a.label || a.last_prompt || a.project, state: agentState(a), action: a.last_action ?? undefined }
    const from = a.started_at ?? [...(a.recent ?? [])].map((r) => r.ts).sort()[0]
    byAgent.set(name, [...(byAgent.get(name) ?? []), { a, h, from: from ?? undefined }])
    names.set(name, true)
  }
  // Sessions parked on a usage limit that has not reset yet.
  const parked = new Set<string>()
  for (const r of live.parked) {
    if (!r.limit || !r.resets_at || Date.parse(r.resets_at) <= now.getTime()) continue
    const name = projectOfCwd(r.cwd, live.registry) ?? r.project
    parked.add(name); names.set(name, true)
  }
  const asked = (p: string) => [
    ...openInbox(inbox).filter((r) => r.project === p && r.type !== 'fyi').map((r) => r.created),
    ...missions.filter((m) => m.project === p && (m.state === 'waiting' || m.state === 'review')).map((m) => m.updated),
    ...(byAgent.get(p) ?? []).filter((x) => x.h.state === 'needs').map((x) => ago(x.a.last_activity_s) ?? x.from).filter((x): x is string => !!x),
  ]
  const projects: HeroProject[] = [...names.keys()].map((name) => {
    const ms = (byProject.get(name) ?? []).sort((a, b) => RANK[a.state] - RANK[b.state])
    const ags = byAgent.get(name) ?? []
    const ask = openInbox(inbox).some((r) => r.project === name && r.type !== 'fyi')
    const states: UiState[] = [...ms.map((m) => m.state), ...ags.map((x) => x.h.state), ...(ask ? ['needs' as const] : []), ...(parked.has(name) ? ['sleeping' as const] : [])]
    const quiet = states.length === 0
    const state = quiet ? 'sleeping' : states.sort((a, b) => PRANK[a] - PRANK[b])[0]
    const open = ms.filter((m) => m.state !== 'done')
    const since = asked(name).sort()[0]
    const runFrom = [...open.map((m) => m.started), ...ags.filter((x) => x.h.state === 'working').map((x) => x.from)].filter((x): x is string => !!x).sort()[0]
    const failed = open.find((m) => m.state === 'failed')
    return {
      name, state, live: PRANK[state] <= PRANK.working, missions: open, agents: ags.map((x) => x.h), open: open.length + ags.length,
      wait: state === 'needs' && since ? mins(since) : undefined, runFrom, cause: failed?.title, ...(quiet ? { quiet: true } : {}),
    }
  })
  // Systems (item_200): related projects share one planet, members orbit it as moons.
  const reg = new Map(live.registry.map((p) => [p.name, p]))
  const shown = projects.filter((p) => reg.get(p.name)?.nest !== false)
  for (const p of shown) { const r = reg.get(p.name); if (r?.short) p.label = r.short }
  const groups = new Map<string, HeroProject[]>()
  for (const p of shown) { const k = reg.get(p.name)?.system ?? p.name; groups.set(k, [...(groups.get(k) ?? []), p]) }
  const order = (a: HeroProject, b: HeroProject) => Number(!!a.quiet) - Number(!!b.quiet) || RANK[a.state] - RANK[b.state] || (b.wait ?? 0) - (a.wait ?? 0) || a.name.localeCompare(b.name)
  const systems = [...groups.entries()].map(([name, ms]): HeroProject => {
    if (ms.length === 1 && ms[0].name === name) return ms[0]
    const mem = [...ms].sort(order), top = mem[0]
    const waits = mem.map((x) => x.wait).filter((x): x is number => x !== undefined)
    const runs = mem.map((x) => x.runFrom).filter((x): x is string => !!x).sort()
    return {
      name, state: top.state, live: mem.some((x) => x.live), missions: mem.flatMap((x) => x.missions), agents: mem.flatMap((x) => x.agents),
      open: mem.reduce((n, x) => n + x.open, 0), wait: waits.length ? Math.max(...waits) : undefined, runFrom: runs[0],
      cause: mem.find((x) => x.cause)?.cause, ...(mem.every((x) => x.quiet) ? { quiet: true } : {}), members: mem,
    }
  })
  projects.length = 0; projects.push(...systems)
  // Longest wait first: the head looks at projects[0] when it waits on you.
  projects.sort((a, b) => Number(!!a.quiet) - Number(!!b.quiet) || RANK[a.state] - RANK[b.state] || (b.wait ?? 0) - (a.wait ?? 0) || a.name.localeCompare(b.name))

  const parts: string[] = []
  if (asking) parts.push(`${word(asking)} ${asking === 1 ? 'ask waits' : 'asks wait'} on you, Sir.`)
  const failed = live.work
    ? live.work.filter((w) => w.state === 'failed').map((w) => w.title)
    : missions.filter((m) => uiState(m, inbox) === 'failed').map(title)
  if (failed.length === 1) parts.push(`${failed[0]} failed.`)
  else if (failed.length) parts.push(`${word(failed.length)} ${live.work ? 'items' : 'runs'} failed.`)
  if (!parts.length && working) parts.push(`${word(working)} ${working === 1 ? 'run' : 'runs'} going, Sir.`)
  if (!parts.length) parts.push('All quiet, Sir.')

  return { mood, asks: asking, line: parts.join(' '), projects }
}
