import { describe, expect, it } from 'vitest'
import { rowsOf, submitsOnEnter } from './keys'

const key = (k: string, more: Partial<{ shiftKey: boolean; isComposing: boolean; altKey: boolean }> = {}) =>
  ({ key: k, shiftKey: false, isComposing: false, altKey: false, ...more })

describe('submitsOnEnter', () => {
  it('sends on Enter', () => {
    expect(submitsOnEnter(key('Enter'))).toBe(true)
  })

  it('adds a line on Shift+Enter or Alt+Enter', () => {
    expect(submitsOnEnter(key('Enter', { shiftKey: true }))).toBe(false)
    expect(submitsOnEnter(key('Enter', { altKey: true }))).toBe(false)
  })

  it('leaves an IME composition and other keys alone', () => {
    expect(submitsOnEnter(key('Enter', { isComposing: true }))).toBe(false)
    expect(submitsOnEnter(key('a'))).toBe(false)
  })
})

describe('rowsOf', () => {
  it('grows with the lines up to a cap', () => {
    expect(rowsOf('')).toBe(1)
    expect(rowsOf('a\nb')).toBe(2)
    expect(rowsOf('1\n2\n3\n4\n5\n6\n7\n8')).toBe(6)
  })
})
