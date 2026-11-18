import { describe, expect, it } from 'vitest'
import { stickBottom } from './stickBottom'

// A scroll box whose content and viewport heights the test sets; scrollTop clamps like a browser.
function box(content: number, view: number) {
  const fns: Array<() => void> = []
  let top = 0
  const el = {
    content, view,
    get scrollHeight() { return el.content },
    get clientHeight() { return el.view },
    get scrollTop() { return top },
    set scrollTop(v: number) { top = Math.max(0, Math.min(v, el.content - el.view)) },
    addEventListener: (_: 'scroll', f: () => void) => { fns.push(f) },
    removeEventListener: (_: 'scroll', f: () => void) => { fns.splice(fns.indexOf(f), 1) },
    scroll(v: number) { el.scrollTop = v; fns.forEach((f) => f()) },
  }
  return el
}
const gap = (el: ReturnType<typeof box>) => el.scrollHeight - el.clientHeight - el.scrollTop

function observer() {
  const cbs: Array<() => void> = []
  class RO { constructor(cb: () => void) { cbs.push(cb) } observe() {} disconnect() { cbs.length = 0 } }
  return { RO, resize: () => cbs.forEach((f) => f()) }
}

describe('butler chat log stays on its last message (item_176)', () => {
  it('opens at the bottom and stays there when the rail head lays out and shrinks the log', () => {
    const el = box(2000, 700)
    const o = observer()
    stickBottom(el, o.RO)
    expect(gap(el)).toBe(0)
    el.view = 452 // the head took 248px after the first render
    expect(gap(el)).toBe(248)
    o.resize()
    expect(gap(el)).toBe(0)
  })

  it('follows new messages while at the bottom', () => {
    const el = box(2000, 700)
    const s = stickBottom(el, observer().RO)
    el.content = 2300
    s.follow()
    expect(gap(el)).toBe(0)
  })

  it('leaves the owner where they scrolled up to', () => {
    const el = box(2000, 700)
    const o = observer()
    const s = stickBottom(el, o.RO)
    el.scroll(400)
    el.content = 2300
    s.follow()
    o.resize()
    expect(el.scrollTop).toBe(400)
    el.scroll(1600)
    s.follow()
    expect(gap(el)).toBe(0)
  })

  it('stop detaches the observer and the scroll listener', () => {
    const el = box(2000, 700)
    const o = observer()
    stickBottom(el, o.RO).stop()
    el.view = 452
    o.resize()
    expect(gap(el)).toBe(248)
  })
})
