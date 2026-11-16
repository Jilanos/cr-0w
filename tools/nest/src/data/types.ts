// Records from logics/specs/core_contract/schemas. Keep in step with the schemas.

export type MissionState =
  | 'preflight' | 'queued' | 'running' | 'waiting' | 'review'
  | 'publishing' | 'done' | 'failed' | 'cancelled'

export type RunCause = 'done' | 'usage_limit' | 'budget' | 'timeout' | 'error' | 'stopped' | null

export interface Run {
  run: string
  mission: string
  account: string
  version: number
  cold: boolean
  started: string
  ended: string | null
  cause: RunCause
  exit: number | null
}

export interface Mission {
  id: string
  kind: string
  batch: string | null
  scope: 'work' | 'personal' | 'crow'
  data_class: 'work' | 'personal' | 'private'
  project: string
  goal: string
  end_state: string
  autonomy: 'ask' | 'notify' | 'auto'
  gates: Array<'plan' | 'report' | 'mockup'>
  state: MissionState
  runs: Run[]
  version: number
  validation: string | null
  file_scope: string[]
  budget: { time_min: number; budget_usd: number; resumes: number }
  branch: string | null
  worktree: string | null
  mr: string | null
  created: string
  updated: string
}

// Calendar event. Not in the core contract yet: fixtures only until the agenda API lands.
export interface AgendaEvent {
  id: string
  title: string
  start: string
  end: string
}

// Core sections served from the deck's bin/ scripts (item_169). data is the script's
// JSON as is; its shape belongs to the script contract (logics/specs/script_contract).
// work is core's own feed over those sections (item_202), read the same way (data/work.ts).
export const SCRIPT_SECTIONS = ['sessions', 'dispatch', 'usage', 'today', 'mrs', 'checks', 'projects', 'accounts', 'jobs', 'work'] as const
export type SectionName = (typeof SCRIPT_SECTIONS)[number]

export interface SectionBody {
  data: unknown
  // The last run failed (or none ran yet): data is the last good body, error says why.
  stale: boolean
  error?: string
  // When data last changed; null before the first good run.
  updated_at: string | null
}

// crow-today json, the part Nest reads.
export interface TodayEvent {
  start: string
  end: string
  subject: string
  all_day: boolean
}

export type InboxVerb =
  | 'go' | 'dig' | 'no' | 'ok' | 'msg' | 'abandon' | 'pick' | 'change' | 'approve' | 'answer'

export interface InboxItem {
  id: string
  mission: string
  kind: string
  project: string
  type: 'choice' | 'approval' | 'review' | 'fyi' | 'needs-input'
  source: 'plan' | 'report' | 'mockup' | 'questions'
  version: number
  file: string
  ask: string
  verbs: InboxVerb[]
  blocking: boolean
  artifacts: string[]
  state: 'open' | 'answered' | 'dropped'
  created: string
  answered: string | null
}
