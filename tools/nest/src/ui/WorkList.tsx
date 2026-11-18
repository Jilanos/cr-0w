import type { ReactNode } from 'react'
import { LABEL } from '../data/state'
import { KIND_LABEL, workWhen, type WorkGroup, type WorkItem, type WorkKind } from '../data/work'
import { Glyph, stateClass } from './Glyph'

// Kind icons (22 grid, tab icon stroke) shown in the kind tag of a work row.
const KIND_ICON: Record<WorkKind, ReactNode> = {
  session: <><rect x="2.5" y="4" width="17" height="13" rx="2" /><path d="M6 9l3 2-3 2M11 14h5" /></>,
  run: <path d="M7 4.5v13l10-6.5Z" />,
  mission: <><path d="M5 19.5V3" /><path d="M5 4h12l-2.5 4.5L17 13H5" /></>,
  mr: <><circle cx="6" cy="5" r="2" /><circle cx="6" cy="17" r="2" /><circle cx="16" cy="17" r="2" /><path d="M6 7v8M16 15V9a3 3 0 0 0-3-3h-3" /></>,
  parked: <path d="M8 5v12M14 5v12" />,
}

// Inbox rows add mail (owner 2026-11-15) and questions (owner 2026-11-16), item_204.
export type TagKind = WorkKind | 'mail' | 'question'
export const TAG_ICON: Record<TagKind, ReactNode> = {
  ...KIND_ICON,
  mail: <><rect x="3" y="5" width="16" height="12" rx="2" /><path d="m3 7 8 5.5L19 7" /></>,
  question: <><circle cx="11" cy="11" r="8.5" /><path d="M8.6 8.7a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1.1.9-1.1 1.6v.6M11 15.9v.1" /></>,
}
export const TAG_LABEL: Record<TagKind, string> = { ...KIND_LABEL, mail: 'Mail', question: 'Question' }

export function KindIcon({ kind, size = 13 }: { kind: TagKind; size?: number }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round" strokeLinecap="round">
      {TAG_ICON[kind]}
    </svg>
  )
}

export function KindTag({ kind }: { kind: TagKind }) {
  return <span className="ktag"><KindIcon kind={kind} />{TAG_LABEL[kind]}</span>
}

// The main action of a row (item_246): Retry, Open MR, Allow, Answer.
export interface RowAct { label: string; run: () => void }
type ActOf = (w: WorkItem) => RowAct | undefined

function Row({ w, now, open, act, compact }: { w: WorkItem; now: Date; open: (w: WorkItem) => void; act?: ActOf; compact?: boolean }) {
  const when = workWhen(w, now)
  const label = `${KIND_LABEL[w.kind]} ${w.title}, ${w.project}, ${LABEL[w.state]}${when ? `, ${when}` : ''}`
  const why = w.why && <span className={w.state === 'failed' ? 'c-f' : undefined}>{w.why}</span>
  // Compact rows (laptop Desk) fold state and time into the sub line; the action sits on the right.
  if (compact) {
    const a = act?.(w)
    return (
      <div className={`wrow wc s-${w.state}`}>
        <button type="button" className="wmain" onClick={() => open(w)} aria-label={label}>
          <span className="wg"><Glyph state={w.state} size={18} /></span>
          <span className="t">
            <b>{w.title}</b>
            <span>{w.project}{why ? <> · {why}</> : <> · {LABEL[w.state]}</>}{when && <> · {when}</>}</span>
          </span>
        </button>
        {a && <button type="button" className="btn p wact" onClick={a.run} aria-label={`${a.label} ${w.title}`}>{a.label}</button>}
      </div>
    )
  }
  return (
    <button type="button" className={`wrow s-${w.state}`} onClick={() => open(w)} aria-label={label}>
      <span className="wg"><Glyph state={w.state} size={18} /></span>
      <span className="t">
        <b>{w.title}</b>
        <span>{w.project}{why && <> · {why}</>}</span>
      </span>
      <KindTag kind={w.kind} />
      <span className="ws">
        <span className={stateClass(w.state)}>{LABEL[w.state]}</span>
        {when && <span className="num">{when}</span>}
      </span>
    </button>
  )
}

// The Desk work list (item_204 option A): one row per item, a mission's items on a
// rail under its goal. `open` acts on a row (pick the agent, resume, open the mission).
export function WorkList({ groups, now, open, act, compact, empty = 'Nothing on the desk, Sir.' }:
  { groups: WorkGroup[]; now: Date; open: (w: WorkItem) => void; act?: ActOf; compact?: boolean; empty?: string }) {
  if (!groups.length) return <div className="sm">{empty}</div>
  return (
    <div className="wlist">
      {groups.map((g) => (
        <div key={g.item.id} className="wgrp">
          <Row w={g.item} now={now} open={open} act={act} compact={compact} />
          {g.children.length > 0 && (
            <div className="wrail" role="group" aria-label={`Items of ${g.item.title}`}>
              {g.children.map((c) => <Row key={c.id} w={c} now={now} open={open} act={act} compact={compact} />)}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
