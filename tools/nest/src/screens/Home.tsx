import { Fragment } from 'react'
import { homeCounts, homeModel, type HomeModel } from '../data/home'
import type { Snapshot } from '../data/useData'
import { time } from '../format'
import { Hero } from '../hero/Hero'
import { Link } from '../router'
import { Glyph } from '../ui/Glyph'
import { HomeLaptop } from './HomeLaptop'
import { LAPTOP, useMedia } from '../ui/useMedia'

const INNER = '(min-width: 600px)'

export function Home({ snap }: { snap: Snapshot }) {
  const laptop = useMedia(LAPTOP)
  if (laptop) return <HomeLaptop snap={snap} />
  return <HomeCompact snap={snap} />
}

const cls = (p: number) => (p < 15 ? 'lo' : p < 40 ? 'md' : '')
const old = (m: number | null) => (m === null ? 'age unknown' : m < 1 ? 'just now' : `${m} min old`)

const K = {
  mission: <svg className="k" width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><rect x="2" y="2" width="12" height="12" rx="2" fill="none" stroke="currentColor" strokeWidth="1.6" /><path d="M5 8h6M8 5v6" stroke="currentColor" strokeWidth="1.6" /></svg>,
  session: <svg className="k" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><rect x="1.5" y="2.5" width="13" height="11" rx="1.5" /><path d="M4.5 6.5l2 1.5-2 1.5M8 10.5h3.5" /></svg>,
  run: <svg className="k" width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 2.5v11l9-5.5Z" fill="currentColor" /></svg>,
  need: <svg className="k n" width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1 15 8 8 15 1 8Z" fill="currentColor" /></svg>,
  alert: <svg className="k f" width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.5 15 14H1Z" fill="currentColor" /><path d="M8 6v4M8 11.5v1" stroke="var(--bg)" strokeWidth="1.6" /></svg>,
}

function HudRow({ m }: { m: HomeModel }) {
  const u = m.usage.stale ? `usage ${old(m.usage.age)}, refresh failed` : `usage ${old(m.usage.age)}`
  const s = m.status.stale || (m.status.age ?? 0) >= 1 ? `runs ${old(m.status.age)}` : 'live'
  return (
    <div className="hrow">
      <div className="hq" role="group" aria-label="Quota left">
        {m.quota.length ? m.quota.map((q) => (
          <Fragment key={q.account}>
            <b>{q.account}</b>
            <span className="bars" aria-hidden="true">
              <span className="bar"><i className={cls(q.h)} style={{ width: `${q.h}%` }} /></span>
              <span className="bar"><i className={cls(q.w)} style={{ width: `${q.w}%` }} /></span>
            </span>
            <span className="v num" aria-label={`${q.h}% of 5 hours, ${q.w}% of the week left`}>{q.h}<span className="sub">/</span><span className={cls(q.w) === 'lo' ? 'c-f' : ''}>{q.w}</span></span>
          </Fragment>
        )) : <span className="empty" style={{ gridColumn: '1/-1' }}>No usage yet.</span>}
        <span className={`stl${m.usage.stale ? ' bad' : ''}`}>5h / week left · {u}</span>
      </div>
      <div className="hq hk" role="group" aria-label="Status">
        <b>need you</b><span className="v c-n"><Glyph state="needs" size={12} /> {m.needs.length}</span>
        <b>working</b><span className="v c-w"><Glyph state="working" size={12} /> {m.working}</span>
        <b>slots</b><span className="v num">{m.slots.busy}<span className="sub">/</span>{m.slots.max}</span>
        <span className={`stl${m.status.stale ? ' bad' : ''}`}>{s}</span>
      </div>
    </div>
  )
}

function Needs({ m }: { m: HomeModel }) {
  return (
    <section className="pn" aria-labelledby="needs">
      <div className="ph"><h2 id="needs" style={{ font: 'inherit' }}>Needs you first</h2><span className="sub num">{m.needs.length}</span></div>
      {m.needs.length ? m.needs.map((r) => (
        <div key={r.key} className={`row ${r.kind === 'alert' ? 'al' : 'wt'}`}>
          {r.kind === 'alert' ? K.alert : K.need}
          <span className="t"><b>{r.title}</b><span>{r.sub}</span></span>
          <Link href={r.href} className="btn p sm">{r.action}</Link>
        </div>
      )) : <div className="empty">All quiet, Sir.</div>}
    </section>
  )
}

function Running({ m }: { m: HomeModel }) {
  return (
    <section className="pn" aria-labelledby="running">
      <div className="ph">
        <h2 id="running" style={{ font: 'inherit' }}>Running</h2>
        <span className="r"><span className="sub num">{m.running.length} · slots {m.slots.busy}/{m.slots.max}</span><Link href="/desk">Desk ›</Link></span>
      </div>
      {m.running.length ? m.running.map((r) => (
        <Link key={r.key} href={r.href} className={`row${r.waiting ? ' wt' : ''}`} aria-label={`${r.kind} ${r.title}, ${r.state}`}>
          {K[r.kind]}
          <span className="t">
            <b>{r.title}</b>
            <span><span className={r.waiting ? 'c-n' : r.state === 'working' ? 'c-w' : ''}>{r.state}</span>{[r.step, r.age, r.account].filter(Boolean).map((x) => ` · ${x}`).join('')}</span>
          </span>
          <span className="chev" aria-hidden="true">›</span>
        </Link>
      )) : <div className="empty">Nothing running.</div>}
    </section>
  )
}

function Agenda({ m }: { m: HomeModel }) {
  return (
    <section className="pn" aria-labelledby="agenda">
      <div className="ph"><h2 id="agenda" style={{ font: 'inherit' }}>Agenda</h2><Link href="/agenda">Open ›</Link></div>
      {m.agenda.events.length ? (
        <>
          <div className="sub">{m.agenda.label}</div>
          {m.agenda.events.map((e) => <div key={e.id} className="ag"><span className="tm num">{time(e.start)}</span><span>{e.title}</span></div>)}
        </>
      ) : <div className="empty">Nothing planned.</div>}
    </section>
  )
}

// Phone Home (item_171, pass 3b option D). Cover: one column. Inner: holotable
// column on the left (HUD, holotable, agenda), needs and running on the right.
function HomeCompact({ snap }: { snap: Snapshot }) {
  const { missions, inbox, now } = snap
  const inner = useMedia(INNER)
  const m = homeModel(snap)
  const c = homeCounts(snap)
  const say = c.needs
    ? `${c.needs} need you, Sir. ${c.working} working.`
    : c.working ? `Nothing needs you, Sir. ${c.working} working.` : 'All quiet, Sir.'
  const holo = <div className="hwrap"><Hero missions={missions} inbox={inbox} now={now} say={say} sections={snap.sections} /></div>
  if (inner) {
    return (
      <div className="screen home-ph a2">
        <div className="hside"><HudRow m={m} />{holo}<Agenda m={m} /></div>
        <div className="stack"><Needs m={m} /><Running m={m} /></div>
      </div>
    )
  }
  return (
    <div className="screen home-ph col">
      <HudRow m={m} />
      {holo}
      <Needs m={m} />
      <Running m={m} />
      <Agenda m={m} />
    </div>
  )
}

export function Kpi({ n, label, cls }: { n: number; label: string; cls: string }) {
  return (
    <div className="kpi">
      <span className={`kn num ${cls}`}>{n}</span>
      <span className="kl">{label}</span>
    </div>
  )
}
