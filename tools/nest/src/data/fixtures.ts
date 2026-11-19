import { missions as coreMissions, inbox as coreInbox } from 'virtual:core-records'
import stateMissions from '../../fixtures/states/missions.json'
import stateInbox from '../../fixtures/states/inbox.json'
import stateAgenda from '../../fixtures/states/agenda.json'
import stateLive from '../../fixtures/states/live.json'
import stateWork from '../../fixtures/states/work.json'
import { ApiError } from './api'
import { fixtureButler, type ButlerMsg } from './butler'
import type { ChatTarget, ConversationPage, Entry, PageAsk } from './conversation'
import type { Actions, Dispatch, LiveReply } from './live'
import type { DataSource } from './source'
import { CANCELLABLE } from './state'
import type { AgendaEvent, InboxItem, InboxVerb, Mission, SectionBody, SectionName } from './types'

// Shared core-contract records plus Nest-local records that cover every UI state.
const MISSIONS = [...coreMissions, ...stateMissions] as Mission[]
const INBOX = [...coreInbox, ...stateInbox] as InboxItem[]
const AGENDA = stateAgenda as AgendaEvent[]
const NOW = new Date('2026-11-09T16:10:00+01:00')
// Sections without a state fixture stay empty until their screens bring one (item_171/172).
const NO_SECTION: SectionBody = { data: null, stale: false, updated_at: null }
type LiveData = Partial<Record<SectionName, unknown>>
// The work feed (item_204) over the live fixture: one row per kind and state, a mission rollup.
const LIVE: LiveData = { ...stateLive, work: stateWork }

// In-memory live actions over the fixture sections: they check targets like core
// (404 unknown, 409 full slots) and change the section so a refetch shows the result.
type MissionActions = 'missionAnswer' | 'missionStop' | 'missionCancel' | 'inboxHide'

