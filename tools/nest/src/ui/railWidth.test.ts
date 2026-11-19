import { describe, expect, it } from 'vitest'
import { clampRail, RAIL_W_KEY, readRailWidth, saveRailWidth } from './railWidth'

const memory = () => {
  const m = new Map<string, string>()
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) }
}
const blocked = {
  getItem: (): string | null => { throw new Error('SecurityError') },
  setItem: () => { throw new Error('SecurityError') },
}

describe('rail width clamp (item_256)', () => {
  it('keeps at least 280px', () => {
    expect(clampRail(100, 1440)).toBe(280)
  })

  it('stops at 60% of the window', () => {
    expect(clampRail(900, 1280)).toBe(768)
    expect(clampRail(900, 1200)).toBe(720)
    expect(clampRail(600, 1280)).toBe(600)
  })

  it('never goes under the minimum on a narrow window', () => {
    expect(clampRail(400, 300)).toBe(280)
  })
})

describe('rail width storage (item_256)', () => {
  it('defaults to 320', () => {
    expect(readRailWidth(memory())).toBe(320)
    expect(readRailWidth(undefined)).toBe(320)
  })

  it('reads back the saved width, as after a reload', () => {
    const s = memory()
    saveRailWidth(600, s)
    expect(s.getItem(RAIL_W_KEY)).toBe('600')
    expect(readRailWidth(s)).toBe(600)
  })

  it('ignores a bad saved value', () => {
    const s = memory()
    s.setItem(RAIL_W_KEY, 'wide')
    expect(readRailWidth(s)).toBe(320)
    s.setItem(RAIL_W_KEY, '12')
    expect(readRailWidth(s)).toBe(320)
  })

  it('falls back to 320 on blocked storage without an error', () => {
    expect(readRailWidth(blocked)).toBe(320)
    expect(() => saveRailWidth(500, blocked)).not.toThrow()
  })
})
