import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react'
import { ApiError } from '../data/api'
import { deliveryOf, pendingOf, type Delivery, type Pending } from '../data/delivery'
import { useConversation } from '../data/useConversation'
import { DeliveryLine, useDeliveryClock } from '../ui/Delivery'
import { accountsOf, dispatchOf, projectsOf, resumableOf, type Account, type Agent, type AskAnswer, type LiveReply, type Resumable } from '../data/live'
import { useSource, type Snapshot } from '../data/useData'
import { ago, elapsed, time, title } from '../format'
import type { Mission } from '../data/types'
import { missionOfRun } from '../data/state'
import { Link, navigate } from '../router'
import { Sheet, type Confirm } from '../ui/Sheet'
import { AskDock } from '../ui/AskDock'
import { promptView } from '../ui/prompt'
import { enterSubmits, rowsOf } from '../ui/keys'
import { Chat as AgentChat } from './Chat'
import { LAPTOP, useMedia } from '../ui/useMedia'
import { deskWork, workCounts, workOf, type WorkItem } from '../data/work'
import { WorkList } from '../ui/WorkList'

// Desk (item_138 boards desk, fold-desk-inner, fold-desk-cover) on the live actions of
// item_170. Every action goes through the confirm sheet, then the feed refetches.
const MODELS = ['default', 'sonnet', 'opus', 'haiku']
const INNER = '(min-width: 600px)'
const LATER = 'Arrives with the live API'
const nameOf = (a: Agent) => (a.kind === 'run' ? a.label || a.run_id || String(a.pid) : a.title || a.project)
// setup (item_240): a headless session stuck on a first-run dialog; its Terminal tab answers it.
const waits = (a: Agent) => a.state === 'waiting' || a.state === 'setup'
const said = (a: Agent) => (a.state === 'setup' ? 'waits on setup' : waits(a) ? 'waits' : a.state)

// ---- icons (board paths) ----
const Ring = ({ dashed, c = 'c-w' }: { dashed?: boolean; c?: string }) => (
  <svg className={c} width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="2" strokeDasharray={dashed ? '3 2.4' : undefined} />
    {!dashed && <circle cx="8" cy="8" r="2.5" fill="currentColor" />}
  </svg>
)
const Spin = () => (
  <svg className="c-w" width="14" height="14" viewBox="0 0 22 22" fill="none" aria-hidden="true">
    <circle cx="11" cy="11" r="4" fill="currentColor" /><path d="M11 2a9 9 0 0 1 9 9" stroke="currentColor" strokeWidth="2" />
  </svg>
)
const Diamond = ({ s = 12 }: { s?: number }) => (
  <svg className="c-n" width={s} height={s} viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1 15 8 8 15 1 8Z" fill="currentColor" /></svg>
)
const Play = () => (
  <svg className="c-b" width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M5 3 13 8 5 13Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" /></svg>
)
const Mic = ({ s = 18 }: { s?: number }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
    <rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
  </svg>
)
const Unfold = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
    <rect x="3" y="4" width="8" height="16" rx="2" /><path d="M15 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4M14 12h4m-2-2 2 2-2 2" />
  </svg>
)

interface Line { t?: string; tool: string; text: string; says?: boolean }
// Timeline of an agent from what the runs section carries: start, last prompt, last action.
function linesOf(a: Agent, now: Date): Line[] {
  const out: Line[] = []
  if (a.started_at) out.push({ t: time(new Date(a.started_at)), tool: 'Start', text: `${a.project} · ${a.account} · ${ago(a.started_at, now)} ago` })
  if (a.last_prompt) out.push({ tool: 'You', text: a.last_prompt })
  if (a.last_action) {
    const m = /^([\w-]+):\s*(.*)$/.exec(a.last_action)
    const tool = m ? m[1] : a.last_action
    const says = tool.toLowerCase() === 'says'
    out.push({ tool: says ? 'Says' : tool, text: m ? m[2] : '', says })
  }
  return out
}

// A Tell it message carries its pending send and delivery state.
interface Msg { me?: boolean; text: string; f?: boolean; p?: Pending; state?: Delivery }
type Form = 'run' | 'session' | null

