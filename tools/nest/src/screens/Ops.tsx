import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { dispatchOf } from '../data/live'
import {
  axis, clock, groups, hours, isLive, isoWeek, parisDay, parisHour, runId, shiftDay, stats, usd,
  type Ops as OpsData, type Scale, type OpsLane, type OpsQueued, type RunReport,
} from '../data/ops'
import { useSource, type Snapshot } from '../data/useData'
import { Link, navigate, useQuery } from '../router'
import { Sheet, type Confirm } from '../ui/Sheet'

// Ops (item_190): everything the owner or crow worked on, by day or by week, what waits
// to run, and the totals. Reads GET /api/state/ops; a lane opens its run report.

type Mode = 'day' | 'week'
type By = 'project' | 'kind'

const GLYPH: Record<OpsLane['kind'], string> = { interactive: '◉', run: '▷', mission: '▷', routine: '▷' }
const LEGEND = [['working', 'working'], ['waiting', 'waits on you'], ['idle', 'idle'], ['stuck', 'stuck'], ['failed', 'failed'], ['done', 'done']] as const
const WEEKDAY = new Intl.DateTimeFormat('en-GB', { weekday: 'short', timeZone: 'UTC' })
const LONG = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })
const dayLabel = (d: string) => LONG.format(new Date(`${d}T12:00:00Z`))

// Position of an hour on the [lo, hi] axis, in percent.
const pct = (h: number, [lo, hi]: [number, number]) => `${(Math.max(lo, Math.min(hi, h)) - lo) / (hi - lo) * 100}%`

const dur = (s: number) => { const m = Math.round(s / 60); return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m` }
const WHEN = new Intl.DateTimeFormat('en-GB', { weekday: 'short', timeZone: 'Europe/Paris' })
const when = (t: string, now: Date) => `${parisDay(new Date(t)) === parisDay(now) ? 'today' : WHEN.format(new Date(t))} ${clock(t)}`

function age(from: string, now: Date) {
  const m = Math.max(0, Math.round((now.getTime() - Date.parse(from)) / 60000))
  return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}`
}