function fixtureActions(data: LiveData, bodies: Map<SectionName, SectionBody>, now: Date): Omit<Actions, MissionActions> {
  const set = (name: SectionName, v: unknown) => {
    data[name] = v
    bodies.delete(name)
  }
  const dispatch = () => data.dispatch as Dispatch
  const reply = (action: string, target: string, extra: Partial<LiveReply> = {}): LiveReply =>
    ({ ts: now.toISOString(), actor: 'owner', surface: 'nest', action, target, ok: true, code: 0, message: 'done', ...extra })
  const agent = (pid: number) => {
    const a = dispatch().agents.find((x) => x.pid === pid)
    if (!a) throw new ApiError(404, `no live session with pid ${pid}`)
    return a
  }
  const drop = (pid: number) => {
    const d = dispatch()
    const a = agent(pid)
    set('dispatch', { ...d, slots: { ...d.slots, busy: d.slots.busy - (a.kind === 'run' ? 1 : 0) }, agents: d.agents.filter((x) => x !== a) })
    return a
  }
  return {
    async send(pid, text) {
      const a = agent(pid)
      if (!text.trim()) throw new ApiError(400, 'text is empty')
      return reply('send', String(pid), { text, account: a.account, project: a.project })
    },
    async interrupt(pid) {
      const a = agent(pid)
      return reply('interrupt', String(pid), { account: a.account, project: a.project })
    },
    async answer(pid, prompt, option) {
      const a = agent(pid)
      const p = a.prompt
      if (!p || p.id !== prompt) throw new ApiError(409, `pid ${pid} no longer waits on prompt ${prompt}`)
      if (option === 'allow' && p.work_approval) throw new ApiError(409, `work approval on ${p.work_approval}: give it in approvals`)
      const d = dispatch()
      set('dispatch', { ...d, agents: d.agents.map((x) => (x === a ? { ...x, prompt: null, state: option === 'allow' ? 'working' : 'idle' } : x)) })
      return reply('answer', String(pid), { text: `${option}: ${p.tool} ${p.detail}`, account: a.account, project: a.project })
    },
    async ask(pid, prompt, answers) {
      const a = agent(pid)
      const p = a.prompt
      if (!p || p.id !== prompt) throw new ApiError(409, `pid ${pid} no longer waits on prompt ${prompt}`)
      if (!p.questions || answers.length !== p.questions.length) throw new ApiError(400, 'answers: one entry per question')
      const d = dispatch()
      set('dispatch', { ...d, agents: d.agents.map((x) => (x === a ? { ...x, prompt: null, state: 'working' } : x)) })
      return reply('answer', String(pid), { text: `answers: ${p.tool} ${p.detail}`, account: a.account, project: a.project })
    },
    async stop(pid) {
      const a = drop(pid)
      return reply('stop', String(pid), { account: a.account, project: a.project })
    },
    async attach(pid) {
      const a = dispatch().agents.find((x) => x.pid === pid)
      if (!a) throw new ApiError(404, `no agent with pid ${pid}`)
      return reply('attach', String(pid), { account: a.account, project: a.project, message: a.tmux ? `opened a terminal on tmux session ${a.tmux}` : 'focused its window' })
    },
    // A fixed claude screen with colors; keys and resize only check the target (sessions, not runs).
    async screen(pid) {
      const a = agent(pid)
      if (a.kind === 'run') throw new ApiError(409, `${pid} is a background run, it has no screen`)
      const lines = ['\x1b[38;5;174m╭───────────────────────────────╮\x1b[39m', `\x1b[38;5;174m│\x1b[39m \x1b[1m${a.project}\x1b[22m on ${a.account}`, '\x1b[38;5;174m╰───────────────────────────────╯\x1b[39m', '', '\x1b[2m> \x1b[22m']
      return { lines, cols: 80, rows: 24, cursor: { x: 2, y: 4, shown: true } }
    },
    async keys(pid) {
      if (agent(pid).kind === 'run') throw new ApiError(409, `${pid} is a background run, it has no screen`)
      return { ok: true }
    },
    async resize(pid) {
      if (agent(pid).kind === 'run') throw new ApiError(409, `${pid} is a background run, it has no screen`)
      return { ok: true }
    },
    async stopRun(run) {
      const a = dispatch().agents.find((x) => x.run_id === run)
      if (!a) throw new ApiError(404, `no running dispatch run ${run}`)
      drop(a.pid)
      return reply('run-stop', run, { account: a.account, project: a.project })
    },
    async retryRun(run) {
      const d = dispatch()
      const f = (d.finished ?? []).find((x) => x.run_id === run)
      if (!f) throw new ApiError(404, `no finished run "${run}"`)
      if (d.slots.busy >= d.slots.max) throw new ApiError(409, `too_many_runs: ${d.slots.busy} runs already running`)
      const id = `r${String(d.agents.length).padStart(7, '0')}`
      const account = f.account ?? 'work'
      set('dispatch', {
        ...d,
        slots: { ...d.slots, busy: d.slots.busy + 1 },
        finished: (d.finished ?? []).filter((x) => x !== f),
        agents: [...d.agents, { kind: 'run', pid: 9500 + d.agents.length, account, project: f.project, cwd: `/src/${f.project}.wt/${f.label ?? run}`, run_id: id, label: f.label ?? run, title: f.label ?? run, state: 'working', started_at: now.toISOString() }],
      })
      return reply('run-retry', run, { account, project: f.project, run_id: id, message: `retried ${run} as ${id}` })
    },
    async resume(id, account) {
      const rows = (data.sessions as { sessions: Array<{ conversation_id: string; account: string; project: string }> }).sessions
      const r = rows.find((x) => x.conversation_id === id)
      if (!r) throw new ApiError(404, `no session "${id}"`)
      return reply('resume', id, { account: account ?? r.account, project: r.project, message: `resumed ${r.project}` })
    },
    // A headless start (item_188): the session shows up at once with its tmux session.
    async start(s) {
      const d = dispatch()
      const account = s.account ?? 'main'
      const tmux = `crow-${s.project}-${String(d.agents.length).padStart(6, '0')}`
      set('dispatch', {
        ...d,
        agents: [...d.agents, { kind: 'session', pid: 8000 + d.agents.length, account, project: s.project, cwd: `/src/${s.project}`, state: 'working', started_at: now.toISOString(), last_prompt: s.prompt ?? null, tmux }],
      })
      return reply('start', s.project, { text: s.prompt, account, project: s.project, message: `started ${s.project} on ${account}, no window`, tmux })
    },
    async dispatch(r) {
      const d = dispatch()
      if (d.slots.busy >= d.slots.max) throw new ApiError(409, `too_many_runs: ${d.slots.busy} runs already running`)
      const run = `f${String(d.agents.length).padStart(7, '0')}`
      const pid = 9000 + d.agents.length
      set('dispatch', {
        ...d,
        slots: { ...d.slots, busy: d.slots.busy + 1 },
        agents: [...d.agents, { kind: 'run', pid, account: r.account ?? 'work', project: r.project, cwd: `/src/${r.project}.wt/${r.label}`, run_id: run, label: r.label, title: r.prompt, state: 'working', started_at: now.toISOString() }],
      })
      return reply('dispatch', r.project, { text: r.prompt, account: r.account ?? 'work', project: r.project, run_id: run, message: `dispatched run ${run}` })
    },
    async mail(id, verb) {
      const t = data.today as { important: Array<{ id: string }>; flagged: Array<{ id: string }> }
      if (![...t.important, ...t.flagged].some((m) => m.id === id)) throw new ApiError(404, `no mail ${id}`)
      set('today', { ...t, important: t.important.filter((m) => m.id !== id), flagged: t.flagged.filter((m) => m.id !== id) })
      return reply(verb, id)
    },
  }
}