// State and action builders shared by the three sizes.
function useDesk(snap: Snapshot, refresh: () => Promise<void>) {
  const src = useSource()
  const act = src.actions
  const { slots, agents } = dispatchOf(snap.sections.dispatch)
  const runs = agents.filter((a) => a.kind === 'run')
  const sessions = agents.filter((a) => a.kind === 'session')
  const resumable = resumableOf(snap.sections.sessions)
  const projects = projectsOf(snap.sections.projects)
  const accounts = accountsOf(snap.sections.accounts)

  const [sheet, setSheet] = useState<Confirm | null>(null)
  const [log, setLog] = useState<Msg[]>([])
  // Home links open a row directly: /desk?pid=N (&tell=1 opens the reply box).
  const [sel, setSel] = useState<number | null>(() => Number(new URLSearchParams(location.search).get('pid')) || null)
  const [tell, setTell] = useState(() => new URLSearchParams(location.search).get('tell') === '1')
  const [text, setText] = useState('')
  const [ask, setAsk] = useState('')
  const [form, setForm] = useState<Form>(null)
  const [run, setRun] = useState({ project: '', label: '', model: 'default', account: '', prompt: '' })
  const [start, setStart] = useState({ project: '', account: '', prompt: '' })
  // tmux session of a session just started here: its chat opens once a poll shows it (item_188).
  const [opening, setOpening] = useState<string | null>(null)

  const picked = agents.find((a) => a.pid === sel) ?? runs[0] ?? sessions.find((a) => a.state === 'working') ?? agents[0]
  const slotOf = (a: Agent) => (a.kind === 'run' ? `S${runs.indexOf(a) + 1}` : '')
  const since = (a: Agent) => (a.started_at ? elapsed(a.started_at, snap.now) : '')

  // Success closes the sheet and answers in the chat; a refusal stays in the sheet
  // (thrown) and refetches when the view was stale (409).
  const wrap = (said: string, call: () => Promise<LiveReply>, done?: () => void) => async () => {
    try {
      const r = await call()
      setLog((l) => [...l, { me: true, text: said }, { text: r.message || `${r.action} ${r.target}`, f: !r.ok }])
      done?.()
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) void refresh()
      throw e
    }
    void refresh()
  }
  const where = (a: Agent) => `${a.project} (${a.account})`
  const tgt = (a: Agent): Array<[string, string]> => [['session', nameOf(a)], ['account', a.account], ['pid', String(a.pid)]]

  // A message typed into a session shows "sending…" in the chat until its transcript
  // carries the turn (item_208). The tail read before the send is the baseline.
  const tellIt = async (a: Agent, t: string) => {
    const before = await src.conversation({ pid: a.pid }, { tail: 50 }).then((r) => r.entries, () => [])
    try {
      await act.send(a.pid, t)
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) void refresh()
      throw e
    }
    const p = pendingOf(a.pid, t, before, Date.now())
    setLog((l) => [...l.filter((m) => m.p?.pid !== a.pid || m.p.text !== t || m.state !== 'failed'), { me: true, text: `Tell ${nameOf(a)}: ${t}`, p, state: 'sending' }])
    void refresh()
  }
  const settle = (p: Pending, state: Delivery) => setLog((l) => l.map((m) => (m.p === p ? { ...m, state } : m)))
  const retell = (p: Pending) => {
    const a = agents.find((x) => x.pid === p.pid)
    if (!a) return setLog((l) => [...l, { text: 'That session is gone.', f: true }])
    tellIt(a, p.text).catch((e: Error) => setLog((l) => [...l, { text: e.message, f: true }]))
  }
  const send = (a: Agent) => setSheet({
    title: 'Send to session', lead: `Type this answer into ${where(a)} and press enter:`, quote: text, target: tgt(a),
    note: 'Lands in the open window, like typing it yourself.', ok: 'Send',
    run: async () => { await tellIt(a, text); setText(''); setTell(false) },
  })
  const pause = (a: Agent) => setSheet({
    title: 'Pause session', lead: `Interrupt the current turn of ${where(a)} (Escape in its window).`, target: tgt(a),
    note: 'The session stays open and waits for you.', ok: 'Pause', run: wrap(`Pause ${nameOf(a)}`, () => act.interrupt(a.pid)),
  })
  const stop = (a: Agent) => {
    const m = a.kind === 'run' && a.run_id ? missionOfRun(snap.missions, a.run_id) : undefined
    if (m) {
      setSheet({
        title: 'Stop mission run', lead: `Stop the run ${nameOf(a)} of ${title(m)}.`,
        target: [['mission', m.id.replace(/^\d{8}-/, '')], ['run', a.run_id!], ['project', a.project]],
        note: 'Tap again to confirm. Same as crow mission stop, logged with surface nest. The mission moves on at the next tick.', ok: 'Tap again to stop', danger: true,
        run: async () => {
          try {
            await act.missionStop(m.id)
          } catch (e) {
            if (e instanceof ApiError && e.status === 409) void refresh()
            throw e
          }
          setLog((l) => [...l, { me: true, text: `Stop ${nameOf(a)}` }, { text: `${title(m)} stopped.` }])
          setSel(null)
          void refresh()
        },
      })
      return
    }
    stopPlain(a)
  }
  const stopPlain = (a: Agent) => setSheet(a.kind === 'run' && a.run_id
    ? {
      title: 'Stop run', lead: `Stop the run ${nameOf(a)} of ${a.project}.`, target: [['run', a.run_id], ['project', a.project], ['account', a.account]],
      note: 'Tap again to confirm. Its commits stay on the run branch.', ok: 'Tap again to stop', danger: true,
      run: wrap(`Stop ${nameOf(a)}`, () => act.stopRun(a.run_id!), () => setSel(null)),
    }
    : {
      title: 'Stop session', lead: `End the claude session of ${a.project} (SIGTERM).`, target: tgt(a),
      note: 'Tap again to confirm. The window closes; the conversation can be resumed.', ok: 'Tap again to stop', danger: true,
      run: wrap(`Stop ${nameOf(a)}`, () => act.stop(a.pid), () => setSel(null)),
    })
  const dispatch = () => setSheet({
    title: 'Start a run', lead: 'Opens a new run on a free allowed account. Nothing is pushed.', quote: run.prompt,
    target: [['project', run.project], ['label', run.label], ['model', run.model], ['account', run.account || 'auto'], ['slots', `${slots.busy} of ${slots.max} busy`]],
    note: 'The prompt above is sent as written.', ok: 'Start run',
    run: wrap(`/dispatch ${run.project} ${run.label}`, () => act.dispatch({ project: run.project, label: run.label, prompt: run.prompt, model: run.model === 'default' ? undefined : run.model, account: run.account || undefined }),
      () => { setRun({ project: '', label: '', model: 'default', account: '', prompt: '' }); setForm(null) }),
  })
  const open = () => setSheet({
    title: 'New session', lead: `Starts a claude session on ${start.project} here, with no window. Its chat opens once it shows up.`, quote: start.prompt || undefined,
    target: [['project', start.project], ['account', start.account || 'auto']],
    note: 'Fails when that account is busy; nothing else is started. Its Terminal tab shows the session screen.', ok: 'Start session',
    run: wrap(`/session ${start.project}`, async () => {
      const r = await act.start({ project: start.project, account: start.account || undefined, prompt: start.prompt || undefined })
      if (r.tmux) setOpening(r.tmux)
      return r
    }, () => { setStart({ project: '', account: '', prompt: '' }); setForm(null) }),
  })
  const resume = (r: Resumable) => setSheet({
    title: 'Resume session', lead: `Reopens the conversation of ${r.project} here, with no window. Its chat opens once it shows up.`,
    target: [['project', r.project], ['account', r.account], ['id', r.conversation_id.slice(0, 8)]],
    note: 'Same conversation, same account.', ok: 'Resume', run: wrap(`Resume ${r.project}`, async () => {
      const res = await act.resume(r.conversation_id, r.account)
      if (res.tmux) setOpening(res.tmux)
      return res
    }),
  })
  // Queued missions sit under the slots; the row's ⋯ cancels one (crow mission cancel).
  const queue = snap.missions.filter((m) => m.state === 'queued' || m.state === 'preflight')
  const cancel = (m: Mission) => setSheet({
    title: 'Cancel the mission?', lead: `${title(m)} leaves the queue for good.`,
    target: [['mission', m.id.replace(/^\d{8}-/, '')], ['project', m.project], ['state', m.state]],
    note: 'Same as crow mission cancel. Logged with surface nest.', ok: 'Cancel mission', danger: true,
    run: async () => {
      try {
        await act.missionCancel(m.id)
      } catch (e) {
        if (e instanceof ApiError && e.status === 409) void refresh()
        throw e
      }
      setLog((l) => [...l, { me: true, text: `Cancel ${title(m)}` }, { text: `${title(m)} cancelled.` }])
      void refresh()
    },
  })
  const pick = (a: Agent, talk = false) => { setSel(a.pid); setTell(talk) }
  const fresh = opening ? agents.find((a) => a.tmux === opening) : undefined
  useEffect(() => {
    if (!fresh) return
    setOpening(null)
    if (matchMedia(INNER).matches) pick(fresh)
    else navigate(`/desk/${fresh.pid}`)
  }, [fresh?.pid])
  // The work feed (item_204) drives the list; null on a core without it (old sections stay).
  const work = workOf(snap.sections.work)
  const groups = deskWork(work ?? [])
  const shown = groups.reduce((n, g) => n + 1 + g.children.length, 0)
  const counts = work ? workCounts(work) : null
  // A row opens what it is: the live agent, the resume sheet, the mission, the MRs.
  // The cover has no side panel: a live row opens its chat screen there.
  const openWork = (w: WorkItem, cover = false) => {
    const ref = w.source.ref
    if (w.kind === 'session' || w.kind === 'run') {
      const a = agents.find((x) => (w.kind === 'run' ? x.run_id === ref : String(x.pid) === ref))
      if (a && cover) navigate(`/desk/${a.pid}`)
      else if (a) pick(a, waits(a) && !a.prompt)
      else if (w.kind === 'run' && w.mission) navigate(`/missions/${encodeURIComponent(w.mission)}`)
    } else if (w.kind === 'parked') {
      const r = resumable.find((x) => x.conversation_id === ref)
      if (r) resume(r)
    } else if (w.kind === 'mission') {
      navigate(`/missions/${encodeURIComponent(ref)}`)
    } else {
      navigate('/mrs')
    }
  }
  // A prompt answer is one tap: the card already shows the exact command (item_174).
  const answer = (a: Agent, key: 'allow' | 'deny') => {
    const p = a.prompt
    if (!p) return
    wrap(`${key === 'allow' ? 'Allow once' : 'Deny'} ${nameOf(a)}: ${p.tool} ${p.detail}`, () => act.answer(a.pid, p.id, key))()
      .catch((e: Error) => setLog((l) => [...l, { text: e.message, f: true }]))
  }
  // An AskUserQuestion answer sends every step at once (item_193).
  const [asking, setAsking] = useState(false)
  const answerAsk = (a: Agent, answers: AskAnswer[]) => {
    const p = a.prompt
    if (!p) return
    setAsking(true)
    wrap(`Answer ${nameOf(a)}`, () => act.ask(a.pid, p.id, answers))()
      .catch((e: Error) => setLog((l) => [...l, { text: e.message, f: true }]))
      .finally(() => setAsking(false))
  }

  // The ask box: /dispatch and /session open their form; free chat waits for the hub API.
  const submitAsk = () => {
    const t = ask.trim()
    if (!t) return
    const [cmd, ...rest] = t.split(/\s+/)
    if (cmd === '/dispatch' || cmd === '/session') {
      const words = rest.join(' ')
      const p = projects.find((x) => x === rest[0])
      if (cmd === '/dispatch') setRun((r) => ({ ...r, project: p ?? r.project, prompt: (p ? rest.slice(1).join(' ') : words) || r.prompt }))
      else setStart((s) => ({ ...s, project: p ?? s.project, prompt: (p ? rest.slice(1).join(' ') : words) || s.prompt }))
      setForm(cmd === '/dispatch' ? 'run' : 'session')
    } else {
      setLog((l) => [...l, { me: true, text: t }, { text: `Free chat with CR-0W: ${LATER.toLowerCase()}. Use /dispatch or /session.` }])
    }
    setAsk('')
  }

  return {
    snap, refresh, slots, agents, runs, sessions, resumable, projects, accounts,
    sheet, setSheet, log, picked, slotOf, since, pick, tell, setTell, text, setText, ask, setAsk, submitAsk,
    form, setForm, run, setRun, start, setStart,
    send, settle, retell, pause, stop, dispatch, open, resume, answer, answerAsk, asking, queue, cancel,
    work, groups, shown, counts, openWork,
  }
}
type D = ReturnType<typeof useDesk>