export function Ops({ snap }: { snap: Snapshot }) {
  const src = useSource()
  const now = snap.now
  const today = parisDay(now)
  const project = useQuery().get('project') ?? undefined
  const [mode, setMode] = useState<Mode>('day')
  const [day, setDay] = useState(today)
  const [by, setBy] = useState<By>('project')
  const [view, setView] = useState<{ query: string; mode: Mode; day: string; data: OpsData } | null>(null)
  const data = view?.data ?? null
  const [error, setError] = useState('')
  const [open, setOpen] = useState<OpsLane | null>(null)
  const [sheet, setSheet] = useState<Confirm | null>(null)
  const query = mode === 'day' ? `day=${day}` : `week=${isoWeek(day)}`

  const want = useRef(query)
  want.current = query
  const load = useCallback(async () => {
    try {
      const d = await src.ops(query)
      if (want.current !== query) return
      setView({ query, mode, day, data: d })
      setError('')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [src, query, mode, day])
  useEffect(() => {
    void load()
    if (!src.poll || !(mode === 'week' ? isoWeek(today) === isoWeek(day) : day === today)) return
    const t = setInterval(() => { if (!document.hidden) void load() }, Math.max(src.poll, 30_000))
    return () => clearInterval(t)
  }, [load, src.poll, mode, day, today])

  const lanes = useMemo(() => (data?.lanes ?? []).filter((l) => !project || l.project === project), [data, project])
  const totals = useMemo(() => (data?.totals ?? []).filter((t) => t.by === by && (!project || by === 'kind' || t.name === project)), [data, by, project])
  const dispatch = dispatchOf(snap.sections.dispatch)
  const s = stats(lanes.filter((l) => mode === 'week' || l.day === day))
  const queue = data?.queue ?? []
  const step = mode === 'day' ? 1 : 7
  const label = mode === 'day' ? (day === today ? `Today · ${dayLabel(day)}` : dayLabel(day)) : `Week ${isoWeek(day).slice(6)} · ${dayLabel(data?.days[0] ?? day)}`

  const cancel = (q: OpsQueued) => setSheet({
    title: 'Cancel this mission?',
    lead: 'It leaves the queue and never runs.',
    target: [['Mission', q.id], ['Project', q.project ?? '']],
    note: 'crow mission cancel',
    ok: 'Cancel mission',
    danger: true,
    run: async () => { await src.actions.missionCancel(q.id); await load() },
  })

  const [edit, setEdit] = useState<OpsQueued | null>(null)
  const routine = (q: OpsQueued, verb: 'run' | 'pause' | 'resume') => setSheet({
    title: verb === 'run' ? `Run ${q.title} now?` : verb === 'pause' ? `Pause ${q.title}?` : `Resume ${q.title}?`,
    lead: verb === 'run' ? 'It starts once now. The timer keeps its schedule.'
      : verb === 'pause' ? 'The timer stops and stays off until you resume it.' : 'The timer starts again on its schedule.',
    target: [['Routine', q.id], ...(q.next ? [['Next', when(q.next, now)] as [string, string]] : [])],
    note: `crow-routine ${verb} ${q.id}`,
    ok: verb === 'run' ? 'Run now' : verb === 'pause' ? 'Pause' : 'Resume',
    run: async () => { await src.actions.routine(q.id, verb); await load() },
  })
  const skip = (q: OpsQueued) => setSheet({
    title: 'Drop this AFK job?',
    lead: 'The job file moves to afk/superseded and its queue row is marked skipped.',
    target: [['Job', q.id], ...(q.project ? [['Project', q.project] as [string, string]] : [])],
    note: 'local/state/afk',
    ok: 'Drop job',
    danger: true,
    run: async () => { await src.actions.afkSkip(q.id); await load() },
  })

  const [scale, setScale] = useState<Scale>('work')
  const kinds = (k: OpsQueued['kind']) => queue.filter((q) => q.kind === k).length
  const qsum = ([['mission', 'missions'], ['routine', 'routines'], ['afk', 'afk']] as const)
    .filter(([k]) => kinds(k)).map(([k, t]) => `${kinds(k)} ${t}`).join(' · ')
  const scope = lanes.filter((l) => mode === 'week' || l.day === day)
  const sess = scope.filter((l) => l.kind === 'interactive'), runs = scope.filter((l) => l.kind !== 'interactive')
  const sum = (ls: OpsLane[], f: (l: OpsLane) => number) => ls.reduce((x, l) => x + f(l), 0)
  const maxA = Math.max(1, ...totals.map((t) => t.active_s))
  let qn = 0

  return (
    <>
      <div className="ops">
        <div className="ops-head">
          <h1 className="dt">Ops</h1>
          <div className="seg" role="tablist" aria-label="View">
            {(['day', 'week'] as const).map((m) => (
              <button key={m} type="button" role="tab" aria-selected={mode === m} className={mode === m ? 'on' : ''} onClick={() => setMode(m)}>{m.toUpperCase()}</button>
            ))}
          </div>
          <div className="ops-nav">
            <button type="button" className="icon-btn" aria-label="Earlier" onClick={() => setDay(shiftDay(day, -step))}>◀</button>
            <span className="num">{label}</span>
            <button type="button" className="icon-btn" aria-label="Later" disabled={shiftDay(day, step) > today && (mode === 'day' || isoWeek(shiftDay(day, step)) > isoWeek(today))}
              onClick={() => setDay(shiftDay(day, step) > today ? today : shiftDay(day, step))}>▶</button>
          </div>
          <div className="seg" role="tablist" aria-label="Time scale">
              {([['work', '08–20'], ['full', '24H']] as const).map(([k, t]) => (
                <button key={k} type="button" role="tab" aria-selected={scale === k} className={scale === k ? 'on' : ''} onClick={() => setScale(k)}>{t}</button>
              ))}
            </div>
          {project && (
            <button type="button" className="chip-f" onClick={() => navigate('/ops')} aria-label={`Clear filter ${project}`}>
              {project.toUpperCase()} <span aria-hidden="true">×</span>
            </button>
          )}
          <span className="ops-stats num">
            {s.lanes} lanes · {dur(s.active_s)} active · {usd(s.cost)} · <span className={s.failed ? 'c-f' : ''}>{s.failed} failed</span>
          </span>
        </div>

        <section className="pn ops-tlp" aria-label="Timeline">
          {error && <div className="err" role="alert">{error}</div>}
          {!data && !error && <div className="sub">Loading…</div>}
          {view && (
            <div key={view.mode} className={`ops-view${view.query !== query ? ' ops-stale' : ''}`}>
              {view.mode === 'day'
                ? <Day lanes={lanes} queue={queue} day={view.day} today={today} now={now} scale={scale} dispatch={dispatch} onOpen={setOpen} />
                : <Week days={view.data.days} lanes={lanes} today={today} now={now} scale={scale} onDay={(d) => { setDay(d); setMode('day') }} />}
            </div>
          )}
          <div className="ops-legend" aria-label="Legend">
            {LEGEND.map(([k, t]) => <span key={k}><i className={`sw st-${k}`} />{t}</span>)}
            <span><i className="sw st-working live" />live</span>
            <span><i className="sw planned" />planned</span>
            <span>x axis: Paris time · ▷ run · ◉ session</span>
          </div>
        </section>

        <div className="ops-low">
          <section className="pn" aria-labelledby="oq">
            <h2 className="ph" id="oq"><span>Queue</span><span className="sm num">{qsum || 'empty'} · slots {dispatch.slots.busy}/{dispatch.slots.max}</span></h2>
            {queue.length === 0 && <div className="sub">Nothing waits to run.</div>}
            <div className="sub ops-qhelp">What starts next: missions take the next free slot, routines start on their timer, AFK jobs run at the next AFK go.</div>
            {queue.map((q) => (
              <div key={`${q.kind}-${q.id}`} className={`ops-q k-${q.kind}${q.paused ? ' paused' : ''}`}>
                <span className="ops-qi num">{q.kind === 'mission' ? ++qn : q.kind === 'routine' ? '↻' : '☾'}</span>
                <span className="ops-qt">{q.kind === 'afk' ? 'afk · ' : ''}{q.title}</span>
                <span className="sm num">{queueWhen(q, now)}</span>
                <span className="ops-qa">
                  {q.kind === 'mission' && <button type="button" className="btn sm" aria-label={`Cancel ${q.title}`} onClick={() => cancel(q)}>✕</button>}
                  {q.kind === 'routine' && <>
                    <button type="button" className="btn sm" onClick={() => routine(q, q.paused ? 'resume' : 'pause')}>{q.paused ? 'RESUME' : 'PAUSE'}</button>
                    <button type="button" className="btn sm" onClick={() => routine(q, 'run')}>RUN NOW</button>
                  </>}
                  {q.kind === 'afk' && <>
                    <button type="button" className="btn sm" onClick={() => setEdit(q)}>EDIT</button>
                    <button type="button" className="btn sm" aria-label={`Skip ${q.title}`} onClick={() => skip(q)}>✕</button>
                  </>}
                </span>
              </div>
            ))}
          </section>

          <section className="pn" aria-labelledby="ot">
            <h2 className="ph" id="ot">
              <span>{mode === 'day' ? dayLabel(day) : `Week ${isoWeek(day).slice(6)}`} totals</span>
              <span className="seg sm" role="tablist" aria-label="Group by">
                {(['project', 'kind'] as const).map((b) => (
                  <button key={b} type="button" role="tab" aria-selected={by === b} className={by === b ? 'on' : ''} onClick={() => setBy(b)}>{b.toUpperCase()}</button>
                ))}
              </span>
            </h2>
            <table className="ops-tot num">
              <thead><tr><th>{by}</th><th>lanes</th><th>active h</th><th>wait</th><th>stuck</th><th>failed</th><th>cost</th></tr></thead>
              <tbody>
                {totals.map((t) => (
                  <tr key={t.name}>
                    <td><i className="ops-bar" style={{ width: `${Math.max(3, t.active_s / maxA * 80)}px` }} />{t.name}</td><td>{t.lanes}</td><td>{hours(t.active_s)}</td><td>{hours(t.wait_s)}</td>
                    <td className={t.stuck ? 'c-stuck' : ''}>{t.stuck}</td><td className={t.failed ? 'c-f' : ''}>{t.failed}</td><td>{usd(t.cost_usd)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td>sessions / runs</td><td>{sess.length} / {runs.length}</td>
                  <td>{hours(sum(sess, (l) => l.active_s))} / {hours(sum(runs, (l) => l.active_s))}</td><td /><td /><td />
                  <td>{usd(sum(sess, (l) => l.cost_usd))} / {usd(sum(runs, (l) => l.cost_usd))}</td>
                </tr>
              </tfoot>
            </table>
          </section>
        </div>
      </div>
      {open && <LaneSheet lane={open} now={now} onClose={() => setOpen(null)} />}
      {sheet && <Sheet c={sheet} onClose={() => setSheet(null)} />}
      {edit && <AfkSheet job={edit} src={src} onClose={() => setEdit(null)} />}
    </>
  )
}

// The when column of a queue row: what kind of entry and when it starts.
function queueWhen(q: OpsQueued, now: Date): string {
  const at = q.project ? ` · ${q.project}` : ''
  if (q.kind === 'mission') return `mission${at} · when a slot frees`
  if (q.kind === 'routine') return q.paused ? 'routine · paused' : `routine · ${q.next ? when(q.next, now) : 'no next start'}`
  return `job${at} · next afk go`
}

// Edit an AFK job prompt in place (core PUT /api/afk).
function AfkSheet({ job, src, onClose }: { job: OpsQueued; src: { actions: { afkRead: (id: string) => Promise<{ text: string }>; afkSave: (id: string, text: string) => Promise<unknown> } }; onClose: () => void }) {
  const [text, setText] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    src.actions.afkRead(job.id).then((j) => setText(j.text), (e: unknown) => setError(e instanceof Error ? e.message : String(e)))
  }, [job.id, src])
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onClose() }
    addEventListener('keydown', key)
    return () => removeEventListener('keydown', key)
  }, [busy, onClose])
  const save = async () => {
    if (text === null) return
    setBusy(true)
    setError('')
    try {
      await src.actions.afkSave(job.id, text)
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setBusy(false)
    }
  }
  return (
    <>
      <div className="scrim" onClick={busy ? undefined : onClose} aria-hidden="true" />
      <div className="sheet ops-afk" role="dialog" aria-modal="true" aria-labelledby="afk-t">
        <div className="grab" aria-hidden="true" />
        <h2 id="afk-t" className="sh">Edit AFK job</h2>
        <div className="sub num">local/state/afk/{job.id}</div>
        {text === null && !error && <div className="sub">Loading…</div>}
        {text !== null && <textarea className="field" aria-label="Job prompt" value={text} onChange={(e) => setText(e.target.value)} spellCheck={false} />}
        {error && <div className="err" role="alert">{error}</div>}
        <div className="btns">
          <button type="button" className="btn" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="button" className="btn p" onClick={save} disabled={busy || text === null || !text.trim()} aria-busy={busy}>{busy ? 'Saving…' : 'Save'}</button>
        </div>
      </div>
    </>
  )
}

type Dispatch = ReturnType<typeof dispatchOf>

// The live agent of a lane: its session or run id among the lane keys.
const agentOf = (l: OpsLane, d: Dispatch) =>
  isLive(l) ? d.agents.find((a) => (a.session_id && l.keys.includes(a.session_id)) || (a.run_id && l.keys.includes(a.run_id))) : undefined

function Day({ lanes, queue, day, today, now, scale, dispatch, onOpen }: { lanes: OpsLane[]; queue: OpsQueued[]; day: string; today: string; now: Date; scale: Scale; dispatch: Dispatch; onOpen: (l: OpsLane) => void }) {
  const isToday = day === today
  const nowH = parisHour(now)
  const ax = axis(lanes, isToday, nowH, scale)
  const step = ax[1] - ax[0] > 14 ? 2 : 1
  const ticks = Array.from({ length: ax[1] - ax[0] + 1 }, (_, i) => ax[0] + i)
  const labels = ticks.filter((h) => (h - ax[0]) % step === 0 && h < ax[1])
  // Routines due later today: dashed marks after the now line.
  const planned = isToday ? queue.filter((q) => q.next && parisDay(new Date(q.next)) === day && Date.parse(q.next) > now.getTime()) : []
  if (!lanes.length && !planned.length) return <div className="sub">Nothing ran on this day.</div>
  const grid = ticks.map((h) => <i key={h} className="ops-grid" style={{ left: pct(h, ax) }} />)
  const nowLine = isToday && <i className="ops-now" style={{ left: pct(nowH, ax) }} aria-hidden="true" />
  let slot = 0
  return (
    <div className="ops-tl">
      <div className="ops-row ops-axis" aria-hidden="true">
        <span className="ops-lh">Lane</span>
        <div className="ops-track">
          {labels.map((h) => <span key={h} className={`ops-tick num${(h - ax[0]) % 3 ? ' minor' : ''}`} style={{ left: pct(h, ax) }}>{String(h).padStart(2, '0')}<span className="ops-mm">:00</span></span>)}
          {isToday && <span className="ops-nowtag num" style={{ left: pct(nowH, ax) }}>▼<span className="ops-mm"> now {clock(now)}</span></span>}
        </div>
      </div>
      {groups(lanes).map((g) => (
        <div key={g.project} className="ops-grp">
          <div className="ops-gh">{g.project} · {g.lanes.length} {g.lanes.length === 1 ? 'lane' : 'lanes'}</div>
          {g.lanes.map((l) => {
            const live = isLive(l)
            const a = agentOf(l, dispatch)
            const rid = runId(l)
            const tag = live ? (l.kind === 'interactive' ? (l.title === 'hub' ? 'hub' : 'session') : `S${++slot}`) : ''
            return (
              <div key={l.id} className={`ops-row${live ? ' is-live' : ''}`}>
                <button type="button" className="ops-name" onClick={() => onOpen(l)} title={l.title}>
                  <span className="ops-glyph" aria-label={l.kind === 'interactive' ? 'session' : 'run'}>{GLYPH[l.kind]}</span>
                  <span className="ops-lt">{l.title}</span>
                </button>
                <div className="ops-track" onClick={() => onOpen(l)}>
                  {grid}
                  {l.spans.map((sp, i) => {
                    const a0 = parisHour(sp.start), a1 = parisHour(sp.end) || 24
                    const last = i === l.spans.length - 1 && live
                    return <i key={i} className={`ops-span st-${sp.state}${last ? ' live' : ''}`} style={{ left: pct(a0, ax), width: `calc(${pct(a1, ax)} - ${pct(a0, ax)})` }} title={`${sp.state} ${clock(sp.start)}–${clock(sp.end)}`} />
                  })}
                  {nowLine}
                  {live && isToday && (
                    <span className="ops-live num" style={{ left: `calc(${pct(nowH, ax)} + 8px)` }}>
                      {[tag, (rid ?? l.id).slice(0, 8), l.spans[0] ? age(l.spans[0].start, now) : '', usd(l.cost_usd)].filter(Boolean).join(' · ')}
                      {a && <Link href={`/desk/${a.pid}`} className="ops-open" onClick={(e) => e.stopPropagation()}>OPEN</Link>}
                    </span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      ))}
      {planned.length > 0 && (
        <div className="ops-grp">
          <div className="ops-gh">planned · {planned.length}</div>
          {planned.map((q) => (
            <div key={q.id} className="ops-row">
              <span className="ops-name"><span className="ops-glyph">↻</span><span className="ops-lt">{q.title}</span></span>
              <div className="ops-track">
                {grid}
                <i className="ops-span planned" style={{ left: pct(parisHour(q.next!), ax), width: `calc(${pct(parisHour(q.next!) + 0.25, ax)} - ${pct(parisHour(q.next!), ax)})` }} title={clock(q.next!)} />
                {nowLine}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// Week: one row per day on the same axis and row height as Day, every lane's spans overlaid.
const LAYER: Record<string, number> = { idle: 0, working: 1, waiting: 2, done: 3, stuck: 4, failed: 5 }
function Week({ days, lanes, today, now, scale, onDay }: { days: string[]; lanes: OpsLane[]; today: string; now: Date; scale: Scale; onDay: (d: string) => void }) {
  const nowH = parisHour(now)
  const ax = axis(lanes, days.includes(today), nowH, scale)
  const step = ax[1] - ax[0] > 14 ? 2 : 1
  const ticks = Array.from({ length: ax[1] - ax[0] + 1 }, (_, i) => ax[0] + i)
  const labels = ticks.filter((h) => (h - ax[0]) % step === 0 && h < ax[1])
  const grid = ticks.map((h) => <i key={h} className="ops-grid" style={{ left: pct(h, ax) }} />)
  return (
    <div className="ops-tl ops-wk">
      <div className="ops-row ops-axis" aria-hidden="true">
        <span className="ops-lh">Day</span>
        <div className="ops-track">
          {labels.map((h) => <span key={h} className={`ops-tick num${(h - ax[0]) % 3 ? ' minor' : ''}`} style={{ left: pct(h, ax) }}>{String(h).padStart(2, '0')}<span className="ops-mm">:00</span></span>)}
        </div>
      </div>
      {days.map((d) => {
        const ls = lanes.filter((l) => l.day === d)
        const s = stats(ls)
        const future = d > today
        const spans = ls.flatMap((l) => l.spans.map((sp) => ({ ...sp, live: isLive(l) && sp === l.spans.at(-1) })))
          .sort((x, y) => (LAYER[x.state] ?? 1) - (LAYER[y.state] ?? 1))
        return (
          <div key={d} className={`ops-row ops-wrow${future ? ' future' : ''}${d === today ? ' is-today' : ''}`}>
            <button type="button" className="ops-name" disabled={future} onClick={() => onDay(d)}>
              <span className="ops-lt"><b>{WEEKDAY.format(new Date(`${d}T12:00:00Z`))} {d.slice(8)}</b></span>
              {!future && <span className="ops-wst num">{s.lanes ? `${s.lanes} lanes · ${hours(s.active_s)}h · ${usd(s.cost)}` : '—'}</span>}
            </button>
            <div className="ops-track" onClick={future ? undefined : () => onDay(d)}>
              {grid}
              {spans.map((sp, i) => {
                const a0 = parisHour(sp.start), a1 = parisHour(sp.end) || 24
                return <i key={i} className={`ops-span st-${sp.state}${sp.live && d === today ? ' live' : ''}`} style={{ left: pct(a0, ax), width: `calc(${pct(a1, ax)} - ${pct(a0, ax)})` }} />
              })}
              {d === today && <i className="ops-now" style={{ left: pct(nowH, ax) }} aria-hidden="true" />}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// Lane detail: what the lane is, its times and cost, and the run report when it is a run.
function LaneSheet({ lane, now, onClose }: { lane: OpsLane; now: Date; onClose: () => void }) {
  const src = useSource()
  const rid = runId(lane)
  const [rep, setRep] = useState<RunReport | null | undefined>(rid ? undefined : null)
  useEffect(() => {
    if (!rid) return
    let live = true
    src.run(rid).then((r) => { if (live) setRep(r ?? null) }, () => { if (live) setRep(null) })
    return () => { live = false }
  }, [src, rid])
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    addEventListener('keydown', key)
    return () => removeEventListener('keydown', key)
  }, [onClose])
  const props: Array<[string, string]> = [
    ['Project', lane.project], ['Kind', lane.kind], ['State', lane.state], ['Account', lane.account],
    ...(lane.model ? [['Model', lane.model] as [string, string]] : []),
    ['Span', lane.spans.length ? `${clock(lane.spans[0].start)}–${isLive(lane) ? clock(now) : clock(lane.spans.at(-1)!.end)}` : '—'],
    ['Active', `${hours(lane.active_s)}h`], ['Waiting on you', `${hours(lane.wait_s)}h`],
    ['Cost', usd(rep?.cost_usd ?? lane.cost_usd)], ['Tokens', lane.tokens.toLocaleString('en-GB')], ['Commits', String(lane.commits)],
    ...(rid ? [['Run', rid] as [string, string]] : []),
    ...(rep?.branch ? [['Branch', rep.branch] as [string, string]] : []),
  ]
  return (
    <>
      <div className="scrim" onClick={onClose} aria-hidden="true" />
      <div className="sheet ops-sheet" role="dialog" aria-modal="true" aria-labelledby="ols">
        <div className="grab" aria-hidden="true" />
        <h2 id="ols" className="sh">{lane.kind === 'interactive' ? '◉' : '▷'} {lane.title}</h2>
        <div className="ops-strip">
          {lane.spans.map((sp, i) => <i key={i} className={`st-${sp.state}`} style={{ flex: Math.max(1, Date.parse(sp.end) - Date.parse(sp.start)) }} title={sp.state} />)}
        </div>
        <dl className="props">{props.map(([k, v]) => [<dt key={`${k}-t`}>{k}</dt>, <dd key={`${k}-d`}>{v}</dd>])}</dl>
        {rid && rep === undefined && <div className="sub">Loading the run report…</div>}
        {rep && <><div className="sub">Run report · {rep.status}</div><div className="quote">{rep.report || 'No report.'}</div></>}
        {rid && rep === null && <div className="sub">No run report for this run.</div>}
        <div className="btns"><button type="button" className="btn" onClick={onClose}>Close</button></div>
      </div>
    </>
  )
}
