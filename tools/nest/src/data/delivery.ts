import type { Entry } from './conversation'

// Delivery of a message typed into a session from Nest (item_208): "sending" until the
// text shows as a user turn in the session transcript, "delivered" then, "not delivered"
// when it has not shown after DELIVERY_TIMEOUT.
export const DELIVERY_TIMEOUT = 20_000

export type Delivery = 'sending' | 'delivered' | 'failed'

export interface Pending {
  pid: number
  text: string
  // Wall clock of the send, in ms.
  at: number
  // User turns that already matched the text before the send.
  seen: string[]
}

// Whitespace runs read as one space: line breaks, CRLF and trailing blanks never break a match.
const flat = (s: string) => s.replace(/\s+/g, ' ').trim()

// A user turn carries the message when it holds the whole text. A turn can hold more:
// Claude Code joins messages queued during a turn into one.
export function carries(e: Entry, text: string): boolean {
  const t = flat(text)
  return e.role === 'user' && !!t && flat(e.text).includes(t)
}

export function pendingOf(pid: number, text: string, before: Entry[], now: number): Pending {
  return { pid, text, at: now, seen: before.filter((e) => carries(e, text)).map((e) => e.id) }
}

// The user turn that carries the send, once the transcript shows it.
export const landedOf = (p: Pending, entries: Entry[]): Entry | undefined =>
  entries.find((e) => carries(e, p.text) && !p.seen.includes(e.id))

export function deliveryOf(p: Pending, entries: Entry[], now: number): Delivery {
  if (landedOf(p, entries)) return 'delivered'
  return now - p.at >= DELIVERY_TIMEOUT ? 'failed' : 'sending'
}

export const DELIVERY_LABEL: Record<Delivery, string> = { sending: 'sending…', delivered: 'delivered', failed: 'not delivered' }
