import type { Snapshot } from './feed'
import { registryOf, type Agent, type Mail, type ReadyItem, type RegProject, type Resumable } from './live'
import { projectOfAgent, projectOfCwd } from '../hero/model'
import type { InboxItem, Mission, SectionBody } from './types'
import { workOf, type WorkItem } from './work'

// Nest scope filter (item_206): all, work or perso, read by every screen except Chat.
export type ScopeMode = 'all' | 'work' | 'perso'
export const SCOPE_MODES: ScopeMode[] = ['all', 'work', 'perso']
export const isScopeMode = (v: unknown): v is ScopeMode => SCOPE_MODES.includes(v as ScopeMode)
// The header chip cycles all > work > perso > all.
export const nextScope = (m: ScopeMode): ScopeMode => SCOPE_MODES[(SCOPE_MODES.indexOf(m) + 1) % SCOPE_MODES.length]

// Text of the header chip: visible label, accessible name, pressed while a filter is on.
export function scopeChip(m: ScopeMode) {
  return { label: m, name: `Scope: ${m}. Switch to ${nextScope(m)}`, pressed: m !== 'all' }
}

// Scope of one thing; both shows under every mode, undefined = unknown, shown under all only.
export type Side = 'work' | 'perso' | 'both' | undefined

// Nest scope of a project (nest_scope, else scope): work, personal is perso, both, anything else unknown.
export function projectSide(name: string, registry: RegProject[]): Side {
  const p = registry.find((x) => x.name === name)
  const s = p?.nest_scope || p?.scope
  return s === 'work' ? 'work' : s === 'personal' ? 'perso' : s === 'both' ? 'both' : undefined
}

// Mission scope: work is work, personal is perso. A crow mission takes its hub
// project's registry scope (both shows it everywhere), perso when the registry has none.
export function missionSide(m: Mission, registry: RegProject[] = []): Side {
  if (m.scope === 'work') return 'work'
  if (m.scope === 'personal') return 'perso'
  if (m.scope === 'crow') return projectSide(m.project, registry) ?? 'perso'
  return undefined
}

// An ask takes its project's registry scope; on a project the registry does not know, its mission's.
export function askSide(r: InboxItem, registry: RegProject[], missions: Mission[]): Side {
  if (registry.some((p) => p.name === r.project)) return projectSide(r.project, registry)
  const m = missions.find((x) => x.id === r.mission)
  return m ? missionSide(m, registry) : undefined
}

// A work item (item_204) takes its project's registry scope. A mission item on a
// project the registry does not know takes its mission's scope.
export function workSide(w: WorkItem, registry: RegProject[], missions: Mission[]): Side {
  const side = projectSide(w.project, registry)
  if (side || w.kind !== 'mission') return side
  const m = missions.find((x) => x.id === w.source.ref)
  return m ? missionSide(m, registry) : undefined
}

// The Today section reads the work mailbox. A personal mail source tags its rows perso.
export const TODAY_MAIL_SIDE: Side = 'work'

const keep = (mode: ScopeMode, side: Side) => mode === 'all' || side === mode || side === 'both'

export interface ScopeIn { missions: Mission[]; inbox: InboxItem[]; registry: RegProject[]; agents: Agent[]; parked: Resumable[] }

// Filters each list to the mode. Sessions and runs take their project's registry
// scope; the cwd lookup uses the whole registry. The registry keeps the matching
// projects only, so a mixed system keeps its matching members.
export function scopeOf(d: ScopeIn, mode: ScopeMode): ScopeIn {
  if (mode === 'all') return d
  const reg = d.registry
  const known = new Set([...reg.map((p) => p.name), ...d.missions.map((m) => m.project)])
  return {
    missions: d.missions.filter((m) => keep(mode, missionSide(m, reg))),
    inbox: d.inbox.filter((r) => keep(mode, askSide(r, reg, d.missions))),
    registry: reg.filter((p) => keep(mode, projectSide(p.name, reg))),
    agents: d.agents.filter((a) => keep(mode, projectSide(projectOfAgent(a, reg, known), reg))),
    parked: d.parked.filter((r) => keep(mode, projectSide(projectOfCwd(r.cwd, reg) ?? r.project, reg))),
  }
}

const obj = (b: SectionBody) => (b.data && typeof b.data === 'object' ? (b.data as Record<string, unknown>) : undefined)
const arr = <T>(b: SectionBody, key: string) => { const v = obj(b)?.[key]; return Array.isArray(v) ? (v as T[]) : [] }
// Replaces lists of a section body; a body with no data stays as it is.
const withLists = (b: SectionBody, lists: Record<string, unknown[]>): SectionBody => (obj(b) ? { ...b, data: { ...obj(b), ...lists } } : b)

// Mail rows of the mode, each tagged with its scope (an untagged row takes the source's).
const mailIn = (b: SectionBody, key: string, side: Side, mode: ScopeMode) =>
  arr<Mail>(b, key).map((m) => ({ ...m, scope: m.scope ?? side })).filter((m) => keep(mode, m.scope))

// The snapshot every screen but Chat reads under a mode. Usage, accounts, checks,
// MRs and the Today calendar are not per project and stay whole.
export function scopeSnapshot(s: Snapshot, mode: ScopeMode): Snapshot {
  if (mode === 'all') return s
  const { projects, dispatch, sessions, today, work, ready } = s.sections
  const registry = arr<RegProject>(projects, 'projects')
  const reg = registryOf(projects)
  const items = workOf(work)
  const f = scopeOf({
    missions: s.missions, inbox: s.inbox, registry: reg,
    agents: arr<Agent>(dispatch, 'agents'), parked: arr<Resumable>(sessions, 'sessions'),
  }, mode)
  return {
    ...s,
    missions: f.missions,
    inbox: f.inbox,
    sections: {
      ...s.sections,
      projects: withLists(projects, { projects: registry.filter((p) => keep(mode, projectSide(p.name, registry))) }),
      dispatch: withLists(dispatch, { agents: f.agents }),
      sessions: withLists(sessions, { sessions: f.parked }),
      ready: withLists(ready, { items: arr<ReadyItem>(ready, 'items').filter((i) => keep(mode, projectSide(i.project, reg))) }),
      work: items ? { ...work, data: items.filter((w) => keep(mode, workSide(w, reg, s.missions))) } : work,
      today: withLists(today, {
        flagged: mailIn(today, 'flagged', TODAY_MAIL_SIDE, mode),
        important: mailIn(today, 'important', TODAY_MAIL_SIDE, mode),
      }),
    },
  }
}