// The board chat (chat-cover): a user turn, folded tools, a list reply, a question.
const at = (hm: string) => `2026-11-09T${hm}:00+01:00`
const tool = (id: string, hm: string, name: string): Entry[] => [
  { at: at(hm), id: `${id}c`, role: 'tool', text: '', tool_name: name, tool_summary: 'Call recorded' },
  { at: at(hm), id: `${id}r`, role: 'tool', text: '', tool_name: name, tool_summary: 'Result recorded' },
]
export const CHAT: Entry[] = [
  { at: at('15:58'), id: 'e1', role: 'user', text: 'basically i want to be able to chat with you easily from the phone, not the diffs, all the text' },
  ...tool('t1', '15:58', 'Read'), ...tool('t2', '15:58', 'Bash'), ...tool('t3', '15:59', 'Read'), ...tool('t4', '15:59', 'Bash'),
  { at: at('15:59'), id: 'e2', role: 'assistant', text: 'Clear. On the phone you get every word I write, no diffs or logs.\n\nWhat changes:\n- Tap a session: its chat opens\n- Replies show in full, line breaks kept\n- Tool calls fold to one line, tap to open\n- The box at the bottom talks to that session' },
  { at: at('16:01'), id: 'e3', role: 'user', text: 'show me how it looks in nest' },
  ...['Bash', 'Read', 'Edit', 'Bash', 'Read', 'Edit', 'Bash', 'Read', 'Edit'].flatMap((n, i) => tool(`u${i}`, '16:02', n)),
  { at: at('16:06'), id: 'e4', role: 'assistant', text: 'Agenda modern is updated: reminder card, +38 -6.\n\nPublish now or continue with Reports?' },
]

