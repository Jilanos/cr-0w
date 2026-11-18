import { Fragment, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { ApiError } from '../data/api'
import { blocksOf, partsOf, spansOf, type Block, type ChatTarget, type Entry } from '../data/conversation'
import { deliveryOf, landedOf, pendingOf, type Pending } from '../data/delivery'
import { dispatchOf, type Agent, type AskAnswer } from '../data/live'
import type { InboxItem, InboxVerb, Mission } from '../data/types'
import { useConversation } from '../data/useConversation'
import { useSource, type Snapshot } from '../data/useData'
import { ago, elapsed, time, title } from '../format'
import { Link, navigate } from '../router'
import { REJECT, useAnswer, verbLabel } from '../ui/answer'
import { AskDock } from '../ui/AskDock'
import { DeliveryLine, useDeliveryClock } from '../ui/Delivery'
import { enterSubmits, rowsOf } from '../ui/keys'
import { Sheet, type Confirm } from '../ui/Sheet'
import { Terminal } from '../ui/Terminal'

// Phone chat of one session, run or mission (item_177, boards chat-cover and
// chat-cover-ask): every word of the conversation, tool calls folded to one line,
// what waits on the owner docked above the reply box. With `log`, the same chat is the
// right pane of Desk inner (board chat-inner): header, Chat|Terminal toggle, Pause and Stop.
// Terminal is the session's screen, its tmux pane or kitty window (item_240); background runs keep Log.

const Mic = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
    <rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
  </svg>
)

function Spans({ text }: { text: string }) {
  return <>{spansOf(text).map((s, i) => (s.t === 'b' ? <b key={i}>{s.text}</b> : s.t === 'code' ? <code key={i}>{s.text}</code> : <Fragment key={i}>{s.text}</Fragment>))}</>
}

function Reply({ text }: { text: string }) {
  return (
    <>
      {partsOf(text).map((p, i) =>
        p.t === 'li' ? <div key={i} className="li"><b>{p.mark}</b><span><Spans text={p.text} /></span></div>
          : p.t === 'code' ? <pre key={i}>{p.text}</pre>
            : <p key={i} className={p.t === 'h' ? 'h' : undefined}><Spans text={p.text} /></p>)}
    </>
  )
}

function Fold({ b }: { b: Extract<Block, { kind: 'tools' }> }) {
  const [open, setOpen] = useState(false)
  const calls = b.entries.filter((e) => (e.tool_summary ?? '').startsWith('Call'))
  return (
    <div className={`tf${open ? ' open' : ''}`}>
      <button type="button" className="tfh" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span aria-hidden="true">{open ? '▾' : '▸'}</span>
        <span className="f1">{b.calls} tool call{b.calls > 1 ? 's' : ''} · {b.tools.join(', ')}</span>
        <span>{open ? 'hide' : 'show'}</span>
      </button>
      {open && (
        <ol className="tfl">
          {(calls.length ? calls : b.entries).map((e: Entry) => (
            <li key={e.id}><span className="num">{time(e.at)}</span><span>{e.tool_name ?? 'tool'}</span></li>
          ))}
        </ol>
      )}
    </div>
  )
}

// The chat target resolved against the feed: the live agent, the mission, its open asks.
function useTarget(snap: Snapshot, target: ChatTarget) {
  const { agents } = dispatchOf(snap.sections.dispatch)
  const runs = agents.filter((a) => a.kind === 'run')
  let agent: Agent | undefined
  let mission: Mission | undefined
  if ('pid' in target) {
    agent = agents.find((a) => a.pid === target.pid)
    if (agent?.run_id) mission = snap.missions.find((m) => m.runs.some((r) => r.run === agent!.run_id))
  } else {
    mission = snap.missions.find((m) => m.id === target.mission)
    const last = mission?.runs[mission.runs.length - 1]
    if (last && !last.ended) agent = runs.find((a) => a.run_id === last.run)
  }
  const asks = mission ? snap.inbox.filter((r) => r.mission === mission!.id && r.state === 'open' && r.type !== 'fyi') : []
  const slot = agent?.kind === 'run' ? `S${runs.indexOf(agent) + 1}` : ''
  return { agent, mission, asks, slot }
}

