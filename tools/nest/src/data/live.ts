import type { InboxVerb, SectionBody } from './types'

// Live sessions, dispatch runs and Today mail (item_170). Shapes are the parts of
// the script sections Nest reads (logics/specs/script_contract); actions are the
// core POST routes of tools/crow-core/internal/api/live.go.

// One agent of `crow-runs json`: an interactive session or a background run.
export interface Agent {
  kind: 'session' | 'run'
  pid: number
  account: string
  project: string
  cwd: string
  session_id?: string | null
  run_id?: string | null
  label?: string | null
  title?: string | null
  state?: string
  started_at?: string | null
  last_action?: string | null
  last_prompt?: string | null
  last_activity_s?: number | null
  projects?: Array<{ name: string; share_pct?: number }> | null
  recent?: Array<{ action: string; ts: string }> | null
  prompt?: Prompt | null
  // tmux session holding a headless Nest session (item_188); attach opens a terminal on it.
  tmux?: string | null
}

// The permission prompt a waiting session shows (item_174, crow-prompt). work_approval
// names the work project of a push or MR: those are given in approvals, never here.
export interface Prompt {
  id: string
  tool: string
  detail: string
  description?: string | null
  work_approval?: string | null
  options: Array<{ key: 'allow' | 'deny'; label: string }>
  // AskUserQuestion (item_193): the questions in order; deny is Cancel, answers go through ask().
  questions?: Question[] | null
}

export interface Question {
  header: string
  question: string
  multiSelect: boolean
  options: Array<{ label: string; description?: string | null }>
}

// One answer per question: 0-based option indexes, or a free "Other" text (with the
// options also ticked on a multiSelect).
export type AskAnswer = number[] | { other: string; options?: number[] }

export interface Dispatch {
  slots: { busy: number; max: number }
  agents: Agent[]
  // Runs that ended in the last days, newest first (crow-runs json).
  finished?: FinishedRun[]
}

export interface FinishedRun {
  run_id: string
  project: string
  label?: string | null
  account?: string | null
  status: string
  ended_at?: string | null
}

// A Logics backlog item ready to build (crow-ready json).
export interface ReadyItem {
  project: string
  ref: string
  title: string
  path: string
  progress?: string
  modified: string
}

// A resumable conversation of `crow-sessions json`.
export interface Resumable {
  conversation_id: string
  account: string
  cwd: string
  project: string
  branch?: string | null
  limit?: string | null
  resets_at?: string | null
  last_prompt?: string | null
  // Last transcript event, RFC 3339.
  last_event?: string | null
}

// scope is set on a scoped snapshot (item_206): the mailbox the row came from.
export interface Mail {
  id: string
  subject: string
  from?: string
  scope?: 'work' | 'perso'
  // Set by mailOf: the Outlook list the mail came from.
  flag?: 'flagged' | 'important'
}

export interface Account {
  name: string
  policy: string
}

// The reply of every live action: the event core wrote to actions.jsonl.
export interface LiveReply {
  ts: string
  actor: string
  surface: string
  action: string
  target: string
  text?: string
  account?: string
  project?: string
  ok: boolean
  code: number
  message: string
  run_id?: string
  // start and resume: the detached tmux session the session runs in (item_188, item_240).
  tmux?: string
}

// The Terminal tab (item_240): the tmux screen of a session from `crow-screen show`. Lines
// keep their ANSI SGR codes; the cursor is 0-based within cols x rows.
export interface Screen {
  lines: string[]
  cols: number
  rows: number
  cursor: { x: number; y: number; shown: boolean }
  // Lines above the screen at the start of lines (none on the alternate screen).
  history?: number
}

// One key for the session's pane: a tmux key name (Enter, C-c, Up...) or literal text.
export type TermKey = { key: string } | { text: string }

export interface NewSession { project: string; account?: string; prompt?: string }
export interface NewRun { project: string; label: string; prompt: string; model?: string; account?: string }

