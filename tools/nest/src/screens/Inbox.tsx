import { useState } from 'react'
import { ApiError } from '../data/api'
import { answerOf, isFyi, type AnswerRow } from '../data/inbox'
import type { Mail } from '../data/live'
import { LABEL, type UiState } from '../data/state'
import type { InboxItem, Mission } from '../data/types'
import { useSource, type Snapshot } from '../data/useData'
import { workWhen, type WorkItem } from '../data/work'
import { ago, time, title } from '../format'
import { Link } from '../router'
import { REJECT, useAnswer, verbLabel } from '../ui/answer'
import { stateClass } from '../ui/Glyph'
import { Sheet, type Confirm } from '../ui/Sheet'
import { useMedia } from '../ui/useMedia'
import { KindIcon, KindTag, TAG_LABEL, type TagKind } from '../ui/WorkList'

// Inbox (item_138 boards fold-inbox-inner, fold-inbox-cover) on the mission inbox of
// item_168. "To answer" merges questions and flagged or important mail (item_204, owner
// 2026-11-16) in the board row. Failed work stays on Desk. The reading pane answers a
// question inline, flags a mail done or snoozed, and opens a waiting session or run.
const INNER = '(min-width: 600px)'
const LATER = 'Arrives with the live API'
const short = (id: string) => id.replace(/^\d{8}-/, '')
const day = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: '2-digit' })
const stamp = (iso: string) => `${day.format(new Date(iso))} · ${time(iso)}`
const newest = (a: InboxItem, b: InboxItem) => b.created.localeCompare(a.created)
const initials = (p: string) => p.split(/[^a-z0-9]+/i).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?'
const valid = (iso?: string) => !!iso && !isNaN(Date.parse(iso))

type Seg = 'all' | 'answer' | 'drafts' | 'fyi'

// ---- icons (board paths) ----
const Diamond = ({ s = 13 }: { s?: number }) => (
  <svg width={s} height={s} viewBox="0 0 16 16" style={{ flex: 'none' }} aria-hidden="true"><path d="M8 1 15 8 8 15 1 8Z" fill="var(--c-n)" /></svg>
)
const Env = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="#8087a2" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></svg>
)
const Unfold = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
    <rect x="3" y="4" width="8" height="16" rx="2" /><path d="M15 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4M14 12h4m-2-2 2 2-2 2" />
  </svg>
)

// Where a waiting work item opens: its mission, the MRs, or the Desk for live work.
export function workHref(w: WorkItem) {
  if (w.kind === 'mission') return `/missions/${encodeURIComponent(w.source.ref)}`
  if (w.kind === 'mr') return '/mrs'
  if (w.mission) return `/missions/${encodeURIComponent(w.mission)}`
  return '/desk'
}

// One board row per answer row (owner 2026-11-16): title and clock time over source and
// status. A question's source line names what asks it. `when` and `why` feed the cover hero.
interface Line { state: UiState; title: string; src: string; status?: string; kind: TagKind; at?: string; when: string; why?: string }
function lineOf(r: AnswerRow, missions: Mission[], now: Date): Line {
  const at = valid(r.at) ? time(r.at!) : undefined
  // Line 2 names what the session or run asks (owner 2026-11-16): "session · lambda · asks Bash".
  if (r.kind === 'prompt') {
    const w = r.item
    return { state: 'needs', title: w.title, src: `${w.kind} · ${w.project}`, status: w.why, kind: 'question', at, when: workWhen(w, now), why: w.why }
  }
  if (r.kind === 'mail') {
    const m = r.item
    return { state: 'needs', title: m.subject, src: m.from ?? 'Outlook', status: m.flag ?? 'flagged', kind: 'mail', when: '', why: m.scope }
  }
  const q = r.item
  const m = missions.find((x) => x.id === q.mission)
  return { state: 'needs', title: q.ask, src: `mission · ${m ? title(m) : short(q.mission)}`, kind: 'question', at, when: valid(q.created) ? `waits ${ago(q.created, now)}` : '', why: q.ask }
}

