import { describe, expect, it } from 'vitest'
import { BUDGET_MS, STEPS, bootEnd, delayOf, pickBoot } from './plan'

const base = { search: '', path: '/', reduced: false, seen: false }

describe('pickBoot', () => {
  it('runs the boot once per session', () => {
    expect(pickBoot(base)).toBe(true)
    expect(pickBoot({ ...base, seen: true })).toBe(false)
  })
  it('skips with reduced motion', () => {
    expect(pickBoot({ ...base, reduced: true })).toBe(false)
    expect(pickBoot({ ...base, search: '?boot=1', reduced: true })).toBe(false)
  })
  it('replays with ?boot=1 or ?boot=a on every load', () => {
    expect(pickBoot({ ...base, search: '?boot=1', seen: true })).toBe(true)
    expect(pickBoot({ ...base, search: '?boot=a', seen: true })).toBe(true)
  })
  it('has no other options', () => {
    for (const f of ['b', 'c', 'z']) expect(pickBoot({ ...base, search: `?boot=${f}`, seen: true })).toBe(false)
  })
  it('can be turned off', () => expect(pickBoot({ ...base, real: false })).toBe(false))
  it('runs on Home only', () => expect(pickBoot({ ...base, path: '/inbox' })).toBe(false))
})

describe('steps', () => {
  it('finish under the budget', () => expect(bootEnd()).toBeLessThan(BUDGET_MS))
  it('spread delays over the step span whatever the count', () => {
    const s = { sel: '.pn', fx: 'trace' as const, at: 100, dur: 300, spread: 400 }
    expect(delayOf(s, 0, 1)).toBe(100)
    expect(delayOf(s, 0, 7)).toBe(100)
    expect(delayOf(s, 6, 7)).toBe(500)
  })
  it('are the trace only', () => expect(STEPS.map((s) => s.fx)).toEqual(['fade', 'trace', 'fill', 'resolve', 'type']))
})

// Prototype B (scan line) and C (unfold) are gone from the boot code and the reel script.
const SOURCES = import.meta.glob(['./*.ts', './*.css', '!./*.test.ts', '../../scripts/boot-reel.mjs'], {
  query: '?raw', import: 'default', eager: true,
}) as Record<string, string>

describe('prototype code', () => {
  it('is reachable from the test', () => expect(Object.keys(SOURCES).length).toBe(4))
  it('has no B or C code left', () => {
    for (const [file, src] of Object.entries(SOURCES)) {
      for (const word of ['boot-line', 'crt', 'unfold', 'emerge', 'BOOT_IDS', 'OPTIONS', "'a' | 'b' | 'c'"]) {
        expect(src.includes(word), `${file} has ${word}`).toBe(false)
      }
    }
  })
})
