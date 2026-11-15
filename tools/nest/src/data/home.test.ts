import { describe, expect, it } from 'vitest'
import type { Snapshot } from './feed'
import { ageMin, checksOf, homeCounts, homeModel, usageOf } from './home'
import { SCRIPT_SECTIONS, type SectionBody, type SectionName } from './types'

const NOW = new Date('2026-11-09T16:10:00+01:00')
const body = (data: unknown, extra: Partial<SectionBody> = {}): SectionBody => ({ data, stale: false, updated_at: '2026-11-09T16:10:00+01:00', ...extra })

function snap(sections: Partial<Record<SectionName, SectionBody>>, more: Partial<Snapshot> = {}): Snapshot {
  const all = Object.fromEntries(SCRIPT_SECTIONS.map((n) => [n, sections[n] ?? body(null)])) as Record<SectionName, SectionBody>
  return { missions: [], inbox: [], agenda: [], sections: all, now: NOW, synced: NOW, down: false, ...more }
}

const agent = (pid: number, kind: 'session' | 'run', state: string, account = 'main') => ({
  kind, pid, account, project: 'demo', title: `demo: task ${pid}`, label: kind === 'run' ? `run ${pid}` : null, run_id: null,
  state, started_at: '2026-11-09T16:06:00+01:00',
})

describe('usageOf', () => {
  it('keeps valid rows and clamps percentages', () => {
    const rows = usageOf(body({ limits: [
      { account: 'a', remaining_5h_pct: 120.4, remaining_week_pct: -3 },
      { account: 'b', remaining_5h_pct: 'x', remaining_week_pct: 4 },
      { remaining_5h_pct: 1, remaining_week_pct: 1 },
    ] }))
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ account: 'a', remaining_5h_pct: 100, remaining_week_pct: 0 })
  })
  it('reads nothing from a missing section', () => {
    expect(usageOf(undefined)).toEqual([])
    expect(usageOf(body(null))).toEqual([])
  })
})

describe('checksOf', () => {
  it('drops rows without id or what', () => {
    expect(checksOf(body({ rows: [{ id: 'x', what: 'w' }, { id: '', what: 'w' }, { id: 'y' }, null] }))).toHaveLength(1)
  })
})

describe('ageMin', () => {
  it('prefers the script stamp over the section stamp', () => {
    const b = body({}, { updated_at: '2026-11-09T16:09:00+01:00' })
    expect(ageMin(b, NOW, '2026-11-09T16:04:00+01:00')).toBe(6)
    expect(ageMin(b, NOW)).toBe(1)
  })
  it('is null without a stamp or with a bad one', () => {
    expect(ageMin(body({}, { updated_at: null }), NOW)).toBeNull()
    expect(ageMin(body({}), NOW, 'nope')).toBeNull()
  })
})

describe('homeModel', () => {
  const s = snap({
    accounts: body({ accounts: [{ name: 'work', policy: 'ask-first' }, { name: 'main', policy: 'use' }, { name: 'locked', policy: 'never' }] }),
    usage: body({ generated_at: '2026-11-09T16:04:00+01:00', limits: [
      { account: 'main', remaining_5h_pct: 99, remaining_week_pct: 43 },
      { account: 'locked', remaining_5h_pct: 100, remaining_week_pct: 79 },
      { account: 'work', remaining_5h_pct: 98, remaining_week_pct: 5 },
    ] }, { stale: true }),
    checks: body({ rows: [{ id: 'c1', check: 'review', what: 'Review waits', why: 'open 2 days', action: 'review it', due: null }] }),
    dispatch: body({ slots: { busy: 1, max: 2 }, agents: [agent(1, 'session', 'working'), agent(2, 'session', 'waiting', 'work'), agent(3, 'run', 'working')] }),
    today: body({ tomorrow: [
      { subject: 'All day', start: '2026-11-10T00:00:00+01:00', end: '2026-11-11T00:00:00+01:00', all_day: true },
      { subject: 'Daily', start: '2026-11-10T11:30:00+01:00', end: '2026-11-10T11:45:00+01:00', all_day: false },
    ] }),
  })
  const m = homeModel(s)

  it('shows only allowed accounts, in accounts order', () => {
    expect(m.quota).toEqual([{ account: 'work', h: 98, w: 5 }, { account: 'main', h: 99, w: 43 }])
  })
  it('shows every limit without the accounts section', () => {
    expect(homeModel(snap({ usage: s.sections.usage })).quota.map((q) => q.account)).toEqual(['main', 'locked', 'work'])
  })
  it('lists alerts before waiting sessions', () => {
    expect(m.needs.map((n) => [n.kind, n.action, n.href])).toEqual([
      ['alert', 'Review it', '/desk'],
      ['session', 'Answer', '/desk?pid=2'],
    ])
    expect(m.needs[1]).toMatchObject({ title: 'demo · task 2', sub: 'session waits · 4 min · work' })
  })
  it('puts every agent in Running and counts the working ones', () => {
    expect(m.running.map((r) => [r.kind, r.waiting, r.href])).toEqual([
      ['session', false, '/desk?pid=1&tell=1'],
      ['session', true, '/desk?pid=2&tell=1'],
      ['run', false, '/desk?pid=3'],
    ])
    expect(m.working).toBe(2)
    expect(homeCounts(s)).toEqual({ needs: 2, working: 2, failed: 0 })
  })
  it('carries ages and stale flags', () => {
    expect(m.usage).toEqual({ age: 6, stale: true })
    expect(m.status).toEqual({ age: 0, stale: false })
  })
  it('falls back to tomorrow timed events', () => {
    expect(m.agenda.label).toBe('Tomorrow')
    expect(m.agenda.events.map((e) => e.title)).toEqual(['Daily'])
  })
  it('prefers what is left of today', () => {
    const today = homeModel({ ...s, agenda: [
      { id: 'a', title: 'Past', start: '2026-11-09T09:00:00+01:00', end: '2026-11-09T09:30:00+01:00' },
      { id: 'b', title: 'Next', start: '2026-11-09T17:00:00+01:00', end: '2026-11-09T17:30:00+01:00' },
    ] })
    expect(today.agenda).toMatchObject({ label: 'Today', events: [{ title: 'Next' }] })
  })
})
