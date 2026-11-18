import { describe, expect, it } from 'vitest'
import type { Agent, FinishedRun, ReadyItem, Resumable } from './live'
import { doneToday, inFilter, okRate, PARKED_MAX, readyRows, shortRef } from './ready'
import type { Mission } from './types'
import type { WorkItem } from './work'

const now = new Date('2026-11-18T16:00:00+01:00')
const item = (ref: string): ReadyItem => ({ project: 'demo', ref, title: ref, path: `/x/${ref}.md`, progress: '', modified: '' })
const parked = (id: string, hoursAgo: number | null): Resumable =>
  ({ conversation_id: id, project: 'demo', account: 'main', last_event: hoursAgo == null ? null : new Date(now.getTime() - hoursAgo * 3600e3).toISOString() }) as Resumable

describe('ready rows', () => {
  it('shortens Logics refs', () => {
    expect(shortRef('item_189_nest_side_by_side_chats')).toBe('item_189')
    expect(shortRef('odd')).toBe('odd')
  })

  it('hides an item a live run already builds', () => {
    const agents = [{ label: 'item_176-s3b', title: 'x' } as Agent]
    const rows = readyRows([item('item_176_chat'), item('item_17_other')], [], agents, now)
    expect(rows.map((r) => r.key)).toEqual(['demo:item_17_other'])
  })

  it('keeps only sessions parked in the last day, newest first, at most three', () => {
    const rows = readyRows([], [parked('a', 30), parked('b', 2), parked('c', 1), parked('d', 5), parked('e', 3), parked('f', null)], [], now)
    expect(rows.map((r) => r.key)).toEqual(['c', 'b', 'e'])
    expect(rows.length).toBe(PARKED_MAX)
  })
})

describe('filters and KPIs', () => {
  const w = (state: WorkItem['state']) => ({ state }) as WorkItem
  it('counts failed items as needs', () => {
    expect(inFilter(w('failed'), 'needs')).toBe(true)
    expect(inFilter(w('queued'), 'running')).toBe(true)
    expect(inFilter(w('needs'), 'running')).toBe(false)
    expect(inFilter(w('done'), 'all')).toBe(true)
  })

  it('counts runs done today', () => {
    const f: FinishedRun[] = [
      { run_id: 'a', status: 'done', ended_at: '2026-11-18T09:00:00+01:00' },
      { run_id: 'b', status: 'failed', ended_at: '2026-11-18T09:00:00+01:00' },
      { run_id: 'c', status: 'done', ended_at: '2026-11-17T09:00:00+01:00' },
    ] as FinishedRun[]
    expect(doneToday(f, now)).toBe(1)
  })

  it('rates mission runs over seven days, null without any', () => {
    const m = (causes: [string, string][]) => [{ runs: causes.map(([cause, ended]) => ({ cause, ended })) }] as unknown as Mission[]
    expect(okRate(m([]), now)).toBeNull()
    expect(okRate(m([['done', '2026-11-17T10:00:00Z'], ['error', '2026-11-16T10:00:00Z'], ['timeout', '2026-11-01T10:00:00Z']]), now)).toBe(50)
  })
})
