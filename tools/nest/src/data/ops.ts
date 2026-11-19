// Ops timeline (item_190) over GET /api/state/ops and GET /api/runs/{id} (item_257).

export type SpanState = 'working' | 'idle' | 'waiting' | 'stuck' | 'failed' | 'done'
export interface OpsSpan { state: SpanState; start: string; end: string }
export interface OpsLane {
  id: string
  day: string
  project: string
  account: string
  kind: 'interactive' | 'run' | 'mission' | 'routine'
  title: string
  model?: string
  state: string
  spans: OpsSpan[]
  keys: string[]
  active_s: number
  wait_s: number
  cost_usd: number
  tokens: number
  commits: number
  runs: number
}
export interface OpsQueued { kind: 'mission' | 'routine' | 'afk'; id: string; project?: string; title: string; next?: string }
export interface OpsTotal { by: 'project' | 'kind'; name: string; lanes: number; active_s: number; wait_s: number; stuck: number; failed: number; cost_usd: number; tokens: number }
export interface Ops { day?: string; week?: string; days: string[]; lanes: OpsLane[]; queue: OpsQueued[]; totals: OpsTotal[] }

export interface RunReport {
  run: string
  source: string
  project: string
  label: string
  account: string
  status: string
  started: string | null
  ended: string | null
  cost_usd: number | null
  commits: string[]
  branch: string | null
  worktree: string | null
  item: string | null
  mission: string | null
  report: string
}

// Lane states that are live right now (lanes package glyph states).
const LIVE = new Set(['working', 'run', 'needs', 'idle'])
export const isLive = (l: OpsLane) => LIVE.has(l.state)

// The owner reads the axis in Paris time, wherever the page runs.
export const TZ = 'Europe/Paris'
const hm = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
export const clock = (t: Date | string) => hm.format(new Date(t))

// Hours since Paris midnight of the instant (DST-safe through the formatter).
export function parisHour(t: Date | string): number {
  const [h, m] = clock(t).split(':').map(Number)
  return h + m / 60
}

// Today in Paris as YYYY-MM-DD.
export const parisDay = (t: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(t)

export function shiftDay(day: string, n: number): string {
  const d = new Date(`${day}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

// ISO week (YYYY-Www) holding day.
export function isoWeek(day: string): string {
  const d = new Date(`${day}T12:00:00Z`)
  const wd = (d.getUTCDay() + 6) % 7
  d.setUTCDate(d.getUTCDate() - wd + 3)
  const y = d.getUTCFullYear()
  const first = new Date(Date.UTC(y, 0, 4))
  const n = 1 + Math.round((d.getTime() - first.getTime()) / 864e5 / 7 + ((first.getUTCDay() + 6) % 7 - 3) / 7)
  return `${y}-W${String(n).padStart(2, '0')}`
}

// The axis window in hours: the day's spans, widened to whole hours. Today runs until
// 20:00 at least so the planned lanes fit after the now line.
export function axis(ls: OpsLane[], today: boolean, nowH: number): [number, number] {
  let lo = 24, hi = 0
  for (const l of ls) for (const s of l.spans) {
    lo = Math.min(lo, parisHour(s.start))
    hi = Math.max(hi, parisHour(s.end) || 24)
  }
  if (today) {
    lo = Math.min(lo, nowH)
    hi = Math.max(hi, nowH + 0.5, 20)
  }
  if (lo >= hi) return [8, 20]
  return [Math.floor(lo), Math.min(24, Math.ceil(hi))]
}

// Lanes by project, the project with the most active time first; inside, live lanes first.
export function groups(ls: OpsLane[]): Array<{ project: string; lanes: OpsLane[] }> {
  const by = new Map<string, OpsLane[]>()
  for (const l of ls) by.set(l.project, [...(by.get(l.project) ?? []), l])
  const sum = (x: OpsLane[]) => x.reduce((a, l) => a + l.active_s, 0)
  return [...by.entries()]
    .map(([project, lanes]) => ({ project, lanes: [...lanes].sort((a, b) => Number(isLive(b)) - Number(isLive(a)) || first(a) - first(b)) }))
    .sort((a, b) => sum(b.lanes) - sum(a.lanes))
}

const first = (l: OpsLane) => (l.spans[0] ? Date.parse(l.spans[0].start) : Infinity)

// The run id of a lane: a crow-runs key (32 hex, no dashes).
export const runId = (l: OpsLane) => l.keys.find((k) => /^[0-9a-f]{32}$/.test(k))

export interface DayStats { lanes: number; active_s: number; wait_s: number; cost: number; failed: number; sessions: number; runs: number; done: number }
export function stats(ls: OpsLane[]): DayStats {
  const s: DayStats = { lanes: ls.length, active_s: 0, wait_s: 0, cost: 0, failed: 0, sessions: 0, runs: 0, done: 0 }
  for (const l of ls) {
    s.active_s += l.active_s
    s.wait_s += l.wait_s
    s.cost += l.cost_usd
    if (l.state === 'failed' || l.spans.some((x) => x.state === 'failed')) s.failed++
    if (l.kind === 'interactive') s.sessions++
    else s.runs++
    if (l.spans.at(-1)?.state === 'done' && l.kind !== 'interactive') s.done++
  }
  return s
}

// Busy stretches of a day: the union of working spans, in Paris hours.
export function busy(ls: OpsLane[]): Array<[number, number]> {
  const xs = ls.flatMap((l) => l.spans.filter((s) => s.state !== 'idle').map((s) => [parisHour(s.start), parisHour(s.end) || 24] as [number, number]))
  xs.sort((a, b) => a[0] - b[0])
  const out: Array<[number, number]> = []
  for (const x of xs) {
    const last = out.at(-1)
    if (last && x[0] <= last[1]) last[1] = Math.max(last[1], x[1])
    else out.push([...x])
  }
  return out
}

export const hours = (s: number) => (s / 3600).toFixed(1)
export const usd = (n: number) => `$${n < 10 ? n.toFixed(2) : n.toFixed(0)}`
