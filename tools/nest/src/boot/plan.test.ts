import { describe, expect, it } from 'vitest'
import { BOOT_IDS, BUDGET_MS, OPTIONS, delayOf, optionEnd, pickBoot } from './plan'

const base = { search: '?boot=a', path: '/', reduced: false, seen: false }

describe('pickBoot', () => {
  it('runs only with the dev flag', () => {
    expect(pickBoot({ ...base, search: '' })).toBeNull()
    expect(pickBoot({ ...base, search: '?boot=z' })).toBeNull()
    for (const id of BOOT_IDS) expect(pickBoot({ ...base, search: `?boot=${id}` })).toBe(id)
  })
  it('skips with reduced motion', () => {
    expect(pickBoot({ ...base, reduced: true })).toBeNull()
    expect(pickBoot({ ...base, search: '', real: 'b', reduced: true })).toBeNull()
  })
  it('replays the flag on every load', () => expect(pickBoot({ ...base, seen: true })).toBe('a'))
  it('runs the real boot once per session', () => {
    expect(pickBoot({ ...base, search: '', real: 'b' })).toBe('b')
    expect(pickBoot({ ...base, search: '', real: 'b', seen: true })).toBeNull()
  })
  it('does nothing without a flag or a real boot', () => expect(pickBoot({ ...base, search: '', real: null })).toBeNull())
  it('runs on Home only', () => expect(pickBoot({ ...base, path: '/inbox' })).toBeNull())
})

describe('options', () => {
  it('each finishes under the budget', () => {
    for (const id of BOOT_IDS) expect(optionEnd(OPTIONS[id])).toBeLessThan(BUDGET_MS)
  })
  it('spreads delays over the step span whatever the count', () => {
    const s = { sel: '.pn', fx: 'trace' as const, at: 100, dur: 300, spread: 400 }
    expect(delayOf(s, 0, 1)).toBe(100)
    expect(delayOf(s, 0, 7)).toBe(100)
    expect(delayOf(s, 6, 7)).toBe(500)
  })
})
