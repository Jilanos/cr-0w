import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { feed, type Snapshot } from '../data/feed'
import { fixtureSource } from '../data/fixtures'
import { DataContext } from '../data/useData'
import { Desk } from './Desk'

const snapshot = async (src: ReturnType<typeof fixtureSource>): Promise<Snapshot> => {
  const box: { s?: Snapshot } = {}
  await feed(src, (x) => { box.s = x })()
  return box.s!
}
const at = (w: number, search = '') => {
  vi.stubGlobal('window', {
    matchMedia: (q: string) => ({ matches: Number(/min-width:\s*(\d+)/.exec(q)?.[1] ?? 0) <= w, addEventListener() {}, removeEventListener() {} }),
  })
  vi.stubGlobal('location', { search, pathname: '/desk' })
}
const refresh = async () => {}

afterEach(() => { vi.unstubAllGlobals() })

describe('Nest-started sessions (item_188)', () => {
  it('a start replies with its tmux session, which shows on the new agent row', async () => {
    const src = fixtureSource()
    const r = await src.actions.start({ project: 'demo', prompt: 'look at the build' })
    expect(r.tmux).toMatch(/^crow-demo-/)
    expect(r.message).toContain('no window')
    const s = await snapshot(src)
    const a = (s.sections.dispatch?.data as { agents: Array<{ pid: number; tmux?: string }> }).agents.find((x) => x.tmux === r.tmux)
    expect(a).toBeDefined()
  })

  it('shows Terminal on a headless session only', async () => {
    const src = fixtureSource()
    const r = await src.actions.start({ project: 'demo' })
    const s = await snapshot(src)
    const agents = (s.sections.dispatch?.data as { agents: Array<{ pid: number; tmux?: string; kind: string }> }).agents
    const pid = agents.find((x) => x.tmux === r.tmux)!.pid
    const render = (q: string) => {
      at(1300, q)
      return renderToStaticMarkup(<DataContext.Provider value={src}><Desk snap={s} refresh={refresh} /></DataContext.Provider>)
    }
    expect(render(`?pid=${pid}`)).toContain('>Terminal</button>')
    const other = agents.find((x) => x.kind === 'session' && !x.tmux)!.pid
    expect(render(`?pid=${other}`)).not.toContain('>Terminal</button>')
    expect(render(`?pid=${other}`)).toContain('>Log</button>')
  })
})

describe('Terminal tab and setup sessions (item_240)', () => {
  it('reads, types into and sizes a tmux session; refuses one outside tmux', async () => {
    const src = fixtureSource()
    const r = await src.actions.start({ project: 'demo' })
    const s = await snapshot(src)
    const agents = (s.sections.dispatch?.data as { agents: Array<{ pid: number; tmux?: string; kind: string }> }).agents
    const pid = agents.find((x) => x.tmux === r.tmux)!.pid
    const scr = await src.actions.screen(pid)
    expect(scr.lines.join('\n')).toContain('demo')
    expect(scr.cursor.shown).toBe(true)
    await expect(src.actions.keys(pid, [{ text: 'hi' }, { key: 'Enter' }])).resolves.toBeTruthy()
    await expect(src.actions.resize(pid, 100, 30)).resolves.toBeTruthy()
    const other = agents.find((x) => x.kind === 'session' && !x.tmux)!.pid
    await expect(src.actions.screen(other)).rejects.toMatchObject({ status: 409 })
  })

  it('shows a setup session as waiting on setup, without the attach button', async () => {
    const src = fixtureSource()
    const r = await src.actions.start({ project: 'demo' })
    const s = await snapshot(src)
    const d = s.sections.dispatch!.data as { agents: Array<{ pid: number; tmux?: string; state?: string }> }
    const a = d.agents.find((x) => x.tmux === r.tmux)!
    a.state = 'setup'
    at(1300, `?pid=${a.pid}`)
    const html = renderToStaticMarkup(<DataContext.Provider value={src}><Desk snap={s} refresh={refresh} /></DataContext.Provider>)
    expect(html).toContain('waits on setup')
    expect(html).not.toContain('Attach a terminal')
  })

  it('a resume replies like a start when it runs headless', async () => {
    const src = fixtureSource()
    const s = await snapshot(src)
    const id = (s.sections.sessions?.data as { sessions: Array<{ conversation_id: string }> }).sessions[0].conversation_id
    const r = await src.actions.resume(id)
    expect(r.action).toBe('resume')
  })
})
