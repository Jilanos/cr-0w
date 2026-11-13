import { beforeAll, describe, expect, it } from 'vitest'
import { fixtureSource } from './fixtures'
import { feed, type Snapshot } from './feed'
import { heroLiveOf, heroModel } from '../hero/model'
import { mailOf, type Agent, type RegProject, type Resumable } from './live'
import { scopeOf, scopeSnapshot, type ScopeIn, type ScopeMode } from './scope'
import type { InboxItem, Mission } from './types'

const now = new Date('2026-11-13T10:00:00+01:00')
const reg: RegProject[] = [
  { name: 'lambda', path: '/w/lambda', scope: 'work', system: 'circle' },
  { name: 'web', path: '/w/web', scope: 'work', system: 'circle' },
  { name: 'site', path: '/p/site', scope: 'personal', system: 'circle' },
  { name: 'cr-0w', path: '/p/cr-0w', scope: 'personal' },
  { name: 'bare', path: '/p/bare' },
]
const agent = (o: Partial<Agent>): Agent => ({ kind: 'session', pid: 1, account: 'a', project: 'x', cwd: '/nowhere', state: 'working', started_at: '2026-11-13T09:20:00+01:00', ...o })

let fxM: Mission, fxI: InboxItem
beforeAll(async () => {
  const src = fixtureSource()
  fxM = (await src.missions())[0]
  fxI = (await src.inbox()).find((r) => r.state === 'open' && r.type !== 'fyi')!
})
const mission = (o: Partial<Mission>): Mission => ({ ...fxM, runs: [], state: 'running', ...o } as Mission)
const ask = (o: Partial<InboxItem>): InboxItem => ({ ...fxI, created: '2026-11-13T09:30:00+01:00', ...o })

function data(): ScopeIn {
  return {
    missions: [
      mission({ id: 'mw', project: 'lambda', scope: 'work' }),
      mission({ id: 'mp', project: 'site', scope: 'personal' }),
      mission({ id: 'mc', project: 'cr-0w', scope: 'crow' }),
      // Mission scope wins over the project: a work mission on an unregistered project.
      mission({ id: 'mu', project: 'ghost', scope: 'work' }),
    ],
    inbox: [
      ask({ id: 'iw', mission: 'mw', project: 'lambda' }),
      ask({ id: 'ip', mission: 'mc', project: 'cr-0w' }),
      ask({ id: 'iu', mission: 'mu', project: 'ghost' }),
      // Registered project with no scope: unknown, even though its mission is perso.
      ask({ id: 'ib', mission: 'mc', project: 'bare' }),
      // Unregistered project and no matching mission: unknown.
      ask({ id: 'ix', mission: 'gone', project: 'ghost' }),
    ],
    registry: reg,
    agents: [
      agent({ pid: 1, cwd: '/w/web' }),
      agent({ pid: 2, cwd: '/p/cr-0w.wt/x', state: 'waiting' }),
      agent({ pid: 3, cwd: '/tmp/y', project: 'nowhere' }),
      agent({ pid: 4, cwd: '/p/bare' }),
    ],
    parked: [
      { conversation_id: 'c1', account: 'a', cwd: '/w/lambda', project: 'lambda', limit: 'five_hour', resets_at: '2026-11-13T12:00:00+01:00' },
      { conversation_id: 'c2', account: 'a', cwd: '/q', project: 'site', limit: 'five_hour', resets_at: '2026-11-13T12:00:00+01:00' },
      { conversation_id: 'c3', account: 'a', cwd: '/q', project: 'ghost', limit: 'five_hour', resets_at: '2026-11-13T12:00:00+01:00' },
    ] as Resumable[],
  }
}

const ids = (d: ScopeIn) => ({
  missions: d.missions.map((m) => m.id), inbox: d.inbox.map((r) => r.id), registry: d.registry.map((p) => p.name),
  agents: d.agents.map((a) => a.pid), parked: d.parked.map((r) => r.conversation_id),
})

describe('scope filter (item_206)', () => {
  it('keeps everything under all', () => {
    const d = data()
    expect(scopeOf(d, 'all')).toBe(d)
  })

  it('keeps work missions and the work projects rows, sessions and runs under work', () => {
    expect(ids(scopeOf(data(), 'work'))).toEqual({
      missions: ['mw', 'mu'], inbox: ['iw', 'iu'], registry: ['lambda', 'web'], agents: [1], parked: ['c1'],
    })
  })

  it('gives an ask on an unregistered project its mission scope', () => {
    const d = data()
    d.inbox = [ask({ id: 'iu', mission: 'mu', project: 'ghost' }), ask({ id: 'ic', mission: 'mc', project: 'ghost' })]
    expect(ids(scopeOf(d, 'work')).inbox).toEqual(['iu'])
    expect(ids(scopeOf(d, 'perso')).inbox).toEqual(['ic'])
  })

  it('keeps personal and crow missions and the personal projects under perso', () => {
    expect(ids(scopeOf(data(), 'perso'))).toEqual({
      missions: ['mp', 'mc'], inbox: ['ip'], registry: ['site', 'cr-0w'], agents: [2], parked: ['c2'],
    })
  })

  it('shows unknown projects under all only (no registry entry, or no scope)', () => {
    for (const mode of ['work', 'perso'] as const) {
      const d = ids(scopeOf(data(), mode))
      expect(d.inbox).not.toContain('ib')
      expect(d.inbox).not.toContain('ix')
      expect(d.agents).not.toContain(3)
      expect(d.agents).not.toContain(4)
      expect(d.parked).not.toContain('c3')
      expect(d.registry).not.toContain('bare')
    }
  })
})

