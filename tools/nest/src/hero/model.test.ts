import { beforeAll, describe, expect, it } from 'vitest'
import { fixtureSource } from '../data/fixtures'
import { heroLiveOf, heroModel, moodOf, projectOfAgent } from './model'
import type { Agent } from '../data/live'
import type { Mission } from '../data/types'

const zero = { working: 0, needs: 0, failed: 0, sleeping: 0, queued: 0, done: 0 }

describe('hero model', () => {
  it('orders the mood fail > ask > run > idle', () => {
    expect(moodOf(zero)).toBe('idle')
    expect(moodOf({ ...zero, working: 1 })).toBe('run')
    expect(moodOf({ ...zero, working: 1 }, 1)).toBe('ask')
    expect(moodOf({ ...zero, working: 1, failed: 1 }, 1)).toBe('fail')
    expect(moodOf({ ...zero, failed: 1 })).toBe('fail')
    expect(moodOf({ ...zero, needs: 2 })).toBe('idle')
  })

  it('builds one node per project from the fixtures', async () => {
    const src = fixtureSource()
    const missions = await src.missions()
    const m = heroModel(missions, await src.inbox())
    expect(m.projects.length).toBe(new Set(missions.map((x) => x.project)).size)
    expect(m.projects[0].state).toBe('needs')
    expect(m.mood).toBe('fail') // the fixtures hold a failed run
    expect(m.line).toMatch(/Sir\./)
  })

  it('maps the holotable values from the fixtures', async () => {
    const src = fixtureSource()
    const m = heroModel(await src.missions(), await src.inbox(), undefined, src.now())
    const p = Object.fromEntries(m.projects.map((x) => [x.name, x]))
    expect(m.projects[0].name).toBe('demo') // longest wait first
    expect(p.demo.wait).toBe(290)
    expect(p['cr-0w']).toMatchObject({ state: 'failed', cause: 'Push token refresh' }) // failed wins over its ask (item_199)
    expect(p.nest).toMatchObject({ state: 'working', open: 2, runFrom: '2026-11-09T15:05:00+01:00' })
    expect(p.vault).toMatchObject({ state: 'done', open: 0 })
    expect(p.infra).toMatchObject({ state: 'failed', cause: 'Push token rotation' })
  })
})