function useInbox(snap: Snapshot, refresh: () => Promise<void>) {
  const { inbox, missions } = snap
  const act = useSource().actions
  const [seg, setSeg] = useState<Seg>('all')
  const [sheet, setSheet] = useState<Confirm | null>(null)
  const rows = answerOf(snap)
  const fyis = inbox.filter(isFyi).sort(newest)
  const fyiRows: AnswerRow[] = fyis.map((r) => ({ key: `q:${r.id}`, kind: 'ask', at: r.created, item: r }))
  const [sel, setSel] = useState<string | undefined>(rows[0]?.key ?? fyiRows[0]?.key)
  const picked = [...rows, ...fyiRows].find((r) => r.key === sel) ?? rows[0] ?? fyiRows[0]
  const q = picked?.kind === 'ask' ? picked.item : undefined
  const a = useAnswer(q, inbox, missions, refresh)
  const missionOf = (r: InboxItem) => missions.find((m) => m.id === r.mission)
  const line = (r: AnswerRow) => lineOf(r, missions, snap.now)

  const hide = (r: InboxItem) => setSheet({
    title: 'Hide this item?', lead: 'It leaves the inbox without a reply.',
    target: [['item', short(r.id)], ['project', r.project]],
    note: 'Same as crow inbox hide. Logged with surface nest.', ok: 'Hide',
    run: async () => {
      try {
        await act.inboxHide(r.id)
      } catch (e) {
        if (e instanceof ApiError && e.status === 409) void refresh()
        throw e
      }
      await refresh()
    },
  })
  // Same sheet the Desk had for flagged mail: it changes the Outlook flag only.
  const flag = (m: Mail, verb: 'done' | 'snooze') => setSheet({
    title: verb === 'done' ? 'Mark done' : 'Snooze', lead: verb === 'done' ? 'Marks the Outlook flag as complete.' : 'Moves the Outlook flag to tomorrow.',
    target: [['mail', m.subject]], note: 'Changes the Outlook flag only; nothing is sent.', ok: verb === 'done' ? 'Done' : 'Snooze',
    run: async () => { await act.mail(m.id, verb); await refresh() },
  })
  return { seg, setSeg, sel: picked?.key, setSel, picked, q, rows, fyis, a, missionOf, line, hide, flag, sheet, setSheet }
}
type I = ReturnType<typeof useInbox>

// ---- shared pieces ----
function From({ r, m }: { r: InboxItem; m?: Mission }) {
  return <>from {m ? title(m) : short(r.mission)} · {r.project} · {r.source} v{r.version}</>
}

function Stale({ i }: { i: I }) {
  if (!i.a.newer) return i.a.error ? <div className="err" role="alert">{i.a.error}</div> : null
  return (
    <div className="stale" role="alert">
      <b>THE MISSION MOVED ON · NOW V{i.a.mission?.version}</b>
      <div className="sm">You answered v{i.q?.version}. This is the newer question. Your text is kept.</div>
    </div>
  )
}

function Note({ i, big }: { i: I; big?: boolean }) {
  const r = i.q!
  return (
    <div className={`well${big ? ' big' : ''}`}>
      <div className="wh"><span className="lb">Note to the mission</span><span className="sm">{r.type} · v{i.a.mission?.version ?? r.version}</span></div>
      <textarea className="note" placeholder="Optional. Sent with the reply." aria-label="Note to the mission"
        value={i.a.text} onChange={(e) => i.a.setText(e.target.value)} disabled={i.a.busy} rows={3} />
      {!big && r.artifacts.map((f) => (
        <div className="row" key={f}><span className="f1">{f.split('/').pop()}</span><span className="sm">artifact</span></div>
      ))}
    </div>
  )
}

// The bottom row of the picked item: mission verbs, mail flag verbs, or an open link.
function Verbs({ i, hide, cls }: { i: I; hide?: boolean; cls: string }) {
  const p = i.picked!
  if (p.kind === 'mail') {
    return (
      <div className={`btnrow ${cls}`}>
        <button type="button" className="btn p" onClick={() => i.flag(p.item, 'done')}>Done</button>
        <button type="button" className="btn" onClick={() => i.flag(p.item, 'snooze')}>Snooze</button>
      </div>
    )
  }
  if (p.kind === 'prompt') {
    return <div className={`btnrow ${cls}`}><Link className="btn p" href={workHref(p.item)}>Open</Link></div>
  }
  const item = i.a.item
  const r = p.item
  return (
    <div className={`btnrow ${cls}`}>
      {item && i.a.mission && item.verbs.map((v, n) => (
        <button key={v} type="button" className={`btn${n === 0 ? ' p' : REJECT.includes(v) ? ' x' : ''}`}
          onClick={() => i.a.send(v)} disabled={i.a.busy} aria-busy={i.a.busy}>{n === 0 && i.a.busy ? 'Sending…' : verbLabel(v)}</button>
      ))}
      {hide && r.state === 'open' && <button type="button" className="btn x hide" onClick={() => i.hide(r)} disabled={i.a.busy}>Hide</button>}
    </div>
  )
}

