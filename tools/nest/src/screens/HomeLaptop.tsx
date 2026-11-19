import { countByState, lastRun, openInbox, uiState } from '../data/state'
import type { InboxItem } from '../data/types'
import type { Snapshot } from '../data/useData'
import { ago, duration, elapsed, time, title } from '../format'
import { Hero } from '../hero/Hero'
import { Link } from '../router'
import { Glyph } from '../ui/Glyph'
import { byUrgency } from './order'
import { KIND_LABEL, workOf, workWhen } from '../data/work'

// Laptop home (item_176): the hero is the main thing; one column on the left (needs you,
// next event, then what runs) and the butler rail as the right column. Agenda, MRs and reports join the
// column as one-line rows once their live data exists; no placeholders.

const ANSWER: Record<string, string> = { approval: 'Approve', review: 'Accept', choice: 'Answer' }

function Kc({ n, href, label }: { n: number; href: string; label: string }) {
  return <Link href={href} className="kc" title={`${label} tab`} aria-label={`Open ${label}`}>{n}</Link>
}

export function HomeLaptop({ snap }: { snap: Snapshot }) {
  const { missions, inbox, now } = snap
  // The next event that has not ended yet; the panel shows only once the agenda has data.
  const next = [...snap.agenda].sort((a, b) => a.start.localeCompare(b.start)).find((e) => new Date(e.end) > now)
  // Live sessions and runs from the core work feed (missions and MRs have their own rows).
  const work = (workOf(snap.sections.work) ?? []).filter((w) => w.kind === 'session' || w.kind === 'run')
  const waitingWork = work.filter((w) => w.state === 'needs')
  const liveWork = work.filter((w) => w.state === 'working')
  const mc = countByState(missions, inbox)
  const c = { ...mc, working: mc.working + liveWork.length, needs: mc.needs + waitingWork.length }
  const open = openInbox(inbox)
  const asks = open
    .filter((r) => r.type !== 'fyi')
    .sort((a, b) => Number(!!b.blocking) - Number(!!a.blocking) || a.created.localeCompare(b.created))
  const failed = missions.filter((m) => uiState(m, inbox) === 'failed')
  const ranked = byUrgency(missions, inbox)
  // Needs and failed already sit in Needs you: the list keeps runs, queue and sleep (board).
  const live = ranked.filter((m) => !['done', 'needs', 'failed'].includes(uiState(m, inbox)))
  const byId = (r: InboxItem) => missions.find((m) => m.id === r.mission)
  const [first, ...rest] = asks
  const firstM = first && byId(first)
  // Home shows three: the first ask as a card, then failures, waiting sessions and older asks.
  const more = [
    ...failed.map((m) => {
      const run = lastRun(m)
      return (
        <div key={m.id} className="row edge-f">
          <Glyph state="failed" />
          <span className="t">{title(m)} failed</span>
          {run?.ended && <span className="sm">{ago(run.ended, now)}</span>}
          <Kc n={3} href={`/missions/${m.id}`} label="Missions" />
        </div>
      )
    }),
    ...waitingWork.map((w) => (
      <Link key={w.id} href="/desk" className="row edge-n">
        <Glyph state="needs" />
        <span className="t">{w.title}</span>
        <span className="tag c-tag">{w.project}</span>
        <span className="sm">{workWhen(w, now)}</span>
      </Link>
    )),
    ...rest.map((r) => (
      <div key={r.id} className="row edge-n">
        <Glyph state="needs" />
        <span className="t">{r.ask}</span>
        <span className="sm">{ago(r.created, now)}</span>
        <Kc n={4} href="/inbox" label="Inbox" />
      </div>
    )),
  ]
  const shown = first ? 2 : 3
  let q = 0

  return (
    <div className="lp home-lp">
      <div className="rail">
        <section className="pn" aria-labelledby="h-needs">
          <h2 className="ph" id="h-needs"><span>Needs you</span><span className="st c-n">{asks.length + failed.length + waitingWork.length}</span></h2>
          {first ? (
            <div className="row card edge-n">
              <div className="line">
                <Glyph state="needs" />
                <b className="t">{firstM ? title(firstM) : first.ask}</b>
                <span className="tag c-tag">{first.project}</span>
                <Kc n={4} href="/inbox" label="Inbox" />
              </div>
              <div className="sm">{first.ask} · {ago(first.created, now)}</div>
              <div className="acts">
                <Link href="/inbox" className="btn pri">{ANSWER[first.type] ?? 'Open'}</Link>
                {firstM && <Link href={`/missions/${firstM.id}`} className="btn">Mission</Link>}
              </div>
            </div>
          ) : !failed.length && !waitingWork.length && <div className="sm later">All quiet, Sir.</div>}
          {more.slice(0, shown)}
          {more.length > shown && (
            <Link href="/inbox" className="go more">{more.length - shown} more in Inbox →</Link>
          )}
        </section>

        {next && (
          <section className="pn" aria-labelledby="h-ag">
            <h2 className="ph" id="h-ag"><span className="k">6</span><span>Next</span><span className="st">today</span><Link href="/agenda" className="go">open →</Link></h2>
            <Link href="/agenda" className="next-ev">
              <span className="tm">{time(next.start)}</span>
              <span className="t">{next.title}</span>
              <span className="sm">{new Date(next.start) > now ? `in ${duration(now.toISOString(), next.start)}` : 'now'}</span>
            </Link>
          </section>
        )}

        <section className="pn grow" aria-labelledby="h-ms">
          <h2 className="ph" id="h-ms">
            <span className="k">3</span><span>Running</span>
            <span className="st">{c.working} run · {c.queued} queue · {c.sleeping} sleep</span>
            <Link href="/missions" className="go">open →</Link>
          </h2>
          <div className="list">
            {liveWork.map((w) => (
              <Link key={w.id} href="/desk" className="row">
                <Glyph state="working" /><span className="t">{w.title}</span><span className="sm">{KIND_LABEL[w.kind]}</span>
              </Link>
            ))}
            {live.map((m) => {
              const s = uiState(m, inbox)
              const run = lastRun(m)
              let end
              if (s === 'working' && run && !run.ended) end = <span className="tm">{elapsed(run.started, now)}</span>
              else if (s === 'queued') end = <span className="sm">Q{++q}</span>
              else if (s === 'sleeping') end = <span className="sm">sleep</span>
              return (
                <Link key={m.id} href={`/missions/${m.id}`} className="row">
                  <Glyph state={s} /><span className="t">{title(m)}</span>{end}
                </Link>
              )
            })}
          </div>
        </section>

      </div>

      <section className="slot hero-slot" aria-label="CR-0W overview">
        <Hero missions={missions} inbox={inbox} now={now} sections={snap.sections} />
      </section>
    </div>
  )
}