// ---- shared pieces ----
function Ph({ children, sm, id, className }: { children: ReactNode; sm?: ReactNode; id: string; className?: string }) {
  return <h2 className={`ph${className ? ` ${className}` : ''}`} id={id}><span>{children}</span>{sm != null && <span className="sm">{sm}</span>}</h2>
}

function Later({ children = LATER }: { children?: ReactNode }) {
  return <div className="sm later">{children}</div>
}

function TellBox({ d, a }: { d: D; a: Agent }) {
  const ref = useRef<HTMLTextAreaElement>(null)
  return (
    <form className="in tell" onSubmit={(e) => { e.preventDefault(); if (d.text.trim()) d.send(a) }}>
      <textarea ref={ref} autoFocus className="f1" rows={rowsOf(d.text)} value={d.text} onKeyDown={enterSubmits} onChange={(e) => d.setText(e.target.value)}
        placeholder={`Tell ${nameOf(a)}…`} aria-label={`Text for ${nameOf(a)}`} />
      <button type="submit" className="btn p" disabled={!d.text.trim()}>Send</button>
    </form>
  )
}

function Slots({ d, ib }: { d: D; ib?: boolean }) {
  const free = Math.max(0, d.slots.max - d.runs.length)
  return (
    <div className="list">
      {d.runs.map((a) => (
        <button type="button" key={a.pid} className={`row edge-w${a === d.picked ? ' on' : ''}`} aria-pressed={a === d.picked} onClick={() => d.pick(a)}>
          {ib ? <Spin /> : <Ring />}<span className="sm c-w">{d.slotOf(a)}</span>
          <span className="f1">{nameOf(a)}</span><span className="sm">{a.account}</span><span className="c-w num">{d.since(a)}</span>
        </button>
      ))}
      {Array.from({ length: free }, (_, i) => (
        <div key={`free${i}`} className="row q">
          <Ring dashed c="c-q" /><span className="sm">S{d.runs.length + i + 1}</span><span className="f1 sm">free slot</span>
        </div>
      ))}
      {d.queue.map((m, i) => (
        <div key={m.id} className="row q">
          <span className="grip" aria-hidden="true">⋮⋮</span><Ring dashed c="c-q" /><span className="sm">Q{i + 1}</span>
          <span className="f1">{title(m)}</span>
          <button type="button" className="ib" title="Cancel mission" aria-label={`Cancel ${title(m)}`} onClick={() => d.cancel(m)}>⋯</button>
        </div>
      ))}
    </div>
  )
}

