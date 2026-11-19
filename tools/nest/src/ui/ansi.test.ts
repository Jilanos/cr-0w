import { describe, expect, it } from 'vitest'
import { color256, keyOf, merge, runsOf, sgr } from './ansi'

describe('ANSI screen (item_240)', () => {
  it('splits a line into styled runs and carries the style over', () => {
    const a = runsOf('plain \x1b[1;31mred bold\x1b[22m red\x1b[0m end')
    expect(a.runs.map((r) => r.text)).toEqual(['plain ', 'red bold', ' red', ' end'])
    expect(a.runs[1].style).toEqual({ bold: true, fg: 'var(--ansi-1)' })
    expect(a.runs[2].style).toEqual({ bold: false, dim: false, fg: 'var(--ansi-1)' })
    expect(a.runs[3].style).toEqual({})
    const b = runsOf('\x1b[38;5;174mbox', {})
    const c = runsOf('next', b.end)
    expect(c.runs[0].style.fg).toBe(color256(174))
  })

  it('reads 256 and truecolor, bright, reverse and resets', () => {
    expect(sgr({}, [38, 2, 1, 2, 3]).fg).toBe('rgb(1,2,3)')
    expect(sgr({}, [48, 5, 232]).bg).toBe('rgb(8,8,8)')
    expect(sgr({}, [94]).fg).toBe('var(--ansi-12)')
    expect(sgr({ fg: 'x' }, [39]).fg).toBeUndefined()
    expect(sgr({ bold: true }, []).bold).toBeUndefined()
    expect(sgr({}, [7]).reverse).toBe(true)
    expect(color256(16)).toBe('rgb(0,0,0)')
    expect(color256(231)).toBe('rgb(255,255,255)')
  })

  it('drops non-SGR escapes', () => {
    expect(runsOf('a\x1b[2Kb\x1b(Bc').runs.map((r) => r.text).join('')).toBe('abc')
    expect(runsOf('\x1b]8;id=1;file:///src/x\x1b\\x\x1b]8;;\x1b\\ git').runs.map((r) => r.text).join('')).toBe('x git')
  })

  it('maps keys to tmux names or text, and leaves browser keys alone', () => {
    const k = (key: string, m: Partial<KeyboardEvent> = {}) => keyOf({ key, ctrlKey: false, altKey: false, metaKey: false, shiftKey: false, ...m })
    expect(k('a')).toEqual({ text: 'a' })
    expect(k('Enter')).toEqual({ key: 'Enter' })
    expect(k('Backspace')).toEqual({ key: 'BSpace' })
    expect(k('ArrowUp')).toEqual({ key: 'Up' })
    expect(k('Tab', { shiftKey: true })).toEqual({ key: 'BTab' })
    expect(k('c', { ctrlKey: true })).toEqual({ key: 'C-c' })
    expect(k('v', { ctrlKey: true })).toBeNull()
    expect(k('F5')).toBeNull()
    expect(k('x', { metaKey: true })).toBeNull()
  })

  it('joins neighbouring text keys', () => {
    expect(merge([{ text: 'h' }, { text: 'i' }, { key: 'Enter' }, { text: 'y' }])).toEqual([{ text: 'hi' }, { key: 'Enter' }, { text: 'y' }])
  })
})