const hasVerbs = (p: AnswerRow) => p.kind !== 'ask' || (p.item.state === 'open' && p.item.type !== 'fyi')

// Board row (fold-inbox-inner, owner 2026-11-16): the kind icon on the left in the state
// colour, title and time over source · status. No kind pill, no state column. Desk keeps row A.
function AnsRow({ i, r, cover }: { i: I; r: AnswerRow; cover?: boolean }) {
  const l = i.line(r)
  const on = r.key === i.sel
  const sub = l.status ? `${l.src} · ${l.status}` : l.src
  return (
    <button type="button" className={`row irow${cover ? ' r2' : ''}${on ? ' on' : ''}`} aria-pressed={on} onClick={() => i.setSel(r.key)}
      aria-label={`${TAG_LABEL[l.kind]} ${l.title}, ${sub}, ${LABEL[l.state]}${l.at ? `, ${l.at}` : ''}`}>
      <span className={`ic ${stateClass(l.state)}`}><KindIcon kind={l.kind} size={16} /></span>
      <span className="t">
        <b>{l.title}</b>
        <span>{l.src}{l.status && <> · <span>{l.status}</span></>}</span>
      </span>
      {l.at && <span className="tm num">{l.at}</span>}
    </button>
  )
}

// FYI keeps its one-line row.
function FyiRow({ i, r }: { i: I; r: InboxItem }) {
  const on = `q:${r.id}` === i.sel
  return (
    <button type="button" className={`row${on ? ' on' : ''}`} aria-pressed={on} onClick={() => i.setSel(`q:${r.id}`)}>
      <span className="sm num">{time(r.created)}</span><span className="f1">{r.project} · {r.ask}</span>
    </button>
  )
}

// ---- reading pane (inner and laptop) ----
function Read({ i }: { i: I }) {
  const p = i.picked
  if (!p) return <section className="pn grow read"><div className="sm">Inbox is empty.</div></section>
  if (p.kind === 'mail') {
    const m = p.item
    return (
      <section className="pn grow read" aria-labelledby="rt" aria-live="polite">
        <h2 className="ph" id="rt"><span className="rt">{m.subject}</span></h2>
        <div className="sm">from {m.from ?? 'unknown'}{m.scope && <> · {m.scope} mailbox</>} · flagged or important in Outlook</div>
        <div className="body">Crow does not read the body yet. Open it in Outlook.</div>
        <Verbs i={i} cls="end act" />
      </section>
    )
  }
  if (p.kind === 'prompt') {
    const w = p.item
    return (
      <section className="pn grow read" aria-labelledby="rt" aria-live="polite">
        <h2 className="ph" id="rt"><span className="rt">{w.title}</span>{valid(w.since) && <span className="sm num">{stamp(w.since!)}</span>}</h2>
        <div className="sm">{w.project} · <KindTag kind={w.kind} /></div>
        <div className="body">{w.why ?? 'Waiting on you.'}</div>
        <Verbs i={i} cls="end act" />
      </section>
    )
  }
  const r = p.item
  const m = i.missionOf(r)
  return (
    <section className="pn grow read" aria-labelledby="rt" aria-live="polite">
      <h2 className="ph" id="rt"><span className="rt">{m ? title(m) : short(r.mission)}</span><span className="sm num">{stamp(r.created)}</span></h2>
      <div className="sm"><From r={r} m={m} /> · <Link className="lk" href={`/missions/${r.mission}`}>Mission ›</Link></div>
      <div className="body">{(i.a.item ?? r).ask}</div>
      <Stale i={i} />
      {r.state === 'open' && r.type !== 'fyi' && <Note i={i} />}
      <div className="sm">source: {r.file}</div>
      {r.state === 'open' && <Verbs i={i} hide cls="end act" />}
    </section>
  )
}

