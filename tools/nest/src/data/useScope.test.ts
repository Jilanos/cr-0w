import { describe, expect, it } from 'vitest'
import { readScope, saveScope, SCOPE_KEY } from './useScope'

const memory = () => {
  const m = new Map<string, string>()
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) }
}
const blocked = {
  getItem: (): string | null => { throw new Error('SecurityError') },
  setItem: () => { throw new Error('SecurityError') },
}

describe('scope storage (item_206)', () => {
  it('defaults to all', () => {
    expect(readScope(memory())).toBe('all')
    expect(readScope(undefined)).toBe('all')
  })

  it('reads back the saved mode, as after a reload', () => {
    const s = memory()
    saveScope('perso', s)
    expect(s.getItem(SCOPE_KEY)).toBe('perso')
    expect(readScope(s)).toBe('perso')
  })

  it('ignores an unknown saved value', () => {
    const s = memory()
    s.setItem(SCOPE_KEY, 'home')
    expect(readScope(s)).toBe('all')
  })

  it('falls back to all on blocked storage without an error', () => {
    expect(readScope(blocked)).toBe('all')
    expect(() => saveScope('work', blocked)).not.toThrow()
  })
})