// Pages over one in-memory list per target: the cursor is the count already read.
function fixtureChats(known: (t: ChatTarget) => void) {
  const chats = new Map<string, Entry[]>()
  const list = (t: ChatTarget) => {
    known(t)
    const k = 'pid' in t ? `p${t.pid}` : `m${t.mission}`
    let l = chats.get(k)
    if (!l) chats.set(k, (l = [...CHAT]))
    return l
  }
  const page = async (t: ChatTarget, p: PageAsk): Promise<ConversationPage> => {
    const l = list(t)
    let from = Math.max(0, l.length - (p.tail ?? 50))
    let to = l.length
    if (p.cursor) from = Number(p.cursor)
    else if (p.before) [from, to] = [Math.max(0, Number(p.before) - 50), Number(p.before)]
    return {
      account: 'rk1', conversation_id: 'fixture', entries: l.slice(from, to),
      next_cursor: String(l.length), before_cursor: from > 0 ? String(from) : undefined, has_more: from > 0,
    }
  }
  const said = (pid: number, text: string, now: Date) => list({ pid }).push({ at: now.toISOString(), id: `s${Math.random()}`, role: 'user', text })
  return { page, said }
}

// The exchange the desk-rail-a board draws (item_176).
const BUTLER_SEED: ButlerMsg[] = [
  { seq: 1, ts: '2026-11-09T14:20:00Z', role: 'you', text: 'Start a review of !224 lambda', surface: 'nest' },
  { seq: 2, ts: '2026-11-09T14:20:00Z', role: 'crow', text: 'Review mission started for !224, Sir. It runs on main.', account: 'main',
    chips: [{ label: 'Open mission', href: '/missions/20261109-build-mr-pipeline-badge' }] },
  { seq: 3, ts: '2026-11-09T14:31:00Z', role: 'you', text: "What's running?", surface: 'nest' },
  { seq: 4, ts: '2026-11-09T14:31:00Z', role: 'crow', text: 'Two sessions and one run, Sir. S1 Nest waits on you for a Bash approval. The infra push run failed: token rotation.', account: 'main',
    chips: [{ label: 'Open S1', href: '/desk' }, { label: 'Allow in Inbox', href: '/inbox' }, { label: 'Show failure', href: '/missions/20261109-fix-push-token-refresh' }] },
  { seq: 5, ts: '2026-11-09T14:33:00Z', role: 'you', text: 'Why did the token rotation fail?', surface: 'nest' },
  { seq: 6, ts: '2026-11-09T14:33:00Z', role: 'tool', text: 'read run log · infra push · 2 files' },
  { seq: 7, ts: '2026-11-09T14:34:00Z', role: 'crow', text: 'The refresh call got a 401, Sir. The deploy key expired yesterday at 18:00. A new key in the vault fixes it; the run can retry after that.', account: 'main',
    chips: [{ label: 'Show failure', href: '/missions/20261109-fix-push-token-refresh' }] },
  { seq: 8, ts: '2026-11-09T14:36:00Z', role: 'you', text: 'ok rotate it and retry', surface: 'nest' },
  { seq: 9, ts: '2026-11-09T14:36:00Z', role: 'crow', text: 'That needs your OK on infra, Sir. I put the request in your Inbox.', account: 'main',
    chips: [{ label: 'Allow in Inbox', href: '/inbox' }] },
  { seq: 10, ts: '2026-11-09T14:40:00Z', role: 'you', text: 'what is left for today?', surface: 'nest' },
  { seq: 11, ts: '2026-11-09T14:40:00Z', role: 'crow', text: 'Three things, Sir. The management weekly at 15:00, its prep is ready. Two reviews wait on you: !226 and !231. Sprint planning prep is due at 17:30.', account: 'main',
    chips: [{ label: 'Open prep', href: '/agenda' }, { label: 'Open reviews', href: '/mrs' }] },
]

