import API from 'virtual:core-api'
import { describe, expect, it } from 'vitest'
import { agendaOf, apiSource, ApiError } from './api'
import { SCRIPT_SECTIONS } from './types'
import { feed, type Snapshot } from './feed'

// Response fixtures written by the core API tests (go test ./internal/api -update).
const body = (name: string) => {
  const text = API[name]
  if (text === undefined) throw new Error(`no api fixture ${name}`)
  return text
}

const json = (text: string, status = 200, etag = '"v1"') =>
  new Response(text, { status, headers: { 'Content-Type': 'application/json', ETag: etag } })

// A fake core: routes by path, answers 304 on a matching ETag like reply() in
// api.go, records each request's If-None-Match.
function core(routes: Record<string, () => Response>) {
  const seen: Array<{ url: string; match: string | null }> = []
  const get = async (url: string, init?: RequestInit) => {
    seen.push({ url, match: new Headers(init?.headers).get('If-None-Match') })
    const route = routes[url]
    if (!route) return json(body('error-no-section.json'), 404)
    const res = route()
    const match = new Headers(init?.headers).get('If-None-Match')
    if (res.ok && match && match === res.headers.get('ETag')) return new Response(null, { status: 304 })
    return res
  }
  return { get, seen }
}

describe('api adapter', () => {
  it('maps section bodies to contract records', async () => {
    const { get } = core({
      '/api/state/missions': () => json(body('state-missions.json')),
      '/api/state/inbox?all=1': () => json(body('state-inbox-all.json')),
    })
    const src = apiSource('/api', get)
    const missions = await src.missions()
    expect(missions.map((m) => m.id)).toEqual(JSON.parse(body('state-missions.json')).data.map((m: { id: string }) => m.id))
    expect(missions[0].runs.length).toBeGreaterThan(0)
    const inbox = await src.inbox()
    expect(inbox.some((r) => r.state === 'answered')).toBe(true)
    expect(src.poll).toBe(5000)
  })

  it('reads every script section with its stale flag', async () => {
    const routes = Object.fromEntries(SCRIPT_SECTIONS.map((n) => [`/api/state/${n}`, () => json(body(`state-${n}.json`))]))
    const src = apiSource('/api', core(routes).get)
    for (const n of SCRIPT_SECTIONS) {
      const sec = await src.section(n)
      expect(sec.data, n).toEqual(JSON.parse(body(`state-${n}.json`)).data)
      expect(sec.stale, n).toBe(false)
    }
  })

  it('passes a stale section through with its error and last data', async () => {
    const stale = { section: 'mrs', version: 'x', updated_at: '2026-11-10T09:00:00Z', stale: true, error: 'crow-mrs: timed out', data: [{ iid: 1 }] }
    const src = apiSource('/api', core({ '/api/state/mrs': () => json(JSON.stringify(stale)) }).get)
    expect(await src.section('mrs')).toEqual({ data: [{ iid: 1 }], stale: true, error: 'crow-mrs: timed out', updated_at: '2026-11-10T09:00:00Z' })
  })

  it('maps today events to the agenda and shares one request', async () => {
    const today = {
      section: 'today', version: 'v', updated_at: '2026-11-10T09:00:00Z',
      data: { events: [
        { start: '2026-11-10T00:00', end: '2026-11-11T00:00', subject: 'Office', all_day: true },
        { start: '2026-11-10T11:30', end: '2026-11-10T12:00', subject: 'Daily', all_day: false },
      ] },
    }
    const { get, seen } = core({ '/api/state/today': () => json(JSON.stringify(today)) })
    const src = apiSource('/api', get)
    const [agenda, sec] = await Promise.all([src.agenda(), src.section('today')])
    expect(agenda).toEqual([{ id: '2026-11-10T11:30 Daily', title: 'Daily', start: '2026-11-10T11:30', end: '2026-11-10T12:00' }])
    expect(sec.data).toEqual(today.data)
    expect(seen.length).toBe(1)
    expect(await src.agenda()).toBe(agenda)
    expect(agendaOf({ data: null, stale: true, updated_at: null })).toEqual([])
  })

  it('sends the ETag back and keeps the body on 304', async () => {
    let n = 0
    const { get, seen } = core({
      '/api/state/missions': () => (n++ === 0 ? json(body('state-missions.json'), 200, '"abc"') : new Response(null, { status: 304 })),
    })
    const src = apiSource('/api', get)
    const first = await src.missions()
    const second = await src.missions()
    expect(seen.map((s) => s.match)).toEqual([null, '"abc"'])
    expect(second).toBe(first)
  })

  it('reads one mission and treats 404 as missing', async () => {
    const { get } = core({
      '/api/missions/20261109-build-item-095': () => json(body('mission.json')),
      '/api/missions/nope': () => json(body('error-no-mission.json'), 404),
    })
    const src = apiSource('/api', get)
    expect((await src.mission('20261109-build-item-095'))?.state).toBe('done')
    expect(await src.mission('nope')).toBeUndefined()
  })

  it('throws the core error message', async () => {
    const { get } = core({ '/api/state/missions': () => json(body('error-no-identity.json'), 403) })
    const err = await apiSource('/api', get).missions().catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect((err as ApiError).status).toBe(403)
    expect((err as ApiError).message).toBe(JSON.parse(body('error-no-identity.json')).error)
  })
})

