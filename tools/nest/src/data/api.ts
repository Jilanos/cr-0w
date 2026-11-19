import { apiButler } from './butler'
import { conversationPath, pageQuery, type ConversationPage } from './conversation'
import type { Actions, LiveReply, Screen } from './live'
import type { Ops, RunReport } from './ops'
import type { DataSource } from './source'
import type { AgendaEvent, InboxItem, Mission, SectionBody, SectionName, TodayEvent } from './types'

// Live adapter over the core read API (item_144). Same origin, no CORS. Records in
// `data` already follow the core contract types, so the mapping is a type cast.

interface Section<T> {
  section: string
  version: string
  updated_at: string | null
  stale?: boolean
  error?: string
  data: T
}

interface MissionDetail {
  mission: Mission
}

export class ApiError extends Error {
  constructor(readonly status: number, message: string) {
    super(message)
  }
}

type Fetch = (input: string, init?: RequestInit) => Promise<Response>

async function failure(res: Response): Promise<ApiError> {
  let msg = res.statusText
  // Guard and lookup errors carry {error}; refused live actions carry their event {message}.
  try {
    const b = (await res.json()) as { error?: string; message?: string }
    msg = b.error ?? b.message ?? msg
  } catch { /* body not JSON */ }
  return new ApiError(res.status, msg)
}

// A cached GET remembers its ETag and last value. A 304 returns the same reference,
// so callers can skip work when nothing changed.
function cached<T>(get: Fetch, url: string, read: (body: Section<unknown>) => T, empty: T) {
  let etag = ''
  let last = empty
  let pending: Promise<T> | null = null
  const load = async (): Promise<T> => {
    const res = await get(url, { headers: etag ? { 'If-None-Match': etag } : {}, cache: 'no-store' })
    if (res.status === 304) return last
    if (!res.ok) throw await failure(res)
    const body = (await res.json()) as Section<unknown>
    etag = res.headers.get('ETag') ?? ''
    last = read(body)
    return last
  }
  // Concurrent readers share one request.
  return (): Promise<T> => (pending ??= load().finally(() => { pending = null }))
}

const records = <T>(get: Fetch, url: string) => cached<T[]>(get, url, (b) => (b.data as T[] | null) ?? [], [])

const EMPTY: SectionBody = { data: null, stale: true, error: 'not loaded yet', updated_at: null }

const scriptSection = (get: Fetch, url: string) =>
  cached<SectionBody>(get, url, (b) => ({ data: b.data, stale: b.stale ?? false, error: b.error, updated_at: b.updated_at }), EMPTY)

// Timed events of crow-today; all-day markers (office, leave) are not slots.
export function agendaOf(today: SectionBody): AgendaEvent[] {
  const events = (today.data as { events?: TodayEvent[] } | null)?.events ?? []
  return events
    .filter((e) => !e.all_day)
    .map((e) => ({ id: `${e.start} ${e.subject}`, title: e.subject, start: e.start, end: e.end }))
}

// Live actions: same-origin POSTs with the CSRF header core requires (adr_001).
export function apiActions(base = '/api', get: Fetch = (i, init) => fetch(i, init)): Actions {
  const post = async <T = LiveReply>(path: string, body?: unknown): Promise<T> => {
    const res = await get(`${base}${path}`, {
      method: 'POST',
      headers: { 'X-Crow': '1', 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: 'no-store',
    })
    if (!res.ok) throw await failure(res)
    return (await res.json()) as T
  }
  const id = encodeURIComponent
  return {
    send: (pid, text) => post(`/sessions/${pid}/send`, { text }),
    interrupt: (pid) => post(`/sessions/${pid}/interrupt`),
    answer: (pid, prompt, option) => post(`/sessions/${pid}/answer`, { prompt, option }),
    ask: (pid, prompt, answers) => post(`/sessions/${pid}/answer`, { prompt, answers }),
    stop: (pid) => post(`/sessions/${pid}/stop`),
    attach: (pid) => post(`/sessions/${pid}/attach`),
    screen: async (pid) => {
      const res = await get(`${base}/sessions/${pid}/screen`, { cache: 'no-store' })
      if (!res.ok) throw await failure(res)
      return (await res.json()) as Screen
    },
    keys: (pid, keys) => post<unknown>(`/sessions/${pid}/keys`, { keys }),
    resize: (pid, cols, rows) => post<unknown>(`/sessions/${pid}/resize`, { cols, rows }),
    resume: (conv, account) => post(`/sessions/${id(conv)}/resume`, account ? { account } : undefined),
    start: (s) => post('/sessions', s),
    dispatch: (r) => post('/dispatch', r),
    stopRun: (run) => post(`/dispatch/${id(run)}/stop`),
    retryRun: (run) => post(`/dispatch/${id(run)}/retry`),
    mail: (mail, verb) => post(`/today/${id(mail)}/${verb}`),
    missionAnswer: (mission, item, verb, text, version) =>
      post<unknown>(`/missions/${id(mission)}/answer`, { item, verb, ...(text.trim() ? { text } : {}), version }),
    missionStop: (mission) => post<unknown>(`/missions/${id(mission)}/stop`),
    missionCancel: (mission, reason) => post<unknown>(`/missions/${id(mission)}/cancel`, reason ? { reason } : undefined),
    // Row ids hold slashes (<mission>/v<N>/<question>): each part is escaped, the slashes stay.
    inboxHide: (item) => post<unknown>(`/inbox/${item.split('/').map(id).join('/')}/hide`),
  }
}

export function apiSource(base = '/api', get: Fetch = (i, init) => fetch(i, init)): DataSource {
  const missions = records<Mission>(get, `${base}/state/missions`)
  // all=1 keeps answered asks, which mission detail lists as history.
  const inbox = records<InboxItem>(get, `${base}/state/inbox?all=1`)
  const sections = new Map<SectionName, () => Promise<SectionBody>>()
  const section = (name: SectionName) => {
    let read = sections.get(name)
    if (!read) sections.set(name, (read = scriptSection(get, `${base}/state/${name}`)))
    return read()
  }
  // The agenda array is rebuilt only when the today body changes.
  let today: SectionBody | null = null
  let agenda: AgendaEvent[] = []
  return {
    missions,
    inbox,
    section,
    async mission(id) {
      const res = await get(`${base}/missions/${encodeURIComponent(id)}`, { cache: 'no-store' })
      if (res.status === 404) return undefined
      if (!res.ok) throw await failure(res)
      return ((await res.json()) as MissionDetail).mission
    },
    async conversation(target, page) {
      const res = await get(`${base}${conversationPath(target)}${pageQuery(page)}`, { cache: 'no-store' })
      if (!res.ok) throw await failure(res)
      return (await res.json()) as ConversationPage
    },
    async ops(query) {
      const res = await get(`${base}/state/ops?${query}`, { cache: 'no-store' })
      if (!res.ok) throw await failure(res)
      return ((await res.json()) as Section<Ops>).data
    },
    async run(id) {
      const res = await get(`${base}/runs/${encodeURIComponent(id)}`, { cache: 'no-store' })
      if (res.status === 404) return undefined
      if (!res.ok) throw await failure(res)
      return (await res.json()) as RunReport
    },
    async agenda() {
      const body = await section('today')
      if (body !== today) [today, agenda] = [body, agendaOf(body)]
      return agenda
    },
    actions: apiActions(base, get),
    now: () => new Date(),
    butler: apiButler(base, get),
    poll: 5000,
  }
}