export function fixtureSource(missions: Mission[] = MISSIONS, inbox: InboxItem[] = INBOX, now: Date = NOW, agenda: AgendaEvent[] = AGENDA, live: LiveData = LIVE): DataSource {
  const data: LiveData = structuredClone(live)
  // One body object per section version, so unchanged sections keep their reference.
  const bodies = new Map<SectionName, SectionBody>()
  const section = async (name: SectionName) => {
    if (!(name in data)) return NO_SECTION
    let b = bodies.get(name)
    if (!b) bodies.set(name, (b = { data: data[name], stale: false, updated_at: now.toISOString() }))
    return b
  }
  const rec = { missions, inbox }
  const actions = { ...fixtureActions(data, bodies, now), ...missionActions(rec, now) }
  const chats = fixtureChats((t) => {
    if ('pid' in t && !(data.dispatch as Dispatch | undefined)?.agents.some((a) => a.pid === t.pid)) throw new ApiError(404, `no live session with pid ${t.pid}`)
    if ('mission' in t && !rec.missions.some((m) => m.id === t.mission)) throw new ApiError(404, 'no mission')
  })
  const send = actions.send
  actions.send = async (pid, text) => {
    const r = await send(pid, text)
    chats.said(pid, text, now)
    return r
  }
  return {
    missions: async () => rec.missions,
    mission: async (id) => rec.missions.find((m) => m.id === id),
    inbox: async () => rec.inbox,
    agenda: async () => agenda,
    section,
    conversation: chats.page,
    actions,
    now: () => now,
    butler: fixtureButler(now, BUTLER_SEED),
  }
}


// In-memory mission actions with the checks of core (internal/mission): exact ids,
// open rows, the version the owner saw, verbs of the row. Each change swaps the array
// so a refetch sees new references.
function missionActions(rec: { missions: Mission[]; inbox: InboxItem[] }, now: Date): Pick<Actions, MissionActions> {
  const ts = now.toISOString()
  const find = (id: string) => {
    const m = rec.missions.find((x) => x.id === id)
    if (!m) throw new ApiError(404, `no mission "${id}"`)
    return m
  }
  const put = (m: Mission) => { rec.missions = rec.missions.map((x) => (x.id === m.id ? m : x)) }
  const row = (r: InboxItem) => { rec.inbox = rec.inbox.map((x) => (x.id === r.id ? r : x)) }
  return {
    async missionAnswer(mission: string, item: string, verb: InboxVerb, text: string, version: number) {
      const m = find(mission)
      const id = item.startsWith(`${mission}/`) ? item : `${mission}/${item}`
      const r = rec.inbox.find((x) => x.id === id)
      if (!r) throw new ApiError(404, `no inbox item "${id}"`)
      if (version !== m.version) throw new ApiError(409, `${id}: answered from v${version}, the mission is at v${m.version}`)
      if (r.state !== 'open') throw new ApiError(409, `${id} is ${r.state}`)
      if (!r.verbs.includes(verb)) throw new ApiError(400, `verb "${verb}", want one of ${r.verbs.join(', ')}`)
      row({ ...r, state: 'answered', answered: ts })
      if (!rec.inbox.some((x) => x.mission === mission && x.state === 'open')) put({ ...m, state: 'queued', updated: ts })
      return { item: id, verb, text, state: 'queued' }
    },
    async missionStop(mission: string) {
      const m = find(mission)
      if (m.state !== 'running') throw new ApiError(409, `${mission} is ${m.state}; only a running mission stops`)
      put({ ...m, state: 'waiting', updated: ts, runs: m.runs.map((r) => (r.ended ? r : { ...r, ended: ts, cause: 'stopped' as const })) })
      return find(mission)
    },
    async missionCancel(mission: string) {
      const m = find(mission)
      if (!CANCELLABLE.includes(m.state)) throw new ApiError(409, `${mission} is ${m.state} and cannot be cancelled`)
      put({ ...m, state: 'cancelled', updated: ts, runs: m.runs.map((r) => (r.ended ? r : { ...r, ended: ts, cause: 'stopped' as const })) })
      rec.inbox = rec.inbox.map((x) => (x.mission === mission && x.state === 'open' ? { ...x, state: 'dropped' as const } : x))
      return find(mission)
    },
    async inboxHide(item: string) {
      const r = rec.inbox.find((x) => x.id === item)
      if (!r) throw new ApiError(404, `no inbox item "${item}"`)
      if (r.state !== 'open') throw new ApiError(409, `${item} is ${r.state}`)
      row({ ...r, state: 'dropped' })
      return rec.inbox.find((x) => x.id === item)
    },
  }
}
