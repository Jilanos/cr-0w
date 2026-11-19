import { useCallback, useEffect, useMemo, useState } from 'react'
import { dispatchOf } from '../data/live'
import {
  axis, busy, clock, groups, hours, isLive, isoWeek, parisDay, parisHour, runId, shiftDay, stats, usd,
  type Ops as OpsData, type OpsLane, type OpsQueued, type RunReport,
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
  const [data, setData] = useState<OpsData | null>(null)
  const [error, setError] = useState('')
  const [open, setOpen] = useState<OpsLane | null>(null)
  const [sheet, setSheet] = useState<Confirm | null>(null)
  const query = mode === 'day' ? `day=${day}` : `week=${isoWeek(day)}`

  const load = useCallback(async () => {
    try {
      setData(await src.ops(query))
      setError('')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [src, query])
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
  const next = queue.find((q) => q.kind === 'mission') ?? queue[0]
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

  return (
    <>
      <div className="backdrop" aria-hidden="true" />
      <div className="screen ops over">
        <section className="pn span2" aria-labelledby="oh">
          <div className="ops-head">
            <h1 id="oh" className="ops-title">Ops</h1>
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
            <span className="chip num" title="Background run slots">slots {dispatch.slots.busy}/{dispatch.slots.max}</span>
            {next && <span className="sub ops-next">next: {next.title}{next.next ? ` · ${clock(next.next)}` : ''}</span>}
          </div>
          {project && (
            <button type="button" className="chip-f" onClick={() => navigate('/ops')} aria-label={`Clear filter ${project}`}>
              {project.toUpperCase()} <span aria-hidden="true">×</span>
            </button>
          )}
          <div className="ops-stats num">
            <span><b>{s.lanes}</b> lanes</span>
            <span><b>{s.sessions}</b> sessions · <b>{s.runs}</b> runs</span>
            <span><b>{hours(s.active_s)}h</b> active</span>
            <span><b>{hours(s.wait_s)}h</b> waiting on you</span>
            <span><b>{s.done}</b> done</span>
            {s.failed > 0 && <span className="c-f"><b>{s.failed}</b> failed</span>}
            <span><b>{usd(s.cost)}</b></span>
          </div>
          <div className="ops-legend" aria-label="Legend">
            {LEGEND.map(([k, t]) => <span key={k}><i className={`sw st-${k}`} />{t}</span>)}
            <span><i className="sw st-working live" />live</span>
            <span><i className="sw planned" />planned</span>
            <span>◉ session ▷ run</span>
          </div>
          {error && <div className="err" role="alert">{error}</div>}
          {!data && !error && <div className="sub">Loading…</div>}
          {data && mode === 'day' && <Day lanes={lanes} queue={queue} day={day} today={today} now={now} dispatch={dispatch} onOpen={setOpen} />}
          {data && mode === 'week' && <Week data={data} lanes={lanes} today={today} now={now} onDay={(d) => { setDay(d); setMode('day') }} />}
        </section>

        <section className="pn" aria-labelledby="oq">
          <div className="ph"><h2 id="oq" style={{ font: 'inherit' }}>Queue</h2><span className="sub num">{queue.length}</span></div>
          {queue.length === 0 && <div className="sub">Nothing waits to run.</div>}
          {queue.map((q) => (
            <div key={`${q.kind}-${q.id}`} className="ops-q">
              <span className={`ops-k k-${q.kind}`}>{q.kind}</span>
              <span className="ops-qt">{q.title}{q.project ? <span className="sub"> · {q.project}</span> : null}</span>
              <span className="sub num">{q.next ? clock(q.next) : ''}</span>
              {q.kind === 'mission'
                ? <button type="button" className="icon-btn" aria-label={`Cancel ${q.title}`} onClick={() => cancel(q)}>✕</button>
                : <span />}
            </div>
          ))}
        </section>

        <section className="pn" aria-labelledby="ot">
          <div className="ph">
            <h2 id="ot" style={{ font: 'inherit' }}>Totals · {mode === 'day' ? 'day' : 'week'}</h2>
            <div className="seg sm" role="tablist" aria-label="Group by">
              {(['project', 'kind'] as const).map((b) => (
                <button key={b} type="button" role="tab" aria-selected={by === b} className={by === b ? 'on' : ''} onClick={() => setBy(b)}>{b.toUpperCase()}</button>
              ))}
            </div>
          </div>
          <table className="ops-tot num">
            <thead><tr><th>{by}</th><th>lanes</th><th>active</th><th>wait</th><th>stuck</th><th>failed</th><th>cost</th></tr></thead>
            <tbody>
              {totals.map((t) => (
                <tr key={t.name}>
                  <td>{t.name}</td><td>{t.lanes}</td><td>{hours(t.active_s)}h</td><td>{hours(t.wait_s)}h</td>
                  <td className={t.stuck ? 'c-stuck' : ''}>{t.stuck}</td><td className={t.failed ? 'c-f' : ''}>{t.failed}</td><td>{usd(t.cost_usd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
      {open && <LaneSheet lane={open} now={now} onClose={() => setOpen(null)} />}
      {sheet && <Sheet c={sheet} onClose={() => setSheet(null)} />}
    </>
  )
}

type Dispatch = ReturnType<typeof dispatchOf>

// The live agent of a lane: its session or run id among the lane keys.
const agentOf = (l: OpsLane, d: Dispatch) =>
  isLive(l) ? d.agents.find((a) => (a.session_id && l.keys.includes(a.session_id)) || (a.run_id && l.keys.includes(a.run_id))) : undefined

function Day({ lanes, queue, day, today, now, dispatch, onOpen }: { lanes: OpsLane[]; queue: OpsQueued[]; day: string; today: string; now: Date; dispatch: Dispatch; onOpen: (l: OpsLane) => void }) {
  const isToday = day === today
  const nowH = parisHour(now)
  const ax = axis(lanes, isToday, nowH)
  const ticks = Array.from({ length: ax[1] - ax[0] + 1 }, (_, i) => ax[0] + i)
  // Routines due later today: dashed marks after the now line.
  const planned = isToday ? queue.filter((q) => q.next && parisDay(new Date(q.next)) === day && Date.parse(q.next) > now.getTime()) : []
  if (!lanes.length && !planned.length) return <div className="sub">Nothing ran on this day.</div>
  const nowLine = isToday && <i className="ops-now" style={{ left: pct(nowH, ax) }} aria-hidden="true" />
  return (
    <div className="ops-tl">
      <div className="ops-row ops-axis" aria-hidden="true">
        <span />
        <div className="ops-track">
          {ticks.map((h) => <span key={h} className="ops-tick num" style={{ left: pct(h, ax) }}>{String(h).padStart(2, '0')}</span>)}
          {isToday && <span className="ops-nowtag num" style={{ left: pct(nowH, ax) }}>{clock(now)}</span>}
        </div>
      </div>
      {groups(lanes).map((g) => (
        <div key={g.project} className="ops-grp">
          <div className="ops-gh"><span>{g.project}</span><span className="sub num">{hours(g.lanes.reduce((a, l) => a + l.active_s, 0))}h</span></div>
          {g.lanes.map((l) => {
            const a = agentOf(l, dispatch)
            const rid = runId(l)
            return (
              <div key={l.id} className={`ops-row${isLive(l) ? ' is-live' : ''}`}>
                <button type="button" className="ops-name" onClick={() => onOpen(l)} title={l.title}>
                  <span className="ops-glyph" aria-label={l.kind === 'interactive' ? 'session' : 'run'}>{GLYPH[l.kind]}</span>
                  <span className="ops-lt">{l.title}</span>
                  <span className="sub num">{hours(l.active_s)}h</span>
                </button>
                <div className="ops-track" onClick={() => onOpen(l)}>
                  {ticks.map((h) => <i key={h} className="ops-grid" style={{ left: pct(h, ax) }} />)}
                  {l.spans.map((sp, i) => {
                    const a0 = parisHour(sp.start), a1 = parisHour(sp.end) || 24
                    const last = i === l.spans.length - 1 && isLive(l)
                    return <i key={i} className={`ops-span st-${sp.state}${last ? ' live' : ''}`} style={{ left: pct(a0, ax), width: `calc(${pct(a1, ax)} - ${pct(a0, ax)})` }} title={`${sp.state} ${clock(sp.start)}–${clock(sp.end)}`} />
                  })}
                  {nowLine}
                </div>
                {isLive(l) && (
                  <div className="ops-live sub num">
                    <span className="c-w">● {l.state}</span>
                    {rid && <span>{rid.slice(0, 8)}</span>}
                    {l.spans[0] && <span>{age(l.spans[0].start, now)}</span>}
                    <span>{usd(l.cost_usd)}</span>
                    {a && <Link href={`/desk/${a.pid}`} className="ops-open">OPEN</Link>}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      ))}
      {planned.length > 0 && (
        <div className="ops-grp">
          <div className="ops-gh"><span>planned</span><span className="sub num">{planned.length}</span></div>
          {planned.map((q) => (
            <div key={q.id} className="ops-row">
              <span className="ops-name"><span className="ops-glyph">▷</span><span className="ops-lt">{q.title}</span><span className="sub num">{clock(q.next!)}</span></span>
              <div className="ops-track">
                <i className="ops-span planned" style={{ left: pct(parisHour(q.next!), ax), width: `calc(${pct(parisHour(q.next!) + 0.25, ax)} - ${pct(parisHour(q.next!), ax)})` }} />
                {nowLine}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function Week({ data, lanes, today, now, onDay }: { data: OpsData; lanes: OpsLane[]; today: string; now: Date; onDay: (d: string) => void }) {
  const ax: [number, number] = [6, 24]
  const ticks = [6, 9, 12, 15, 18, 21, 24]
  return (
    <table className="ops-week num">
      <thead>
        <tr>
          <th>day</th>
          <th className="ops-wtrack">{ticks.map((h) => <span key={h} className="ops-tick" style={{ left: pct(h, ax) }}>{String(h % 24).padStart(2, '0')}</span>)}</th>
          <th>lanes</th><th>sess/runs</th><th>active</th><th>done</th>
        </tr>
      </thead>
      <tbody>
        {data.days.map((d) => {
          const ls = lanes.filter((l) => l.day === d)
          const s = stats(ls)
          const future = d > today
          return (
            <tr key={d} className={future ? 'future' : ''} onClick={future ? undefined : () => onDay(d)}>
              <td><button type="button" className="ops-wday" disabled={future}>{WEEKDAY.format(new Date(`${d}T12:00:00Z`))} {d.slice(8)}</button></td>
              <td className="ops-wtrack">
                <div className="ops-track">
                  {busy(ls).map(([a, b], i) => <i key={i} className="ops-span st-working" style={{ left: pct(a, ax), width: `calc(${pct(b, ax)} - ${pct(a, ax)})` }} />)}
                  {d === today && <i className="ops-now" style={{ left: pct(parisHour(now), ax) }} />}
                </div>
              </td>
              <td>{future ? '' : s.lanes}</td>
              <td>{future ? '' : `${s.sessions}/${s.runs}`}</td>
              <td>{future ? '' : `${hours(s.active_s)}h`}</td>
              <td>{future ? '' : s.done}</td>
            </tr>
          )
        })}
      </tbody>
    </table>
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