export function Chat({ snap, refresh, target, log }: { snap: Snapshot; refresh: () => Promise<void>; target: ChatTarget; log?: ReactNode }) {
  const act = useSource().actions
  const conv = useConversation(target)
  const { agent, mission, asks, slot } = useTarget(snap, target)
  const ask: InboxItem | undefined = asks[0]
  const answer = useAnswer(ask, snap.inbox, snap.missions, refresh)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  const [menu, setMenu] = useState(false)
  const [sheet, setSheet] = useState<Confirm | null>(null)
  const [tab, setTab] = useState<'chat' | 'side'>('chat')
  const inner = log !== undefined

  const name = agent ? (agent.kind === 'run' ? agent.label || agent.run_id || String(agent.pid) : agent.title || agent.project) : mission ? title(mission) : 'Conversation'
  const prompt = agent?.prompt
  const waits = !!prompt || !!answer.item
  const state = waits ? 'waits' : agent?.state ?? mission?.state ?? ''
  const account = agent?.account ?? mission?.runs[mission.runs.length - 1]?.account ?? conv.account
  const clock = agent?.started_at ? elapsed(agent.started_at, snap.now) : ''
  const blocks = blocksOf(conv.entries)

  // Messages typed into the session: a bubble with "sending…" until the transcript shows
  // the turn, then "delivered" under that turn; "not delivered" with Retry after the timeout.
  const [sent, setSent] = useState<Pending[]>([])
  const tick = useDeliveryClock(sent.filter((p) => deliveryOf(p, conv.entries, Date.now()) === 'sending'))
  const sends = sent.map((p) => ({ p, state: deliveryOf(p, conv.entries, tick) }))
  const landed = new Set(sends.map((x) => landedOf(x.p, conv.entries)?.id).filter(Boolean))
  const tkey = 'pid' in target ? `p${target.pid}` : `m${target.mission}`
  useEffect(() => { setSent([]) }, [tkey])

  // Stay at the bottom while the owner reads the end; leave the scroll alone when they read back.
  const box = useRef<HTMLDivElement>(null)
  const pinned = useRef(true)
  useLayoutEffect(() => {
    const el = box.current
    if (el && pinned.current) el.scrollTop = el.scrollHeight
  }, [blocks.length, waits, tab, sent.length])
  useEffect(() => { pinned.current = true }, [target])
  // A session stuck on a first-run dialog (setup) is answered in its terminal.
  const screenable = !!agent && (agent.kind === 'session' || !!agent.tmux)
  const setup = agent?.state === 'setup' && !!agent.tmux
  useEffect(() => { if (setup) setTab('side') }, [setup, tkey])

  // The box answers a mission ask with its free-text verb, else types into the session.
  const textVerb: InboxVerb | undefined = answer.item?.verbs.find((v) => v === 'answer' || v === 'msg')
  const canType = answer.item ? !!textVerb : agent?.kind === 'session'
  // Types t into the session; the send shows until the transcript carries it.
  const tell = async (pid: number, t: string) => {
    const p = pendingOf(pid, t, conv.entries, Date.now())
    await act.send(pid, t)
    setSent((l) => [...l.filter((x) => x.text !== t), p])
  }
  const retry = (p: Pending) => {
    setNote('')
    tell(p.pid, p.text).then(() => conv.refresh(), (e: unknown) => setNote(e instanceof Error ? e.message : String(e)))
  }
  const send = async () => {
    const t = text.trim()
    if (!t || busy) return
    setBusy(true)
    setNote('')
    try {
      if (answer.item && textVerb) {
        answer.setText(t)
        await act.missionAnswer(answer.mission!.id, answer.item.id, textVerb, t, answer.mission!.version)
        await refresh()
      } else if (agent) {
        await tell(agent.pid, t)
      }
      setText('')
      pinned.current = true
      await conv.refresh()
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) void refresh()
      setNote(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }
  const allow = async (key: 'allow' | 'deny') => {
    if (!agent || !prompt) return
    setNote('')
    try {
      await act.answer(agent.pid, prompt.id, key)
    } catch (e) {
      setNote(e instanceof Error ? e.message : String(e))
    }
    void refresh()
  }

  const sendAsk = async (answers: AskAnswer[]) => {
    if (!agent || !prompt) return
    setNote('')
    setBusy(true)
    try {
      await act.ask(agent.pid, prompt.id, answers)
      pinned.current = true
    } catch (e) {
      setNote(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
    void refresh()
  }

  const stop = () => {
    setMenu(false)
    if (mission && mission.state === 'running') {
      setSheet({
        title: 'Stop mission run', lead: `Stop the run ${name} of ${title(mission)}.`,
        target: [['mission', mission.id.replace(/^\d{8}-/, '')], ['run', agent?.run_id ?? mission.runs[mission.runs.length - 1]?.run ?? ''], ['project', mission.project]],
        note: 'Tap again to confirm. Same as crow mission stop, logged with surface nest. The mission moves on at the next tick.', ok: 'Tap again to stop', danger: true,
        run: async () => { await act.missionStop(mission.id); void refresh() },
      })
    } else if (agent?.kind === 'run' && agent.run_id) {
      setSheet({
        title: 'Stop run', lead: `Stop the run ${name} of ${agent.project}.`, target: [['run', agent.run_id], ['project', agent.project], ['account', agent.account]],
        note: 'Tap again to confirm. Its commits stay on the run branch.', ok: 'Tap again to stop', danger: true,
        run: async () => { await act.stopRun(agent.run_id!); void refresh() },
      })
    } else if (agent) {
      setSheet({
        title: 'Stop session', lead: `End the claude session of ${agent.project} (SIGTERM).`, target: [['session', name], ['account', agent.account], ['pid', String(agent.pid)]],
        note: 'Tap again to confirm. The window closes; the conversation can be resumed.', ok: 'Tap again to stop', danger: true,
        run: async () => { await act.stop(agent.pid); void refresh(); if (!inner) navigate('/desk') },
      })
    }
  }
  const pause = () => {
    setMenu(false)
    if (!agent) return
    setSheet({
      title: 'Pause session', lead: `Interrupt the current turn of ${agent.project} (${agent.account}).`, target: [['session', name], ['account', agent.account], ['pid', String(agent.pid)]],
      note: 'The session stays open and waits for you.', ok: 'Pause', run: async () => { await act.interrupt(agent.pid); void refresh() },
    })
  }
  const stoppable = (mission?.state === 'running') || !!agent
  const dot = waits ? 'c-n' : state === 'working' || state === 'running' ? 'c-w' : 'c-q'

  return (
    <Root inner={inner} name={name}>
      {inner ? (
        <>
          <h2 className="ph"><span><span className={dot}>●</span> {slot ? `${slot} · ` : ''}{name}</span><span className="sm">{[waits ? 'waits' : '', account, clock].filter(Boolean).join(' · ')}</span></h2>
          <div className="ctl">
            <span className="seg2" role="group" aria-label="View">
              <button type="button" className={`seg${tab === 'chat' ? ' on' : ''}`} aria-pressed={tab === 'chat'} onClick={() => setTab('chat')}>Chat</button>
              <button type="button" className={`seg${tab === 'side' ? ' on' : ''}`} aria-pressed={tab === 'side'} onClick={() => setTab('side')}>{screenable ? 'Terminal' : 'Log'}</button>
            </span>
            <span className="f1" />
            {agent?.kind === 'session' && <button type="button" className="btn" onClick={pause}>Pause</button>}
            {stoppable && <button type="button" className="btn x" onClick={stop}>Stop</button>}
          </div>
        </>
      ) : (
        <>
          <div className="bk">
            <Link href="/desk" className="bkb" aria-label="Back to Desk">‹</Link>
            <span className="bkt">
              <b>{slot ? `${slot} · ` : ''}{name}</b>
              <span className="gs"><span className={dot}>●</span> {[state, account, clock].filter(Boolean).join(' · ')}</span>
            </span>
            {(agent || stoppable) && <button type="button" className="btn" aria-expanded={menu} aria-label="Session actions" onClick={() => setMenu(!menu)}>⋯</button>}
          </div>
          {menu && (
            <div className="bkm" role="group" aria-label="Session actions">
              {agent?.kind === 'session' && <button type="button" className="btn" onClick={pause}>Pause</button>}
              {stoppable && <button type="button" className="btn x" onClick={stop}>Stop</button>}
            </div>
          )}
        </>
      )}
      {inner && tab === 'side' ? (screenable ? <Terminal key={agent.pid} pid={agent.pid} /> : log) : (<>
      <div className="chat" ref={box} onScroll={(e) => {
        const el = e.currentTarget
        pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40
      }}>
        {conv.more && <button type="button" className="btn earlier" onClick={() => { pinned.current = false; void conv.earlier() }}>Earlier</button>}
        {conv.loading && !blocks.length && <div className="sm">Loading the conversation…</div>}
        {!conv.loading && !blocks.length && !conv.error && <div className="sm">Nothing said yet.</div>}
        {conv.error && <div className="msg cr f">{conv.error}</div>}
        {blocks.map((b) => b.kind === 'tools' ? <Fold key={b.id} b={b} /> : (
          <Fragment key={b.id}>
            {b.who && (b.kind === 'me'
              ? <div className="who r">you · {time(b.at)}</div>
              : <div className="who"><span className="c-d">●</span> crow · {time(b.at)}</div>)}
            <div className={`msg ${b.kind}`}>{b.kind === 'me' ? b.text : <Reply text={b.text} />}</div>
            {landed.has(b.id) && <DeliveryLine state="delivered" />}
          </Fragment>
        ))}
        {sends.filter((x) => x.state !== 'delivered').map(({ p, state }) => (
          <Fragment key={`${p.at}${p.text}`}>
            <div className="msg me">{p.text}</div>
            <DeliveryLine state={state} onRetry={() => retry(p)} />
          </Fragment>
        ))}
      </div>
      {prompt?.questions?.length && agent ? (
        <AskDock key={prompt.id} who={slot || 'Session'} questions={prompt.questions} busy={busy} onSend={(a) => void sendAsk(a)} onCancel={() => void allow('deny')} />
      ) : prompt && agent && (
        <div className="ask" role="group" aria-label={`Permission asked by ${name}`}>
          <div className="who"><span className="c-n">◆ {slot || 'Session'} waits on you</span></div>
          <div className="aq"><span className="c-n">{prompt.tool}</span> <code>{prompt.detail}</code></div>
          <div className="gb">
            {prompt.work_approval
              ? <button type="button" className="btn p" disabled>Open in approvals</button>
              : prompt.options.map((o) => <button type="button" key={o.key} className={`btn${o.key === 'allow' ? ' p' : ''}`} onClick={() => allow(o.key)}>{o.label}</button>)}
          </div>
        </div>
      )}
      {!prompt && answer.item && (
        <div className="ask" role="group" aria-label={`${name} waits on you`}>
          <div className="who"><span className="c-n">◆ {slot || 'Mission'} waits on you · {ago(answer.item.created, snap.now)}</span></div>
          <div className="aq">{answer.item.ask}</div>
          <div className="gb">
            {answer.item.verbs.filter((v) => v !== textVerb).map((v, i) => (
              <button type="button" key={v} className={`btn${i === 0 && !REJECT.includes(v) ? ' p' : ''}`} disabled={answer.busy} onClick={() => answer.send(v)}>{verbLabel(v)}</button>
            ))}
          </div>
          {answer.error && <div className="sm c-f">{answer.error}</div>}
        </div>
      )}
      {note && <div className="sm c-f">{note}</div>}
      <form className="in" onSubmit={(e) => { e.preventDefault(); void send() }}>
        <textarea className="f1" rows={rowsOf(text)} value={text} onKeyDown={enterSubmits}
          onChange={(e) => { setText(e.target.value); if (answer.item) answer.setText(e.target.value) }} disabled={!canType}
          placeholder={!canType ? (agent?.kind === 'run' ? 'A run takes no messages' : 'Nothing to answer') : waits ? 'Or type an answer…' : `Tell ${slot || name}…`}
          aria-label={`Text for ${name}`} />
        <span className="mic" aria-hidden="true"><Mic /></span>
        <button type="submit" className="btn p" disabled={!canType || !text.trim() || busy}>Send</button>
      </form>
      </>)}
      {sheet && <Sheet c={sheet} onClose={() => setSheet(null)} />}
    </Root>
  )
}

// Phone: the whole screen. Desk inner: one panel of the right column.
function Root({ inner, name, children }: { inner: boolean; name: string; children: ReactNode }) {
  return inner
    ? <section className="pn grow chat-cv chat-in" aria-label={`Chat with ${name}`}>{children}</section>
    : <div className="chat-cv">{children}</div>
}