// The permission prompt of a waiting session: the exact command and one button per option.
// A work push or MR shows only "Open in approvals" (item_175).
function Ask({ d, a }: { d: D; a: Agent }) {
  const p = a.prompt
  if (!p) return null
  const view = promptView(p)
  if (view === 'questions') {
    return <AskDock key={p.id} who={nameOf(a)} questions={p.questions!} busy={d.asking}
      onSend={(x) => d.answerAsk(a, x)} onCancel={() => d.answer(a, 'deny')} />
  }
  return (
    <div className="pq" role="group" aria-label={`Permission asked by ${nameOf(a)}`}>
      <div className="pqh"><span className="tool c-n">{p.tool}</span>{p.description && <span className="sm f1">{p.description}</span>}</div>
      <code className="pqc">{p.detail}</code>
      <div className="btnrow">
        {view === 'approval'
          ? <button type="button" className="btn p" disabled title="Approvals arrive with the approvals screen">Open in approvals</button>
          : p.options.map((o) => (
            <button type="button" key={o.key} className={`btn${o.key === 'allow' ? ' p' : ' x'}`} onClick={() => d.answer(a, o.key)}>{o.label}</button>
          ))}
      </div>
      {p.work_approval && <div className="sm">Work repo {p.work_approval}: give it on the exact text in approvals.</div>}
    </div>
  )
}

