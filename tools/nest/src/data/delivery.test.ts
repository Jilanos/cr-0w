import { describe, expect, it } from 'vitest'
import type { Entry } from './conversation'
import { DELIVERY_TIMEOUT, deliveryOf, pendingOf } from './delivery'

const e = (id: string, role: Entry['role'], text: string): Entry => ({ at: '2026-11-16T10:00:00Z', id, role, text })
const T0 = 1_000_000

describe('delivery', () => {
  it('stays sending, then turns delivered when the transcript shows the user turn', () => {
    const before = [e('a', 'user', 'hello'), e('b', 'assistant', 'hi')]
    const p = pendingOf(42, 'ship it', before, T0)
    expect(deliveryOf(p, before, T0 + 1000)).toBe('sending')
    expect(deliveryOf(p, [...before, e('c', 'user', 'ship it')], T0 + 3000)).toBe('delivered')
  })

  it('is not delivered after the timeout when the turn never shows', () => {
    const p = pendingOf(42, 'ship it', [], T0)
    expect(deliveryOf(p, [], T0 + DELIVERY_TIMEOUT - 1)).toBe('sending')
    expect(deliveryOf(p, [e('x', 'assistant', 'ship it')], T0 + DELIVERY_TIMEOUT)).toBe('failed')
  })

  it('still turns delivered when the turn shows after the timeout', () => {
    const p = pendingOf(42, 'ship it', [], T0)
    expect(deliveryOf(p, [e('c', 'user', 'ship it')], T0 + DELIVERY_TIMEOUT * 3)).toBe('delivered')
  })

  it('matches a multi-line message as one user turn', () => {
    const sent = 'first line\r\nsecond line  \n\nthird'
    const p = pendingOf(42, sent, [], T0)
    expect(deliveryOf(p, [e('c', 'user', 'first line\nsecond line\n\nthird')], T0 + 2000)).toBe('delivered')
    // Half the lines as separate turns is no delivery.
    expect(deliveryOf(p, [e('c', 'user', 'first line'), e('d', 'user', 'second line')], T0 + 2000)).toBe('sending')
  })

  it('matches a turn that joins queued messages', () => {
    const p = pendingOf(42, 'and the tests', [], T0)
    expect(deliveryOf(p, [e('c', 'user', 'fix the bug\nand the tests')], T0 + 2000)).toBe('delivered')
  })

  it('ignores a same-text turn that was there before the send', () => {
    const before = [e('a', 'user', 'yes')]
    const p = pendingOf(42, 'yes', before, T0)
    expect(deliveryOf(p, before, T0 + 2000)).toBe('sending')
    expect(deliveryOf(p, [...before, e('b', 'user', 'yes')], T0 + 4000)).toBe('delivered')
  })
})
