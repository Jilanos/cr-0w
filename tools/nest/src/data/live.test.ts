import API from 'virtual:core-api'
import { describe, expect, it } from 'vitest'
import { apiActions, ApiError } from './api'
import { feed } from './feed'
import { fixtureSource } from './fixtures'
import { dispatchOf, mailOf } from './live'

// Response fixtures written by the core API tests (go test ./internal/api -update).
const body = (name: string) => {
  const text = API[name]
  if (text === undefined) throw new Error(`no api fixture ${name}`)
  return text
}
const json = (text: string, status = 200) => new Response(text, { status, headers: { 'Content-Type': 'application/json' } })

function recorder(reply: () => Response = () => json(body('live-send.json'))) {
  const seen: Array<{ url: string; init: RequestInit }> = []
  const get = async (url: string, init: RequestInit = {}) => { seen.push({ url, init }); return reply() }
  return { get, seen }
}

describe('live actions over the core API', () => {
  it('posts each action to its route with the CSRF header', async () => {
    const { get, seen } = recorder()
    const a = apiActions('/api', get)
    await a.send(4242, 'yes, go on')
    await a.interrupt(4242)
    await a.stop(5151)
    await a.resume('c0ffee00-0000-4000-8000-000000000001', 'main')
    await a.start({ project: 'demo', account: 'spare' })
    await a.dispatch({ project: 'demo', label: 'fix', prompt: 'Fix it.' })
    await a.stopRun('a1b2c3d4')
    await a.retryRun('f00dfeed')
    await a.mail('mail-1', 'done')
    await a.attach(5151)
    expect(seen.map((s) => s.url)).toEqual([
      '/api/sessions/4242/send', '/api/sessions/4242/interrupt', '/api/sessions/5151/stop',
      '/api/sessions/c0ffee00-0000-4000-8000-000000000001/resume', '/api/sessions', '/api/dispatch',
      '/api/dispatch/a1b2c3d4/stop', '/api/dispatch/f00dfeed/retry', '/api/today/mail-1/done', '/api/sessions/5151/attach',
    ])
    for (const s of seen) {
      expect(s.init.method).toBe('POST')
      expect(new Headers(s.init.headers).get('X-Crow')).toBe('1')
    }
    expect(JSON.parse(seen[0].init.body as string)).toEqual({ text: 'yes, go on' })
    expect(JSON.parse(seen[3].init.body as string)).toEqual({ account: 'main' })
    expect(seen[1].init.body).toBeUndefined()
  })

  it('answers a permission prompt with its id and option', async () => {
    const { get, seen } = recorder()
    await apiActions('/api', get).answer(5151, 'p-shots', 'allow')
    expect(seen[0].url).toBe('/api/sessions/5151/answer')
    expect(JSON.parse(seen[0].init.body as string)).toEqual({ prompt: 'p-shots', option: 'allow' })
  })

  it('answers an AskUserQuestion with one entry per question', async () => {
    const { get, seen } = recorder()
    await apiActions('/api', get).ask(6161, 'p-ask', [[0], { other: 'Docs', options: [1] }])
    expect(seen[0].url).toBe('/api/sessions/6161/answer')
    expect(JSON.parse(seen[0].init.body as string)).toEqual({ prompt: 'p-ask', answers: [[0], { other: 'Docs', options: [1] }] })
  })

  it('returns the logged action', async () => {
    const r = await apiActions('/api', recorder().get).send(4242, 'x')
    expect(r).toEqual(JSON.parse(body('live-send.json')))
    expect(r.surface).toBe('nest')
  })

  it('rejects with the core message on a refusal', async () => {
    const refused = apiActions('/api', recorder(() => json(body('live-dispatch-refused.json'), 409)).get)
    const e = await refused.dispatch({ project: 'demo', label: 'x', prompt: 'y' }).catch((x) => x)
    expect(e).toBeInstanceOf(ApiError)
    expect(e.status).toBe(409)
    expect(e.message).toBe(JSON.parse(body('live-dispatch-refused.json')).message)
    const unknown = apiActions('/api', recorder(() => json(body('error-send-unknown-pid.json'), 404)).get)
    const u = await unknown.send(9999, 'x').catch((x) => x)
    expect(u.status).toBe(404)
    expect(u.message).toBe(JSON.parse(body('error-send-unknown-pid.json')).error)
  })
})

