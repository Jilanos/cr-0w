import API from 'virtual:core-api'
import { describe, expect, it } from 'vitest'
import { apiSource } from './api'
import { feed, type Snapshot } from './feed'
import { fixtureSource } from './fixtures'
import { homeCounts } from './home'
import { scopeSnapshot } from './scope'
import { UI_STATES } from './state'
import { deskWork, KIND_LABEL, WORK_KINDS, workCounts, workOf, workWhen, withLinkedStates, type WorkItem } from './work'
import type { Mission } from './types'
import { heroLiveOf, heroModel } from '../hero/model'

const contract = JSON.parse(API['state-work.json']) as { data: WorkItem[] }

const snapshot = async (): Promise<Snapshot> => {
  const box: { s?: Snapshot } = {}
  await feed(fixtureSource(), (x) => { box.s = x })()
  return box.s!
}
const now = new Date('2026-11-09T16:10:00+01:00')
const item = (o: Partial<WorkItem>): WorkItem => ({ id: 'session:1', kind: 'session', project: 'p', title: 't', state: 'working', source: { section: 'dispatch', ref: '1' }, ...o })

describe('work feed (item_204)', () => {
  it('reads GET /api/state/work as the work section', async () => {
    const get = async (url: string) => (url === '/api/state/work'
      ? new Response(API['state-work.json'], { status: 200, headers: { ETag: '"w"' } })
      : new Response('{"error":"no"}', { status: 404 }))
    const body = await apiSource('/api', get).section('work')
    expect(workOf(body)).toEqual(contract.data)
  })

  it('counts match the feed', async () => {
    expect(workCounts(contract.data)).toEqual({ failed: 0, needs: 0, working: 1, sleeping: 0, queued: 1, done: 2 })
    const s = await snapshot()
    const w = workOf(s.sections.work)!
    const c = workCounts(w)
    expect(c).toEqual({ failed: 2, needs: 5, working: 3, sleeping: 2, queued: 1, done: 1 })
    // Header chips, the inbox badge and the hero read the same counts.
    expect(homeCounts(s)).toEqual({ needs: c.needs, working: c.working, failed: c.failed })
    const hero = heroModel(s.missions, s.inbox, heroLiveOf(s.sections), s.now)
    expect(hero.mood).toBe('fail')
    expect(hero.asks).toBe(c.needs)
    expect(hero.line).toBe('Five asks wait on you, Sir. Two items failed.')
  })

  it('maps every kind to a label and every state to a UI state', async () => {
    const w = workOf((await snapshot()).sections.work)!
    expect(new Set(w.map((x) => x.kind))).toEqual(new Set(WORK_KINDS))
    for (const k of WORK_KINDS) expect(KIND_LABEL[k]).toMatch(/^[A-Z]/)
    for (const x of [...w, ...contract.data]) expect(UI_STATES).toContain(x.state)
  })

  it('drops rows of an unknown kind or state, and reads no data as not loaded', () => {
    expect(workOf({ data: [item({}), { ...item({}), kind: 'job' }, { ...item({}), state: 'running' }], stale: false, updated_at: null })).toHaveLength(1)
    expect(workOf({ data: null, stale: true, updated_at: null })).toBeNull()
    expect(workOf(undefined)).toBeNull()
  })

  it('shows an own MR with a red pipeline as failed', async () => {
    const w = workOf((await snapshot()).sections.work)!
    const mr = w.find((x) => x.kind === 'mr' && x.why === 'red pipeline')!
    expect(mr.state).toBe('failed')
    expect(deskWork(w).find((g) => g.item.id === mr.id)).toBeDefined()
  })

  it('hides done items on Desk and rolls a mission up under its goal', async () => {
    const w = workOf((await snapshot()).sections.work)!
    const groups = deskWork(w)
    const ids = groups.flatMap((g) => [g.item, ...g.children]).map((x) => x.state)
    expect(ids).not.toContain('done')
    expect(deskWork(contract.data).map((g) => g.item.id)).toEqual(['session:1', 'mr:url'])
    const goal = groups.find((g) => g.item.id === 'mission:20261109-build-fix-the-flaky-test')!
    expect(goal.children.map((x) => x.id)).toEqual(['mr:https://github.example/cr-0w/pull/12', 'run:a1b2c3d4'])
    // Children show once, under their goal; every other item stands alone in feed order.
    expect(groups.map((g) => g.item.id)).not.toContain('run:a1b2c3d4')
    expect(groups.reduce((n, g) => n + 1 + g.children.length, 0)).toBe(w.length - 1)
  })

  it('keeps an item alone when its mission goal is not shown', () => {
    const g = deskWork([item({ id: 'run:r', kind: 'run', mission: 'gone' }), item({ id: 'mission:m', kind: 'mission', mission: 'm', state: 'done', source: { section: 'missions', ref: 'm' } }), item({ id: 'run:s', kind: 'run', mission: 'm' })])
    expect(g.map((x) => [x.item.id, x.children.length])).toEqual([['run:r', 0], ['run:s', 0]])
  })

  it('says how long a row waits, when a limit resets, else its age', () => {
    expect(workWhen(item({ state: 'needs', wait_s: 600 }), now)).toBe('waits 10m')
    expect(workWhen(item({ state: 'needs', since: '2026-11-09T15:10:00+01:00' }), now)).toBe('waits 1h')
    expect(workWhen(item({ state: 'sleeping', resets_at: '2026-11-09T17:00:00+01:00' }), now)).toBe('resets 17:00')
    expect(workWhen(item({ state: 'failed', since: '2026-11-09T11:10:00+01:00' }), now)).toBe('5h')
    expect(workWhen(item({ since: 'updated' }), now)).toBe('')
  })

  it('filters work items by their project scope; mission items follow their project', async () => {
    const s = await snapshot()
    const pick = (m: 'work' | 'perso') => workOf(scopeSnapshot(s, m).sections.work)!.map((x) => x.project)
    expect(new Set(pick('work'))).toEqual(new Set(['cr-0w', 'lambda', 'infra']))
    expect(new Set(pick('perso'))).toEqual(new Set(['cr-0w', 'website', 'nest', 'demo']))
    // A mission item on a project the registry does not know takes its mission's scope.
    const ghost = item({ id: 'mission:20261109-research-android-push-options', kind: 'mission', project: 'ghost', source: { section: 'missions', ref: '20261109-research-android-push-options' } })
    const scope = s.missions.find((m) => m.id === ghost.source.ref)?.scope
    const x = { ...s, sections: { ...s.sections, work: { ...s.sections.work, data: [ghost] } } }
    expect(workOf(scopeSnapshot(x, scope === 'work' ? 'work' : 'perso').sections.work)).toHaveLength(1)
    expect(workOf(scopeSnapshot(x, scope === 'work' ? 'perso' : 'work').sections.work)).toHaveLength(0)
  })
})

describe('withLinkedStates', () => {
  const m = (id: string, extra: Partial<Mission> = {}) => ({ id, kind: 'build', state: 'running', runs: [], ...extra }) as unknown as Mission
  const w = (ref: string, state: WorkItem['state']) => ({ id: 'mission:' + ref, kind: 'mission', project: 'p', title: ref, state, source: { section: 'missions', ref } }) as WorkItem
  it('takes the feed state of a linked mission and ends one the feed dropped', () => {
    const out = withLinkedStates([m('a'), m('b'), m('c'), m('d', { runs: [{}] as never })], [w('a', 'needs'), w('b', 'working')])
    expect(out.map((x) => x.state)).toEqual(['waiting', 'running', 'done', 'running'])
  })
  it('leaves missions alone without a feed', () => {
    const ms = [m('a')]
    expect(withLinkedStates(ms, null)).toBe(ms)
  })
})