describe('hero planets from projects and live work (item_199)', () => {
  const now = new Date('2026-11-13T10:00:00+01:00')
  const reg = [
    { name: 'cr-0w', path: '/p/cr-0w' }, { name: 'lambda', path: '/r/lambda' },
    { name: 'vault', path: '/v' }, { name: 'quiet', path: '/p/quiet' },
  ]
  const agent = (o: Partial<Agent>): Agent => ({ kind: 'session', pid: 1, account: 'a', project: 'crow (hub)', cwd: '/p/cr-0w', state: 'working', started_at: '2026-11-13T09:20:00+01:00', ...o })
  const mission = (o: Partial<Mission>): Mission => ({ ...fx, ...o } as Mission)
  let fx: Mission
  beforeAll(async () => { fx = (await fixtureSource().missions())[0] })
  const by = (m: ReturnType<typeof heroModel>) => Object.fromEntries(m.projects.map((p) => [p.name, p]))

  it('shows a live hub session as a working planet with its run time (AC1)', () => {
    const m = heroModel([], [], { registry: reg, agents: [agent({})], parked: [] }, now)
    expect(by(m)['cr-0w']).toMatchObject({ state: 'working', runFrom: '2026-11-13T09:20:00+01:00', open: 1, live: true })
    expect(m.mood).toBe('run')
    expect(m.line).toMatch(/run going/)
  })

  it('matches worktrees and keeps every registered project, quiet ones last (AC3)', () => {
    const m = heroModel([], [], { registry: reg, agents: [agent({ pid: 2, project: 'x', cwd: '/r/lambda.wt/fix' })], parked: [] }, now)
    expect(by(m).lambda.state).toBe('working')
    expect(m.projects.map((p) => p.name)).toEqual(['lambda', 'cr-0w', 'quiet', 'vault'])
    expect(by(m).quiet).toMatchObject({ state: 'sleeping', quiet: true, open: 0 })
  })

  it('groups a system into one planet, members most urgent first, and hides nest:false (item_200)', () => {
    const sreg = [
      { name: 'lambda', path: '/r/lambda', system: 'circle', short: 'lam' }, { name: 'web', path: '/r/web', system: 'circle' },
      { name: 'cr-0w', path: '/p/cr-0w' }, { name: 'fork', path: '/p/fork', nest: false },
    ]
    const m = heroModel([], [], { registry: sreg, agents: [agent({ pid: 2, project: 'x', cwd: '/r/web' })], parked: [] }, now)
    expect(m.projects.map((p) => p.name).sort()).toEqual(['circle', 'cr-0w'])
    const c = by(m).circle
    expect(c).toMatchObject({ state: 'working', live: true })
    expect(c.members!.map((q) => q.name)).toEqual(['web', 'lambda'])
    expect(c.members![1].label).toBe('lam')
    expect(by(m)['cr-0w'].members).toBeUndefined()
  })

  it('lets a failed mission win over a live agent (AC2)', () => {
    const m = heroModel([mission({ id: 'f', project: 'cr-0w', state: 'failed' })], [], { registry: reg, agents: [agent({})], parked: [] }, now)
    expect(by(m)['cr-0w'].state).toBe('failed')
    expect(m.mood).toBe('fail')
  })

  it('shows a session waiting on a prompt as needs, with the wait time (AC3)', () => {
    const m = heroModel([], [], { registry: reg, agents: [agent({ state: 'waiting', last_activity_s: 600 })], parked: [] }, now)
    expect(by(m)['cr-0w']).toMatchObject({ state: 'needs', wait: 10 })
    expect(m.projects[0].name).toBe('cr-0w')
    expect(m.mood).toBe('ask')
    expect(m.line).toMatch(/ask waits on you/)
    expect(m.asks).toBe(1)
  })

  it('shows an inbox ask on a project as needs over a working agent', async () => {
    const inbox = (await fixtureSource().inbox()).filter((r) => r.state === 'open' && r.type !== 'fyi').slice(0, 1).map((r) => ({ ...r, project: 'cr-0w', created: '2026-11-13T09:30:00+01:00' }))
    const m = heroModel([], inbox, { registry: reg, agents: [agent({})], parked: [] }, now)
    expect(by(m)['cr-0w']).toMatchObject({ state: 'needs', wait: 30 })
  })

  it('parks a project whose session waits on a usage limit reset', () => {
    const parked = [{ conversation_id: 'c', account: 'a', cwd: '/v/notes', project: 'vault', limit: 'five_hour', resets_at: '2026-11-13T12:00:00+01:00' }]
    const m = heroModel([], [], { registry: reg, agents: [], parked }, now)
    expect(by(m).vault).toMatchObject({ state: 'sleeping' })
    expect(by(m).vault.quiet).toBeUndefined()
  })

  it('falls back to the largest share when the cwd is outside the registry', () => {
    const a = agent({ cwd: '/elsewhere', projects: [{ name: 'vault', share_pct: 20 }, { name: 'lambda', share_pct: 80 }] })
    expect(projectOfAgent(a, reg, new Set(reg.map((p) => p.name)))).toBe('lambda')
  })

  it('reads the hero inputs from the live fixture sections', async () => {
    const src = fixtureSource()
    const s = Object.fromEntries(await Promise.all((['projects', 'dispatch', 'sessions'] as const).map(async (n) => [n, await src.section(n)])))
    const m = heroModel(await src.missions(), await src.inbox(), heroLiveOf(s), src.now())
    const p = by(m)
    expect(p.lambda.agents[0].state).toBe('needs')
    expect(p['cr-0w'].agents.map((a) => a.kind)).toEqual(['session', 'run'])
  })
})