// ---- fold inner and laptop (board fold-inbox-inner) ----
function InboxInner({ i }: { i: I }) {
  const all = i.rows.length + i.fyis.length
  const segs: Array<[Seg, string]> = [['all', `All ${all}`], ['answer', 'Answer'], ['drafts', 'Drafts'], ['fyi', 'FYI']]
  const show = (s: Seg) => i.seg === 'all' || i.seg === s
  return (
    <div className="desk desk-in ibx">
      <div className="col">
        <div className="segs" role="group" aria-label="Filter">
          {segs.map(([k, l]) => (
            <button key={k} type="button" className={`seg${i.seg === k ? ' on' : ''}`} aria-pressed={i.seg === k} onClick={() => i.setSeg(k)}>{l}</button>
          ))}
        </div>
        <section className="pn grow list-pn" aria-label="Inbox">
          {show('answer') && (
            <>
              <div className="grp c-n"><span>To answer</span><span className="num">{i.rows.length}</span></div>
              <div className="alist">{i.rows.map((r) => <AnsRow key={r.key} i={i} r={r} />)}</div>
            </>
          )}
          {show('drafts') && (
            <>
              <div className="grp c-m"><span>Drafts ready</span><span className="num" /></div>
              <div className="sm later">{LATER}</div>
            </>
          )}
          {show('fyi') && (
            <>
              <div className="grp c-q"><span>FYI</span><span className="num">{i.fyis.length}</span></div>
              {i.fyis.map((r) => <FyiRow key={r.id} i={i} r={r} />)}
            </>
          )}
        </section>
        <section className="pn none" aria-labelledby="tr">
          <h2 className="ph" id="tr"><span>Triage</span></h2>
          <div className="row"><Diamond /><span className="f1">Rules</span><Link className="lk" href="/reports">Reports ›</Link></div>
          <div className="sm">{LATER} · crow never sends</div>
        </section>
      </div>
      <Read i={i} />
    </div>
  )
}

// ---- fold cover (board fold-inbox-cover) ----
function Hero({ i }: { i: I }) {
  const p = i.picked
  if (!p) return <section className="gcard dhero"><div className="gt"><span>Inbox</span></div><div className="gs">Nothing to answer.</div></section>
  const count = `To answer · ${i.rows.length}`
  if (p.kind !== 'ask') {
    const l = i.line(p)
    return (
      <section className="gcard dhero ask" aria-labelledby="ct">
        <div className="gt"><span className="c-n">{count}</span><span className="num">{l.when}</span></div>
        <div className="who">
          <span className="av" aria-hidden="true">{initials(l.src)}</span>
          <div className="hm"><h2 className="gh" id="ct">{l.title}</h2><span className="gs">{l.src} · <KindTag kind={l.kind} /></span></div>
        </div>
        {l.why && <div className="body">{p.kind === 'mail' ? `${l.why} mailbox` : l.why}</div>}
      </section>
    )
  }
  const r = p.item
  const m = i.missionOf(r)
  return (
    <section className="gcard dhero ask" aria-labelledby="ct">
      <div className="gt"><span className={r.type === 'fyi' ? 'c-q' : 'c-n'}>{r.type === 'fyi' ? 'FYI' : count}</span><span className="num">{time(r.created)}</span></div>
      <div className="who">
        <span className="av" aria-hidden="true">{initials(r.project)}</span>
        <div className="hm"><h2 className="gh" id="ct">{m ? title(m) : short(r.mission)}</h2><span className="gs"><From r={r} m={m} /></span></div>
      </div>
      <div className="body">{(i.a.item ?? r).ask}</div>
      <Stale i={i} />
      {r.state === 'open' && r.type !== 'fyi' && <Note i={i} big />}
    </section>
  )
}

function InboxCover({ i }: { i: I }) {
  const p = i.picked
  const rest = i.rows.filter((x) => x.key !== p?.key)
  return (
    <div className="desk desk-cv ibx">
      <Hero i={i} />
      <div className="gl">
        <div className="gls"><span>Also today</span><span className="num">{rest.length + i.fyis.length}</span></div>
        {rest.slice(0, 3).map((x) => <AnsRow key={x.key} i={i} r={x} cover />)}
        {i.fyis.length > 0 && (
          <button type="button" className="row r2" onClick={() => i.setSel(`q:${i.fyis[0].id}`)}>
            <span className="ic"><Env /></span>
            <span className="t"><b>{i.fyis.length} FYI</b><span>{[...new Set(i.fyis.map((x) => x.project))].join(', ')}</span></span>
            <span className="chev">›</span>
          </button>
        )}
        <Link className="row r2" href="/reports">
          <span className="ic tri"><Diamond /></span>
          <span className="t"><b>Triage rules</b><span>{LATER}</span></span>
          <span className="chev">›</span>
        </Link>
      </div>
      <div className="uf"><Unfold />unfold to read and hide</div>
      {p && hasVerbs(p) && <div className="dock"><Verbs i={i} cls="gbtns" /></div>}
    </div>
  )
}

export function Inbox({ snap, refresh }: { snap: Snapshot; refresh: () => Promise<void> }) {
  const i = useInbox(snap, refresh)
  const inner = useMedia(INNER)
  return (
    <>
      {inner ? <InboxInner i={i} /> : <InboxCover i={i} />}
      {i.sheet && <Sheet c={i.sheet} onClose={() => i.setSheet(null)} />}
    </>
  )
}
