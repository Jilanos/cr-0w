import { describe, expect, it } from 'vitest'
import { feed, type Snapshot } from './feed'
import { fixtureSource } from './fixtures'
import { answerOf, inboxBadge, toAnswer } from './inbox'
import type { Mail } from './live'
import { scopeSnapshot } from './scope'
import type { InboxItem } from './types'
import { workOf, type WorkItem } from './work'

const snapshot = async (): Promise<Snapshot> => {
  const box: { s?: Snapshot } = {}
  await feed(fixtureSource(), (x) => { box.s = x })()
  return box.s!
}

const ask = (id: string, created: string, extra: Partial<InboxItem> = {}) =>
  ({ id, mission: 'm', project: 'p', type: 'decision', state: 'open', created, ask: id, verbs: [], artifacts: [], version: 1, source: 'crow', file: 'f', ...extra }) as unknown as InboxItem
const work = (id: string, state: WorkItem['state'], since?: string, extra: Partial<WorkItem> = {}) =>
  ({ id, kind: 'run', project: 'p', title: id, state, since, source: { section: 'dispatch', ref: id }, ...extra }) as WorkItem
const mail = (id: string): Mail => ({ id, subject: id })

describe('toAnswer', () => {
  it('lists questions and mail by wait, never failed work (owner 2026-11-16)', () => {
    const rows = toAnswer(
      [ask('q-new', '2026-11-09T15:00:00+01:00'), ask('q-old', '2026-11-09T10:00:00+01:00'), ask('f', '2026-11-09T09:00:00+01:00', { type: 'fyi' })],
      [work('w-late', 'failed', '2026-11-09T15:30:00+01:00'), work('w-needs', 'needs', '2026-11-09T08:00:00+01:00'), work('w-early', 'failed', '2026-11-09T11:00:00+01:00')],
      [mail('m-1'), mail('m-2')],
    )
    expect(rows.map((r) => r.key)).toEqual(['w:w-needs', 'q:q-old', 'q:q-new', 'm:m-1', 'm:m-2'])
  })

  it('skips answered questions and works without the work feed', () => {
    const rows = toAnswer([ask('done', '2026-11-09T10:00:00+01:00', { state: 'answered' } as Partial<InboxItem>)], null, [mail('m')])
    expect(rows.map((r) => r.key)).toEqual(['m:m'])
  })

  it('merges the fixture sources', async () => {
    const rows = answerOf(await snapshot())
    const kinds = rows.map((r) => r.kind)
    expect(new Set(kinds)).toEqual(new Set(['ask', 'prompt', 'mail']))
    expect(rows.filter((r) => r.kind === 'mail').map((r) => r.key)).toEqual(['m:mail-2', 'm:mail-1'])
    expect(kinds.lastIndexOf('ask')).toBeLessThan(kinds.indexOf('mail'))
  })

  it('has no failed run or MR row (owner 2026-11-16)', async () => {
    const s = await snapshot()
    expect(workOf(s.sections.work)?.some((w) => w.state === 'failed')).toBe(true)
    const rows = answerOf(s)
    expect(rows.map((r) => r.key)).not.toContain('w:run:0ff1ce01')
    expect(rows.some((r) => r.key.startsWith('w:mr:'))).toBe(false)
    expect(rows.some((r) => r.kind === 'prompt' && r.item.state === 'failed')).toBe(false)
  })
})

describe('questions (owner 2026-11-16)', () => {
  const at = '2026-11-09T10:00:00+01:00'
  it('takes a mission question, a waiting run and a waiting session', () => {
    const rows = toAnswer([ask('q', at, { mission: 'inbox-filters' })], [
      work('run:r', 'needs', at, { why: 'asks Bash' }),
      work('session:s', 'needs', at, { kind: 'session', why: 'asks AskUserQuestion' }),
    ], [])
    expect(rows.map((r) => [r.key, r.kind])).toEqual([['q:q', 'ask'], ['w:run:r', 'prompt'], ['w:session:s', 'prompt']])
  })

  it('leaves out MRs asking a review, parked sessions and working items', () => {
    const rows = toAnswer([], [
      work('mr:1', 'needs', at, { kind: 'mr', why: 'review asked' }),
      work('parked:p', 'sleeping', at, { kind: 'parked' }),
      work('session:w', 'working', at, { kind: 'session' }),
    ], [])
    expect(rows).toEqual([])
  })

  it('lists a mission question once, not again as the mission needs item', () => {
    const rows = toAnswer([ask('q', at, { mission: 'm1' })], [work('mission:m1', 'needs', at, { kind: 'mission', mission: 'm1', why: 'choice' })], [])
    expect(rows.map((r) => r.key)).toEqual(['q:q'])
  })

  it('orders a waiting session by wait_s', () => {
    const now = new Date('2026-11-09T12:00:00+01:00')
    const rows = toAnswer([ask('q', '2026-11-09T11:00:00+01:00')], [work('session:s', 'needs', '2026-11-09T08:00:00+01:00', { kind: 'session', wait_s: 600 })], [], now)
    expect(rows.map((r) => r.key)).toEqual(['q:q', 'w:session:s'])
  })

  it('maps the fixture sessions waiting on a prompt', async () => {
    const rows = answerOf(await snapshot())
    expect(rows.filter((r) => r.kind === 'prompt').map((r) => r.key).sort()).toEqual(['w:session:5151', 'w:session:5252', 'w:session:6161'])
    expect(rows.some((r) => r.key.startsWith('w:mr:'))).toBe(false)
    expect(rows.some((r) => r.key.startsWith('w:mission:'))).toBe(false)
  })
})

describe('scope filter on mail', () => {
  it('work keeps the mail, perso drops it', async () => {
    const s = await snapshot()
    const mails = (m: Snapshot) => answerOf(m).filter((r) => r.kind === 'mail').length
    expect(mails(scopeSnapshot(s, 'all'))).toBe(2)
    expect(mails(scopeSnapshot(s, 'work'))).toBe(2)
    expect(mails(scopeSnapshot(s, 'perso'))).toBe(0)
  })
})

describe('inboxBadge (owner 2026-11-16)', () => {
  it('equals the To answer length, mail included', async () => {
    const s = await snapshot()
    const rows = answerOf(s)
    expect(rows.some((r) => r.kind === 'mail')).toBe(true)
    expect(inboxBadge(s)).toEqual({ n: rows.length })
  })

  it('equals the To answer length in every scope', async () => {
    const s = await snapshot()
    for (const sc of ['all', 'work', 'perso'] as const) {
      const v = scopeSnapshot(s, sc)
      expect(inboxBadge(v).n).toBe(answerOf(v).length)
    }
  })

  it('equals the To answer length without the work feed', async () => {
    const s = await snapshot()
    const bare = { ...s, sections: { ...s.sections, work: undefined } } as unknown as Snapshot
    expect(inboxBadge(bare)).toEqual({ n: answerOf(bare).length })
  })
})
