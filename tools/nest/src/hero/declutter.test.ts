import { describe, expect, it } from 'vitest'
import { declutter, overlap, type Box, type Item } from './declutter'

const box = (x: number, y: number, w = 40, h = 10): Box => ({ x, y, w, h })
const at = (b: Box, p: { dx: number; dy: number }) => ({ ...b, x: b.x + p.dx, y: b.y + p.dy })

describe('hero declutter', () => {
  it('keeps a free box at home', () => {
    const [p] = declutter([{ box: box(10, 10), prio: 1 }], [], 200, 100)
    expect(p).toEqual({ dx: 0, dy: 0, hidden: false })
  })

  it('moves the lower priority box off the higher one', () => {
    const items: Item[] = [{ box: box(50, 50), prio: 1 }, { box: box(55, 52), prio: 2 }]
    const [a, b] = declutter(items, [], 300, 200)
    expect(a).toEqual({ dx: 0, dy: 0, hidden: false })
    expect(b.hidden).toBe(false)
    expect(overlap(at(items[0].box, a), at(items[1].box, b))).toBe(0)
  })

  it("never draws text over text: a boxed-in item hides", () => {
    const wall: Item = { box: box(0, 0, 100, 100), prio: 0, fixed: true }
    const [, p] = declutter([wall, { box: box(30, 40), prio: 2 }], [], 100, 100)
    expect(p.hidden).toBe(true)
  })

  it('hides optional boxes that would cover an obstacle', () => {
    const [p] = declutter([{ box: box(0, 0, 100, 100), prio: 5, hide: true }], [box(40, 40, 10, 10)], 100, 100)
    expect(p.hidden).toBe(true)
  })

  it('ignores its own obstacle', () => {
    const [p] = declutter([{ box: box(10, 10), prio: 2, own: 0 }], [box(10, 10, 5, 5)], 200, 100)
    expect(p).toEqual({ dx: 0, dy: 0, hidden: false })
  })

  it('keeps the previous shift while it still fits', () => {
    const items: Item[] = [{ box: box(50, 50), prio: 1, fixed: true }, { box: box(55, 50), prio: 2, prev: [0, 13] }]
    const [, p] = declutter(items, [], 300, 200)
    expect([p.dx, p.dy]).toEqual([0, 13])
  })
})

describe('hero declutter edges', () => {
  it('hides a label it cannot fit inside the hero', () => {
    const [p] = declutter([{ box: box(-30, 10, 300, 10), prio: 4 }], [], 200, 100)
    expect(p.hidden).toBe(true)
  })
  it('moves a label back inside when it can', () => {
    const [p] = declutter([{ box: box(-20, 10), prio: 4 }], [], 200, 100)
    expect(p.hidden).toBe(false)
    expect(p.dx).toBeGreaterThanOrEqual(20)
  })
  it('hides a near label rather than moving it far from its mark (item_200)', () => {
    const wall = box(40, 0, 120, 100)
    const [far] = declutter([{ box: box(50, 40), prio: 4, hide: true }], [wall], 400, 100)
    const [near] = declutter([{ box: box(50, 40), prio: 4, hide: true, near: 40 }], [wall], 400, 100)
    expect(far.hidden).toBe(false)
    expect(near.hidden).toBe(true)
  })
})