describe('feed', () => {
  function rig() {
    let up = true
    const broken = new Set<string>()
    let t = new Date('2026-11-10T10:00:00Z').getTime()
    const { get } = core({
      '/api/state/missions': () => (up ? json(body('state-missions.json')) : json('{"error":"down"}', 502)),
      '/api/state/inbox?all=1': () => (up ? json(body('state-inbox-all.json')) : json('{"error":"down"}', 502)),
      ...Object.fromEntries(SCRIPT_SECTIONS.map((n) => [`/api/state/${n}`, () => (!up ? json('{"error":"down"}', 502) : broken.has(n) ? json('{"error":"not found"}', 404) : json(body(`state-${n}.json`)))])),
    })
    const src = { ...apiSource('/api', get), now: () => new Date(t) }
    const out: Snapshot[] = []
    const refresh = feed(src, (s) => out.push(s))
    return { refresh, out, broken, down: (v: boolean) => { up = !v }, tick: (ms: number) => { t += ms } }
  }

  it('emits only when something changed', async () => {
    const r = rig()
    await r.refresh()
    r.tick(5000)
    await r.refresh()
    expect(r.out.length).toBe(1)
    expect(r.out[0].down).toBe(false)
    expect(r.out[0].sections.today.data).toEqual(JSON.parse(body('state-today.json')).data)
    expect(r.out[0].agenda).toEqual(agendaOf(r.out[0].sections.today))
    r.tick(60000)
    await r.refresh()
    expect(r.out.length).toBe(2)
  })

  it('keeps the last data when the core is down, then recovers', async () => {
    const r = rig()
    await r.refresh()
    const synced = r.out[0].synced
    r.down(true)
    r.tick(5000)
    await r.refresh()
    const last = r.out.at(-1)!
    expect(last.down).toBe(true)
    expect(last.missions).toBe(r.out[0].missions)
    expect(last.synced).toEqual(synced)
    r.down(false)
    r.tick(5000)
    await r.refresh()
    expect(r.out.at(-1)!.down).toBe(false)
  })

  it('shows one missing section empty and keeps the rest up', async () => {
    const r = rig()
    r.broken.add('ready')
    await r.refresh()
    const s = r.out[0]
    expect(s.down).toBe(false)
    expect(s.missions.length).toBeGreaterThan(0)
    expect(s.sections.ready).toMatchObject({ data: null, stale: true })
    expect(s.sections.ready.error).toBeTruthy()
    expect(s.sections.today.data).toEqual(JSON.parse(body('state-today.json')).data)
    r.tick(5000)
    await r.refresh()
    expect(r.out.length).toBe(1)
  })

  it('shows an empty state, never fixtures, when the first load fails', async () => {
    const r = rig()
    r.down(true)
    await r.refresh()
    expect(r.out[0]).toMatchObject({ missions: [], inbox: [], agenda: [], down: true, synced: null })
    expect(r.out[0].sections.usage.stale).toBe(true)
  })
})
