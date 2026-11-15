import type { Snapshot } from './feed'
import { mailOf, type Mail } from './live'
import { openInbox } from './state'
import type { InboxItem } from './types'
import { workCounts, workOf, type WorkItem } from './work'

// The Inbox "To answer" list (item_204, owner 2026-11-15): crow questions, failed
// work items and flagged or important mail, read from the scoped snapshot.
export type AnswerRow =
  | { key: string; kind: 'ask'; at: string; item: InboxItem }
  | { key: string; kind: 'failed'; at?: string; item: WorkItem }
  | { key: string; kind: 'mail'; at?: undefined; item: Mail }

export const isAsk = (r: InboxItem) => r.state === 'open' && r.type !== 'fyi'
export const isFyi = (r: InboxItem) => r.state === 'open' && r.type === 'fyi'

const valid = (iso: string | undefined) => !!iso && !isNaN(Date.parse(iso))
// Oldest first; rows with no time (mail) go last in source order.
const byWait = (a: { at?: string }, b: { at?: string }) => {
  const x = valid(a.at) ? Date.parse(a.at!) : Infinity
  const y = valid(b.at) ? Date.parse(b.at!) : Infinity
  return x === y ? 0 : x < y ? -1 : 1
}

// Failed items first, then questions and mail by how long they wait.
export function toAnswer(inbox: InboxItem[], work: WorkItem[] | null, mail: Mail[]): AnswerRow[] {
  const failed: AnswerRow[] = (work ?? []).filter((w) => w.state === 'failed')
    .map((w) => ({ key: `w:${w.id}`, kind: 'failed' as const, at: w.since, item: w }))
  const asks: AnswerRow[] = inbox.filter(isAsk).map((r) => ({ key: `q:${r.id}`, kind: 'ask' as const, at: r.created, item: r }))
  const mails: AnswerRow[] = mail.map((m) => ({ key: `m:${m.id}`, kind: 'mail' as const, item: m }))
  return [...failed.sort(byWait), ...[...asks, ...mails].sort(byWait)]
}

export const answerOf = (s: Snapshot) => toAnswer(s.inbox, workOf(s.sections.work), mailOf(s.sections.today))

// Inbox tab badge: needs + failed of the work feed; without the feed, open asks.
export function inboxBadge(s: Snapshot): { n: number; failed?: boolean } {
  const work = workOf(s.sections.work)
  if (!work) return { n: openInbox(s.inbox).filter((r) => r.type !== 'fyi').length }
  const c = workCounts(work)
  return { n: c.needs + c.failed, failed: c.failed > 0 }
}