function Needs({ d, short }: { d: D; short?: boolean }) {
  const waiting = d.sessions.filter(waits)
  if (!waiting.length) return <div className="sm">Nothing waits on you.</div>
  return (
    <div className="list">
      {waiting.map((a) => (
        <div key={a.pid} className="row edge-n">
          <Diamond s={short ? 13 : 12} /><span className="f1">{nameOf(a)}<span className="sm"> · {a.account}</span></span>
          <button type="button" className="btn p" onClick={() => d.pick(a, !a.prompt)}>Answer</button>
        </div>
      ))}
    </div>
  )
}

// The Work panel (item_204 option A) in place of Needs you and Ready to run.
function Work({ d, id }: { d: D; id: string }) {
  return (
    <section className="pn grow work-pn" aria-labelledby={id}>
      <Ph id={id} sm={<span className="num">{d.shown}</span>}>Work</Ph>
      <div className="wscroll">
        <WorkList groups={d.groups} now={d.snap.now} open={d.openWork} />
      </div>
    </section>
  )
}

function Ready({ d }: { d: D }) {
  return (
    <div className="list">
      <div className="grp c-b">Resumable <span className="sm">{d.resumable.length}</span></div>
      {d.resumable.length === 0 && <div className="sm">No conversation to resume.</div>}
      {d.resumable.map((r) => (
        <div key={r.conversation_id} className="row">
          <Play /><span className="f1">{r.project}{r.last_prompt && <span className="sm"> · {r.last_prompt}</span>}</span>
          <span className="sm">{r.account}</span>
          <button type="button" className="ib p" title="Resume" aria-label={`Resume ${r.project}`} onClick={() => d.resume(r)}>▶</button>
          <button type="button" className="ib" title={`Queue: ${LATER.toLowerCase()}`} aria-label={`Queue ${r.project}`} disabled>+</button>
        </div>
      ))}
      <div className="grp c-m">Logics ready · suggested by CR-0W</div>
      <Later />
    </div>
  )
}

function Timeline({ d, a, term }: { d: D; a: Agent; term?: boolean }) {
  const lines = linesOf(a, d.snap.now)
  if (term) {
    return (
      <div className="term">
        {lines.map((l, i) => (
          <div key={i}><span className={i === lines.length - 1 && a.state === 'working' ? 'c-w' : 'c-d'}>{i === lines.length - 1 && a.state === 'working' ? '›' : '✓'}</span>{' '}
            <span className={l.says ? 'c-m' : 'c-b'}>{l.tool}</span> {l.text}</div>
        ))}
      </div>
    )
  }
  return (
    <div className="tls">
      {lines.map((l, i) => (
        <div key={i} className="tl"><b>{l.t ?? ''}</b><span className={`tool ${l.says ? 'c-m' : 'c-b'}`}>{l.tool}</span><span className="f1">{l.text}</span></div>
      ))}
    </div>
  )
}

// Allowed accounts only (accountsOf drops never); auto lets crow pick a free one.
function AccountField({ value, accounts, set }: { value: string; accounts: Account[]; set: (a: string) => void }) {
  return (
    <label>Account<select className="field" value={value} onChange={(e) => set(e.target.value)}>
      <option value="">auto</option>{accounts.map((a) => <option key={a.name} value={a.name}>{a.name} · {a.policy}</option>)}
    </select></label>
  )
}

