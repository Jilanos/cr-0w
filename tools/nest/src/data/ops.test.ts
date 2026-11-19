import { describe, expect, it } from 'vitest'
import { redirect } from '../router'
import { axis, busy, groups, isoWeek, parisHour, runId, shiftDay, stats, type OpsLane } from './ops'

const lane = (id: string, project: string, kind: OpsLane['kind'], state: string, spans: Array<[string, string, string]>, extra: Partial<OpsLane> = {}): OpsLane => ({
  id, day: '2026-11-09', project, account: 'personal', kind, title: id, state, keys: [id], active_s: 3600, wait_s: 0, cost_usd: 1, tokens: 0, commits: 0, runs: 1,
  spans: spans.map(([s, a, b]) => ({ state: s as OpsLane['spans'][0]['state'], start: `2026-11-09T${a}:00+01:00`, end: `2026-11-09T${b}:00+01:00` })), ...extra,
})

describe('ops helpers', () => {
  it('reads Paris hours and ISO weeks', () => {
    expect(parisHour('2026-11-09T15:30:00Z')).toBe(16.5)
    expect(isoWeek('2026-11-09')).toBe('2026-W46')
    expect(isoWeek('2026-01-01')).toBe('2026-W01')
    expect(isoWeek('2026-11-19')).toBe('2026-W47')
    expect(isoWeek('2027-01-03')).toBe('2026-W53')
    expect(shiftDay('2026-11-30', 1)).toBe('2026-12-01')
  })

  it('fits the axis to the spans, today until 20:00 at least', () => {
    const ls = [lane('a', 'p', 'run', 'done', [['working', '09:20', '10:10']])]
    expect(axis(ls, false, 0)).toEqual([9, 11])
    expect(axis(ls, true, 16.2)).toEqual([9, 20])
    expect(axis([], false, 0)).toEqual([8, 20])
  })

  it('groups by project, busiest first, live lanes first', () => {
    const ls = [
      lane('x', 'small', 'run', 'done', [['working', '08:00', '08:10']], { active_s: 600 }),
      lane('old', 'big', 'run', 'done', [['working', '08:00', '09:00']]),
      lane('now', 'big', 'interactive', 'working', [['working', '12:00', '13:00']]),
    ]
    expect(groups(ls).map((g) => [g.project, g.lanes.map((l) => l.id)])).toEqual([['big', ['now', 'old']], ['small', ['x']]])
  })

  it('counts the day and merges busy spans', () => {
    const ls = [
      lane('s', 'p', 'interactive', 'working', [['working', '08:00', '09:00'], ['idle', '09:00', '10:00']]),
      lane('r', 'p', 'run', 'done', [['working', '08:30', '09:30'], ['done', '09:30', '09:40']], { keys: ['r', 'a1b2c3d4e5f60718293a4b5c6d7e8f90'] }),
      lane('f', 'p', 'mission', 'failed', [['failed', '11:00', '11:10']]),
    ]
    expect(stats(ls)).toMatchObject({ lanes: 3, sessions: 1, runs: 2, done: 1, failed: 1, cost: 3 })
    expect(busy(ls)).toEqual([[8, 9 + 40 / 60], [11, 11 + 10 / 60]])
    expect(runId(ls[1])).toBe('a1b2c3d4e5f60718293a4b5c6d7e8f90')
    expect(runId(ls[0])).toBeUndefined()
  })

  it('redirects old Missions links to Ops', () => {
    expect(redirect('/missions')).toBe('/ops')
    expect(redirect('/missions/20261109-x')).toBe('/ops')
    expect(redirect('/ops')).toBeNull()
  })
})