describe('hero model under each scope (item_206)', () => {
  const hero = (mode: ScopeMode) => {
    const d = scopeOf(data(), mode)
    return heroModel(d.missions, d.inbox, { registry: d.registry, agents: d.agents, parked: d.parked }, now)
  }
  const by = (m: ReturnType<typeof heroModel>) => Object.fromEntries(m.projects.map((p) => [p.name, p]))

  it('shows a mixed system under both modes with the matching members as moons', () => {
    expect(by(hero('all')).circle.members!.map((p) => p.name).sort()).toEqual(['lambda', 'site', 'web'])
    expect(by(hero('work')).circle.members!.map((p) => p.name).sort()).toEqual(['lambda', 'web'])
    expect(by(hero('perso')).circle.members!.map((p) => p.name)).toEqual(['site'])
  })

  it('keeps planets to the mode', () => {
    expect(hero('all').projects.map((p) => p.name).sort()).toEqual(['bare', 'circle', 'cr-0w', 'ghost', 'nowhere'])
    expect(hero('work').projects.map((p) => p.name).sort()).toEqual(['circle', 'ghost'])
    expect(hero('perso').projects.map((p) => p.name).sort()).toEqual(['circle', 'cr-0w'])
  })

  it('counts asks and runs from what is shown', () => {
    // all: 5 inbox asks + 1 waiting session; work: 2 asks; perso: 1 ask + 1 waiting session.
    expect(hero('all')).toMatchObject({ asks: 6, mood: 'ask', line: 'Six asks wait on you, Sir.' })
    expect(hero('work')).toMatchObject({ asks: 2, mood: 'ask', line: 'Two asks wait on you, Sir.' })
    expect(hero('perso')).toMatchObject({ asks: 2, mood: 'ask', line: 'Two asks wait on you, Sir.' })
  })

  it('follows the mood of the shown work only', () => {
    const d = data()
    d.inbox = []
    d.agents = [agent({ pid: 1, cwd: '/w/web' })]
    d.missions = [mission({ id: 'f', project: 'cr-0w', scope: 'crow', state: 'failed' }), mission({ id: 'mw', project: 'lambda', scope: 'work' })]
    const run = (mode: ScopeMode) => {
      const s = scopeOf(d, mode)
      return heroModel(s.missions, s.inbox, { registry: s.registry, agents: s.agents, parked: [] }, now)
    }
    expect(run('all').mood).toBe('fail')
    expect(run('work')).toMatchObject({ mood: 'run', line: 'Two runs going, Sir.' })
    expect(run('perso').mood).toBe('fail')
  })
})

describe('scoped snapshot', () => {
  const snapshot = async (): Promise<Snapshot> => {
    const box: { s?: Snapshot } = {}
    await feed(fixtureSource(), (x) => { box.s = x })()
    return box.s!
  }

  it('returns the same snapshot under all', async () => {
    const s = await snapshot()
    expect(scopeSnapshot(s, 'all')).toBe(s)
  })

  it('filters missions, inbox and the per project sections, keeps the others', async () => {
    const s = await snapshot()
    const w = scopeSnapshot(s, 'work')
    expect(w.missions.length).toBeGreaterThan(0)
    expect(w.missions.every((m) => m.scope === 'work')).toBe(true)
    expect(w.sections.accounts).toBe(s.sections.accounts)
    // The fixture registry has no scope: every project, row and agent is unknown.
    expect(w.inbox).toEqual([])
    const live = heroLiveOf(w.sections)
    expect(live).toMatchObject({ registry: [], agents: [], parked: [] })
    expect(heroLiveOf(s.sections).agents.length).toBeGreaterThan(0)
  })

  it('shows Today mail as work mail: under work tagged, under perso none, under all both', async () => {
    const s = await snapshot()
    expect(mailOf(s.sections.today).map((m) => m.id)).toEqual(['mail-2', 'mail-1'])
    expect(mailOf(scopeSnapshot(s, 'work').sections.today)).toEqual([
      { id: 'mail-2', subject: 'Invoice to check', from: 'Accounting', scope: 'work' },
      { id: 'mail-1', subject: 'Contract renewal', from: 'Legal', scope: 'work' },
    ])
    const p = scopeSnapshot(s, 'perso').sections.today
    expect(mailOf(p)).toEqual([])
    // The calendar part stays whole.
    expect((p.data as { tomorrow: unknown[] }).tomorrow).toEqual((s.sections.today.data as { tomorrow: unknown[] }).tomorrow)
  })

  it('keeps a mail row its own tag, so a personal source shows under perso', async () => {
    const s = await snapshot()
    const t = s.sections.today.data as Record<string, unknown>
    const mixed = { ...s, sections: { ...s.sections, today: { ...s.sections.today, data: { ...t, important: [{ id: 'p1', subject: 'Bank', scope: 'perso' }] } } } }
    expect(mailOf(scopeSnapshot(mixed, 'perso').sections.today).map((m) => m.id)).toEqual(['p1'])
    expect(mailOf(scopeSnapshot(mixed, 'work').sections.today).map((m) => m.id)).toEqual(['mail-2'])
  })

  it('leaves a section with no data alone', async () => {
    const s = await snapshot()
    const empty = { ...s, sections: { ...s.sections, dispatch: { data: null, stale: true, updated_at: null } } }
    expect(scopeSnapshot(empty, 'perso').sections.dispatch).toBe(empty.sections.dispatch)
  })
})
