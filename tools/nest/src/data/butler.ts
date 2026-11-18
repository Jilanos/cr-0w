// Butler chat (item_176): one conversation with CR-0W, shared by the laptop rail and the
// phone sheet. Core runs the claude process (internal/butler) and serves
// GET /api/butler/<conv>?after=N and POST /api/butler/<conv>/say.

export type ButlerRole = 'you' | 'crow' | 'tool' | 'note'
export type Surface = 'nest' | 'phone'

export interface ButlerChip { label: string; href: string }

export interface ButlerMsg {
  seq: number
  ts: string
  role: ButlerRole
  text: string
  surface?: Surface
  account?: string
  chips?: ButlerChip[]
}

export interface ButlerView {
  conv: string
  messages: ButlerMsg[]
  partial?: string
  busy: boolean
  queued?: number
  running?: boolean
  account?: string
  last: number
}

export interface ButlerApi {
  get(conv: string, after: number): Promise<ButlerView>
  // account: undefined keeps the current one, '' means auto.
  say(conv: string, text: string, surface: Surface, account?: string): Promise<ButlerMsg>
}

// Merge a page of new messages into the list by seq: replays and overlaps are dropped.
export function mergeMsgs(have: ButlerMsg[], add: ButlerMsg[]): ButlerMsg[] {
  if (!add.length) return have
  const seen = new Set(have.map((m) => m.seq))
  const out = [...have]
  for (const m of add) if (!seen.has(m.seq)) { out.push(m); seen.add(m.seq) }
  return out.sort((a, b) => a.seq - b.seq)
}

// Commands the Desk forms handle; everything else is free chat with the butler.
export const isCommand = (t: string) => /^\/(dispatch|session)(\s|$)/.test(t.trim())

type Fetch = (input: string, init?: RequestInit) => Promise<Response>

async function failure(res: Response): Promise<Error> {
  let msg = res.statusText
  try { msg = ((await res.json()) as { error?: string }).error ?? msg } catch { /* not JSON */ }
  return new Error(msg)
}

export function apiButler(base = '/api', get: Fetch = (i, init) => fetch(i, init)): ButlerApi {
  const at = (conv: string) => `${base}/butler/${encodeURIComponent(conv)}`
  return {
    async get(conv, after) {
      const res = await get(`${at(conv)}?after=${after}`, { cache: 'no-store' })
      if (!res.ok) throw await failure(res)
      return (await res.json()) as ButlerView
    },
    async say(conv, text, surface, account) {
      const res = await get(`${at(conv)}/say`, {
        method: 'POST',
        headers: { 'X-Crow': '1', 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, surface, ...(account === undefined ? {} : { account }) }),
        cache: 'no-store',
      })
      if (!res.ok) throw await failure(res)
      return (await res.json()) as ButlerMsg
    },
  }
}

// In-memory butler for fixtures and screenshots: a seeded exchange, and a canned reply
// one tick after each message.
export function fixtureButler(now: Date, seed: ButlerMsg[] = []): ButlerApi {
  const convs = new Map<string, { msgs: ButlerMsg[]; busy: boolean; account?: string }>()
  const conv = (c: string) => {
    let v = convs.get(c)
    if (!v) convs.set(c, (v = { msgs: c === 'main' ? structuredClone(seed) : [], busy: false }))
    return v
  }
  const ts = now.toISOString()
  return {
    async get(c, after) {
      const v = conv(c)
      const last = v.msgs.at(-1)?.seq ?? 0
      return { conv: c, messages: v.msgs.filter((m) => m.seq > after), busy: v.busy, account: v.account, last }
    },
    async say(c, text, surface, account) {
      const v = conv(c)
      if (account !== undefined) v.account = account || undefined
      const m: ButlerMsg = { seq: (v.msgs.at(-1)?.seq ?? 0) + 1, ts, role: 'you', text, surface }
      v.msgs.push(m)
      v.busy = true
      setTimeout(() => {
        v.msgs.push({ seq: m.seq + 1, ts, role: 'crow', text: 'Noted, Sir. Nothing else waits on you.', account: v.account ?? 'auto' })
        v.busy = false
      }, 400)
      return m
    },
  }
}
