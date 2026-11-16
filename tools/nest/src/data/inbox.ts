import type { Snapshot } from './feed'
import { mailOf, type Mail } from './live'
import type { InboxItem } from './types'
import { workOf, type WorkItem } from './work'

// The Inbox "To answer" list (item_204, owner 2026-11-16 second review): only what the
// owner reads or answers. A question is a crow inbox question (`ask`, from a mission) or a
// live session or run waiting on a prompt (`prompt`); mail is flagged or important mail.
// Failed runs and red-pipeline MRs stay on Desk.
export type AnswerRow =
  | { key: string; kind: 'ask'; at: string; item: InboxItem }
  | { key: string; kind: 'prompt'; at?: string; item: WorkItem }
  | { key: string; kind: 'mail'; at?: undefined; item: Mail }

export const isAsk = (r: InboxItem) => r.state === 'open' && r.type !== 'fyi'
export const isFyi = (r: InboxItem) => r.state === 'open' && r.type === 'fyi'
// A session or run waiting on a prompt or choice. MRs waiting on a review stay on Desk
// and MRs; a mission's needs item is its inbox question, listed once as an ask.
export const isPrompt = (w: WorkItem) => w.state === 'needs' && (w.kind === 'session' || w.kind === 'run')

const valid = (iso: string | undefined) => !!iso && !isNaN(Date.parse(iso))
// Oldest first; rows with no time (mail) go last in source order.
const byWait = (a: { at?: string }, b: { at?: string }) => {
  const x = valid(a.at) ? Date.parse(a.at!) : Infinity
  const y = valid(b.at) ? Date.parse(b.at!) : Infinity
  return x === y ? 0 : x < y ? -1 : 1
}

// When a work item started waiting: now minus wait_s, else its since.
function waitFrom(w: WorkItem, now?: Date): string | undefined {
  if (now && w.wait_s != null) return new Date(now.getTime() - w.wait_s * 1000).toISOString()
  return w.since
}

// Questions and mail by how long they wait.
export function toAnswer(inbox: InboxItem[], work: WorkItem[] | null, mail: Mail[], now?: Date): AnswerRow[] {
  const asks: AnswerRow[] = inbox.filter(isAsk).map((r) => ({ key: `q:${r.id}`, kind: 'ask' as const, at: r.created, item: r }))
  const prompts: AnswerRow[] = (work ?? []).filter(isPrompt)
    .map((w) => ({ key: `w:${w.id}`, kind: 'prompt' as const, at: waitFrom(w, now), item: w }))
  const mails: AnswerRow[] = mail.map((m) => ({ key: `m:${m.id}`, kind: 'mail' as const, item: m }))
  return [...asks, ...prompts, ...mails].sort(byWait)
}

export const answerOf = (s: Snapshot) => toAnswer(s.inbox, workOf(s.sections.work), mailOf(s.sections.today), s.now)

// Inbox tab badge (owner 2026-11-16): the number of rows in "To answer", so the badge
// and the list always agree.
export function inboxBadge(s: Snapshot): { n: number } {
  return { n: answerOf(s).length }
}