function Forms({ d }: { d: D }) {
  if (d.form === 'run') {
    const r = d.run
    return (
      <form className="form msg cr" onSubmit={(e) => { e.preventDefault(); d.dispatch() }} aria-label="New run">
        <div className="fh"><b>/dispatch</b><button type="button" className="bare sm" onClick={() => d.setForm(null)}>Close</button></div>
        <label>Project<select className="field" value={r.project} onChange={(e) => d.setRun({ ...r, project: e.target.value })}>
          <option value="">Pick a project</option>{d.projects.map((p) => <option key={p}>{p}</option>)}
        </select></label>
        <label>Label<input className="field" value={r.label} onChange={(e) => d.setRun({ ...r, label: e.target.value })} placeholder="short-name" /></label>
        <label>Model<select className="field" value={r.model} onChange={(e) => d.setRun({ ...r, model: e.target.value })}>
          {MODELS.map((m) => <option key={m}>{m}</option>)}
        </select></label>
        <AccountField value={r.account} accounts={d.accounts} set={(account) => d.setRun({ ...r, account })} />
        <label>Prompt<textarea className="field" value={r.prompt} onChange={(e) => d.setRun({ ...r, prompt: e.target.value })} /></label>
        <button type="submit" className="btn p" disabled={!r.project || !r.label.trim() || !r.prompt.trim()}>Review run</button>
      </form>
    )
  }
  if (d.form === 'session') {
    const s = d.start
    return (
      <form className="form msg cr" onSubmit={(e) => { e.preventDefault(); d.open() }} aria-label="New session">
        <div className="fh"><b>/session</b><button type="button" className="bare sm" onClick={() => d.setForm(null)}>Close</button></div>
        <label>Project<select className="field" value={s.project} onChange={(e) => d.setStart({ ...s, project: e.target.value })}>
          <option value="">Pick a project</option>{d.projects.map((p) => <option key={p}>{p}</option>)}
        </select></label>
        <AccountField value={s.account} accounts={d.accounts} set={(account) => d.setStart({ ...s, account })} />
        <label>First prompt<input className="field" value={s.prompt} onChange={(e) => d.setStart({ ...s, prompt: e.target.value })} placeholder="optional" /></label>
        <button type="submit" className="btn p" disabled={!s.project}>Review session</button>
      </form>
    )
  }
  return null
}

function Chips({ d }: { d: D }) {
  const later = ['/queue', '/handoff', '/review']
  return (
    <div className="chips">
      <button type="button" className="chip ac" aria-pressed={d.form === 'run'} onClick={() => d.setForm(d.form === 'run' ? null : 'run')}>/dispatch</button>
      <button type="button" className="chip ac" aria-pressed={d.form === 'session'} onClick={() => d.setForm(d.form === 'session' ? null : 'session')}>/session</button>
      {later.map((c) => <button key={c} type="button" className="chip" disabled title={LATER}>{c}</button>)}
    </div>
  )
}

function AskBox({ d, ph, big }: { d: D; ph: string; big?: boolean }) {
  return (
    <form className={`in ask${big ? ' big' : ''}`} onSubmit={(e) => { e.preventDefault(); d.submitAsk() }}>
      <input className="f1" value={d.ask} onChange={(e) => d.setAsk(e.target.value)} placeholder={ph} aria-label="Ask CR-0W" />
      <button type="button" className="mic" disabled title={`Voice: ${LATER.toLowerCase()}`} aria-label="Voice"><Mic s={big ? 20 : 18} /></button>
      <button type="submit" className="btn p">Send</button>
    </form>
  )
}

// Reads the session transcript while a Tell it send is open, then reports delivered or
// not delivered and unmounts, which ends the reads.
function Watch({ p, onDone }: { p: Pending; onDone: (s: Delivery) => void }) {
  const conv = useConversation({ pid: p.pid })
  const s = deliveryOf(p, conv.entries, useDeliveryClock([p]))
  const done = useRef(onDone)
  done.current = onDone
  useEffect(() => { if (s !== 'sending') done.current(s) }, [s])
  return null
}

function Chat({ d }: { d: D }) {
  return (
    <div className="msgs" role="log" aria-live="polite">
      {d.log.length === 0 && <div className="msg cr">Use /dispatch to start a run or /session to open one. Each action asks you to confirm first.</div>}
      {d.log.map((m, i) => (
        <Fragment key={i}>
          <div className={`msg ${m.me ? 'me' : 'cr'}${m.f ? ' f' : ''}`}>{m.text}</div>
          {m.p && m.state === 'sending' && <Watch p={m.p} onDone={(s) => d.settle(m.p!, s)} />}
          {m.p && m.state && <DeliveryLine state={m.state} onRetry={() => d.retell(m.p!)} />}
        </Fragment>
      ))}
      <Forms d={d} />
    </div>
  )
}

// ---- live panel buttons ----
function LiveBtns({ d, a, cls = '' }: { d: D; a: Agent; cls?: string }) {
  const session = a.kind === 'session'
  return (
    <div className={`btnrow ${cls}`}>
      <button type="button" className="btn p" aria-pressed={d.tell} disabled={!session} title={session ? undefined : 'Runs take no input'} onClick={() => d.setTell(!d.tell)}>Tell it</button>
      <button type="button" className="btn" disabled={!session} onClick={() => d.pause(a)}>Pause</button>
      <button type="button" className="btn x" onClick={() => d.stop(a)}>Stop</button>
    </div>
  )
}