describe('fixture actions', () => {
  it('stop removes the session from dispatch', async () => {
    const src = fixtureSource()
    const before = dispatchOf(await src.section('dispatch')).agents.length
    await src.actions.stop(4242)
    const after = dispatchOf(await src.section('dispatch')).agents
    expect(after.length).toBe(before - 1)
    expect(after.some((a) => a.pid === 4242)).toBe(false)
  })

  it('refuses unknown targets and empty text', async () => {
    const src = fixtureSource()
    await expect(src.actions.send(9999, 'x')).rejects.toMatchObject({ status: 404 })
    await expect(src.actions.send(4242, '  ')).rejects.toMatchObject({ status: 400 })
    await expect(src.actions.mail('mail-9', 'done')).rejects.toMatchObject({ status: 404 })
  })

  it('refuses a run when the slots are full', async () => {
    const src = fixtureSource()
    await src.actions.dispatch({ project: 'demo', label: 'a', prompt: 'p' })
    await expect(src.actions.dispatch({ project: 'demo', label: 'b', prompt: 'p' })).rejects.toMatchObject({ status: 409 })
  })

  it('answer clears the prompt, refuses a stale one and allow on a work approval', async () => {
    const src = fixtureSource()
    const agent = async (pid: number) => dispatchOf(await src.section('dispatch')).agents.find((a) => a.pid === pid)
    await expect(src.actions.answer(5151, 'old', 'allow')).rejects.toMatchObject({ status: 409 })
    await expect(src.actions.answer(5252, 'p-push', 'allow')).rejects.toMatchObject({ status: 409 })
    expect((await agent(5252))?.prompt?.id).toBe('p-push')
    await src.actions.answer(5151, 'p-shots', 'allow')
    expect((await agent(5151))?.prompt ?? null).toBeNull()
    await expect(src.actions.answer(5151, 'p-shots', 'allow')).rejects.toMatchObject({ status: 409 })
  })

  it('ask clears a question prompt and refuses a stale one or a wrong count', async () => {
    const src = fixtureSource()
    const agent = async (pid: number) => dispatchOf(await src.section('dispatch')).agents.find((a) => a.pid === pid)
    expect((await agent(6161))?.prompt?.questions?.map((q) => q.header)).toEqual(['Layout', 'Links'])
    await expect(src.actions.ask(6161, 'old', [[0], [1]])).rejects.toMatchObject({ status: 409 })
    await expect(src.actions.ask(6161, 'p-ask', [[0]])).rejects.toMatchObject({ status: 400 })
    await src.actions.ask(6161, 'p-ask', [[0], [0, 2]])
    expect((await agent(6161))?.prompt ?? null).toBeNull()
  })

  it('done drops the mail', async () => {
    const src = fixtureSource()
    await src.actions.mail('mail-2', 'done')
    expect(mailOf(await src.section('today')).map((m) => m.id)).toEqual(['mail-1'])
  })
})

describe('feed refetch', () => {
  it('a refresh during a refresh runs once more and sees the action', async () => {
    const src = fixtureSource()
    const seen: number[] = []
    const refresh = feed(src, (s) => seen.push(dispatchOf(s.sections.dispatch).agents.length))
    const first = refresh()
    await src.actions.stop(4242)
    await refresh()
    await first
    expect(seen.at(-1)).toBe(dispatchOf(await src.section('dispatch')).agents.length)
    expect(seen.at(-1)).toBeLessThan(seen[0])
  })
})