// Each call resolves with the reply or rejects with an ApiError (4xx/5xx).
export interface Actions {
  send(pid: number, text: string): Promise<LiveReply>
  interrupt(pid: number): Promise<LiveReply>
  answer(pid: number, prompt: string, option: 'allow' | 'deny'): Promise<LiveReply>
  ask(pid: number, prompt: string, answers: AskAnswer[]): Promise<LiveReply>
  stop(pid: number): Promise<LiveReply>
  // Opens a terminal window on the desktop attached to the session's tmux session (item_188).
  attach(pid: number): Promise<LiveReply>
  // Terminal tab (item_240, core terminal.go): read the pane, type into it, size it.
  screen(pid: number): Promise<Screen>
  keys(pid: number, keys: TermKey[]): Promise<unknown>
  resize(pid: number, cols: number, rows: number): Promise<unknown>
  resume(id: string, account?: string): Promise<LiveReply>
  start(s: NewSession): Promise<LiveReply>
  dispatch(r: NewRun): Promise<LiveReply>
  stopRun(runId: string): Promise<LiveReply>
  /** Start a finished run again on its prompt, account and worktree (crow-runs retry). */
  retryRun(runId: string): Promise<LiveReply>
  mail(id: string, verb: 'done' | 'snooze'): Promise<LiveReply>
  // Mission actions (item_168, core internal/api/actions.go). Replies differ per route;
  // callers only refetch. version is the mission version the owner saw (409 when older).
  missionAnswer(mission: string, item: string, verb: InboxVerb, text: string, version: number): Promise<unknown>
  missionStop(mission: string): Promise<unknown>
  missionCancel(mission: string, reason?: string): Promise<unknown>
  inboxHide(item: string): Promise<unknown>
}

const obj = (b: SectionBody | undefined) => (b?.data && typeof b.data === 'object' ? (b.data as Record<string, unknown>) : {})
const list = <T>(v: unknown) => (Array.isArray(v) ? (v as T[]) : [])

export function dispatchOf(b: SectionBody | undefined): Dispatch {
  const d = obj(b)
  const slots = (d.slots as Dispatch['slots'] | undefined) ?? { busy: 0, max: 0 }
  return { slots, agents: list<Agent>(d.agents), finished: list<FinishedRun>(d.finished) }
}

export const resumableOf = (b: SectionBody | undefined) => list<Resumable>(obj(b).sessions)

// Important and flagged mail, flagged first, each id once.
export function mailOf(b: SectionBody | undefined): Mail[] {
  const d = obj(b)
  const seen = new Set<string>()
  const tag = (v: unknown, flag: Mail['flag']) => list<Mail>(v).map((m) => ({ ...m, flag }))
  return [...tag(d.flagged, 'flagged'), ...tag(d.important, 'important')].filter((m) => !seen.has(m.id) && seen.add(m.id))
}

export const projectsOf = (b: SectionBody | undefined) => list<{ name: string }>(obj(b).projects).map((p) => p.name)

// Accounts a new session may use; "never" accounts are refused by core anyway.
export const accountsOf = (b: SectionBody | undefined) => list<Account>(obj(b).accounts).filter((a) => a.policy !== 'never')

// Registry entry of `crow-projects json` (the parts the hero reads).
// system groups related projects into one planet (default: the project itself); nest: false keeps it off the hero.
// scope is the registry scope (work or personal); empty or absent when the entry has none.
// nest_scope (work, personal or both) is the Nest filter scope; the registry fills it from scope when unset.
export interface RegProject { name: string; path?: string; status?: string; short?: string; system?: string; nest?: boolean; scope?: string; nest_scope?: string; kind?: string; planet?: string }

// Active registered projects, in registry order.
export const registryOf = (b: SectionBody | undefined) =>
  list<RegProject>(obj(b).projects).filter((p) => p.name && (!p.status || p.status === 'active'))