// ---- laptop (board desk) ----
function DeskLaptop({ d }: { d: D }) {
  const working = d.agents.filter((a) => a.state === 'working')
  const accts = [...new Set(working.map((a) => a.account))].join(', ')
  const waiting = d.sessions.filter(waits)
  const needs = d.counts ? d.counts.needs : waiting.length
  const longest = Math.max(0, ...(d.work ?? []).filter((w) => w.state === 'needs').map((w) => w.wait_s ?? 0))
  const oldest = d.work
    ? (longest ? new Date(d.snap.now.getTime() - longest * 1000).toISOString() : undefined)
    : waiting.map((a) => a.started_at).filter(Boolean).sort()[0]
  const a = d.picked
  return (
    <div className="desk desk-lp">
      <div className="kps">
        <h1 className="dt">Desk</h1>
        <span className="kp c-w"><span className="kn">{d.counts ? d.counts.working : working.length}</span><span className="sm">working{accts && ` · ${accts}`}</span></span>
        <span className="kp n"><span className="kn c-n">{needs}</span><span className="sm">need you{oldest && ` · oldest ${ago(oldest, d.snap.now)}`}</span></span>
        {d.counts && d.counts.failed > 0 && <span className="kp f"><span className="kn c-f">{d.counts.failed}</span><span className="sm">failed</span></span>}
        <span className="kp c-sub"><span className="kn">{d.slots.busy}/{d.slots.max}</span><span className="sm">slots · {Math.max(0, d.slots.max - d.slots.busy)} free</span></span>
        <span className="kp c-b"><span className="kn">{d.resumable.length}</span><span className="sm">resumable</span></span>
      </div>
      <div className="dg">
        <div className="col">
          {d.work ? <Work d={d} id="dw" /> : (
            <>
              <section className="pn none" aria-labelledby="dn"><Ph id="dn" className="c-n" sm={<span className="c-n">{needs || ''}</span>}>Needs you</Ph><Needs d={d} /></section>
              <section className="pn grow" aria-labelledby="dr"><Ph id="dr" sm="▶ resume · + queue">Ready to run</Ph><Ready d={d} /></section>
            </>
          )}
        </div>
        {a ? (
          <AgentChat key={a.pid} snap={d.snap} refresh={d.refresh} target={{ pid: a.pid }} log={<Timeline d={d} a={a} term />} />
        ) : (
          <section className="pn ask-pn" aria-labelledby="da">
            <Ph id="da" sm="butler · sees missions, queue, inbox, sessions">Ask CR-0W</Ph>
            <Chat d={d} />
            <Chips d={d} />
            <AskBox d={d} ph="Tell CR-0W what to run, ask about a mission…" />
          </section>
        )}
        <div className="col">
          <section className="pn none" aria-labelledby="ds"><Ph id="ds" sm="click a slot to open it">Slots and queue</Ph><Slots d={d} /></section>
          {a ? (
            <section className="pn grow ask-pn" aria-labelledby="da">
              <Ph id="da" sm="butler">Ask CR-0W</Ph>
              <Chat d={d} />
              <Chips d={d} />
              <AskBox d={d} ph="Tell CR-0W what to run…" />
            </section>
          ) : (
            <section className="pn grow" aria-labelledby="dl"><Ph id="dl">Live</Ph><div className="sm">Nothing runs. Start one with /dispatch.</div></section>
          )}
          <section className="pn none" aria-labelledby="dv">
            <Ph id="dv" sm={d.sessions.length}>Live sessions</Ph>
            <div className="list">
              {d.sessions.length === 0 && <div className="sm">No live session.</div>}
              {d.sessions.map((s) => (
                <div key={s.pid} className={`row${s === a ? ' on' : ''}`}>
                  {waits(s) ? <Diamond /> : <Ring c={s.state === 'idle' ? 'c-q' : 'c-w'} />}
                  <span className="f1">{nameOf(s)}</span><span className="sm">{s.account} · {said(s)}</span>
                  <button type="button" className={`btn${waits(s) ? ' p' : ''}`} onClick={() => d.pick(s, waits(s) && !s.prompt)}>Open</button>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}

// ---- Fold inner (board fold-desk-inner) ----
function DeskInner({ d }: { d: D }) {
  const a = d.picked
  const needs = d.sessions.filter(waits).length
  return (
    <div className="desk desk-in">
      <div className="col">
        {!d.work && <section className="pn" aria-labelledby="is"><Ph id="is" sm={`${d.slots.busy}/${d.slots.max} busy`}>Slots and queue</Ph><Slots d={d} ib /></section>}
        {d.work ? <Work d={d} id="iw" /> : (
          <>
            <section className="pn needs" aria-labelledby="in"><Ph id="in" className="c-n" sm={needs || ''}>Needs you</Ph><Needs d={d} short /></section>
            <section className="pn grow" aria-labelledby="ir"><Ph id="ir" sm="▶ resume · + queue">Ready to run</Ph><Ready d={d} /></section>
          </>
        )}
        {d.work && <section className="pn none" aria-labelledby="is"><Ph id="is" sm={`${d.slots.busy}/${d.slots.max} busy`}>Slots and queue</Ph><Slots d={d} ib /></section>}
      </div>
      <div className="col">
        {a ? (
          <AgentChat key={a.pid} snap={d.snap} refresh={d.refresh} target={{ pid: a.pid }} log={<Timeline d={d} a={a} term />} />
        ) : (
          <>
            <section className="pn grow" aria-labelledby="il"><Ph id="il">Live</Ph><div className="sm">Nothing runs. Start one with /dispatch.</div></section>
            <section className="pn ask-pn" aria-labelledby="ia">
              <Ph id="ia" className="c-m" sm="hub">Ask CR-0W</Ph>
              <Chat d={d} />
              <Chips d={d} />
              <AskBox d={d} ph="Run, queue, explain…" />
            </section>
          </>
        )}
      </div>
    </div>
  )
}

// ---- phone cover (board fold-desk-cover) ----
const C = 2 * Math.PI * 54
function DeskCover({ d }: { d: D }) {
  const a = d.picked
  // The board shows two rows; the rest is one unfold away.
  const rest = d.agents.filter((x) => x !== a).slice(0, 2)
  const queued = d.resumable.slice(0, 2 - rest.length)
  const hero = a ? (
        <section className={`gcard dhero${waits(a) ? ' n' : ''}`} aria-labelledby="ch">
          <div className="gt"><span className={waits(a) ? 'c-n' : 'c-w'}>● {d.slotOf(a) || 'Session'} · {said(a)}</span><span>{a.account} · {a.project}</span></div>
          <div className="hr">
            <div className="ring">
              <svg width="122" height="122" aria-hidden="true">
                <circle cx="61" cy="61" r="54" fill="none" className="trk" strokeWidth="10" />
                <g transform="rotate(-90 61 61)">
                  <circle cx="61" cy="61" r="54" fill="none" className={`arc${a.state === 'working' ? ' spin' : ''}`} strokeWidth="10" strokeLinecap="round"
                    strokeDasharray={`${(C / 4).toFixed(1)} ${C.toFixed(1)}`} />
                </g>
              </svg>
              <div className="rc"><span className={`bign ${waits(a) ? 'c-n' : 'c-w'}`}>{d.since(a) || '—'}</span><span className="gs">elapsed</span></div>
            </div>
            <div className="hm"><h2 className="gh" id="ch"><Link href={`/desk/${a.pid}`}>{nameOf(a)}</Link></h2><span className="gs">{a.project}{a.kind === 'run' && a.run_id ? ` · ${a.run_id}` : ''}</span>
              {a.started_at && <span className="gs">since {time(new Date(a.started_at))}</span>}</div>
          </div>
          {a.prompt ? <Ask d={d} a={a} /> : <Timeline d={d} a={a} term />}
          {d.tell && a.kind === 'session' && <TellBox d={d} a={a} />}
          <LiveBtns d={d} a={a} cls="gbtns" />
        </section>
      ) : (
        <section className="gcard dhero none-run"><div className="gt"><span>Nothing runs</span><span>{d.slots.busy}/{d.slots.max}</span></div>
          <div className="gs">Type /dispatch below to start a run.</div></section>
      )
  // With the work feed the list leads (item_204 option A); the live card follows.
  if (d.work) {
    return (
      <div className="desk desk-cv">
        <section className="gl" aria-labelledby="cw">
          <h2 className="gls" id="cw"><span>Work</span><span className="num">{d.shown}</span></h2>
          <WorkList groups={d.groups} now={d.snap.now} open={(w) => d.openWork(w, true)} />
        </section>
        {a && hero}
        {(d.form || d.log.length > 0) && <Chat d={d} />}
        <AskBox d={d} ph="Ask CR-0W: run, queue…" big />
        <div className="uf"><Unfold />unfold for live transcript and chat</div>
      </div>
    )
  }
  return (
    <div className="desk desk-cv">
      {hero}
      <div className="gl">
        <div className="gls"><span>Slots and queue</span><span>{d.resumable.length} ready</span></div>
        {rest.map((x) => (
          <button type="button" key={x.pid} className="row r2" onClick={() => navigate(`/desk/${x.pid}`)}>
            <span className={`ic${waits(x) ? ' n' : ''}`}>{waits(x) ? <Diamond s={14} /> : <Spin />}</span>
            <span className="t"><b>{d.slotOf(x) ? `${d.slotOf(x)} · ` : ''}{nameOf(x)}</b><span>{x.account} · {said(x)}</span></span>
            <span className="sm num">{d.since(x)}</span><span className="chev">›</span>
          </button>
        ))}
        {queued.map((r) => (
          <button type="button" key={r.conversation_id} className="row r2" onClick={() => d.resume(r)}>
            <span className="ic"><Ring dashed c="c-q" /></span>
            <span className="t"><b>{r.project}</b><span>{r.account} · resume{r.last_prompt ? ` · ${r.last_prompt}` : ''}</span></span>
            <span className="chev">›</span>
          </button>
        ))}
      </div>
      {(d.form || d.log.length > 0) && <Chat d={d} />}
      <AskBox d={d} ph="Ask CR-0W: run, queue…" big />
      <div className="uf"><Unfold />unfold for live transcript and chat</div>
    </div>
  )
}

export function Desk({ snap, refresh }: { snap: Snapshot; refresh: () => Promise<void> }) {
  const d = useDesk(snap, refresh)
  const lp = useMedia(LAPTOP)
  const inner = useMedia(INNER)
  return (
    <>
      {lp ? <DeskLaptop d={d} /> : inner ? <DeskInner d={d} /> : <DeskCover d={d} />}
      {d.sheet && <Sheet c={d.sheet} onClose={() => d.setSheet(null)} />}
    </>
  )
}
