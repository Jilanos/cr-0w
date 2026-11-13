// Overlay layout for the holotable (item_158). Every text box over the scene is measured, then
// placed in priority order: each one takes the nearest shift that clears the boxes already
// placed, the obstacles (head, planet and moon discs) and the hero edges. Low-priority boxes
// with no free spot are hidden, and no box is ever drawn over another one. A box goes home
// when free, else keeps its last shift while that still fits, so labels do not jump between
// candidates while the table spins.

export interface Box { x: number; y: number; w: number; h: number }
export interface Item {
  box: Box
  // Placed first when lower. Fixed items do not move; they only block.
  prio: number
  fixed?: boolean
  // May be hidden when no free spot exists.
  hide?: boolean
  // Extra shifts tried right after home (the card: above the planet, docked at the bottom).
  alt?: Array<[number, number]>
  // Ignores this obstacle at home (a planet label sits next to its own planet).
  own?: number
  prev?: [number, number]
  // Max shift in px: a label tied to a small mark (a system member moon) hides past it.
  near?: number
}
export interface Placed { dx: number; dy: number; hidden: boolean }

const GAP = 3

export const overlap = (a: Box, b: Box) =>
  Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) + GAP) *
  Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) + GAP)

// Area outside the bounds, counted like an overlap.
const outside = (a: Box, w: number, h: number) =>
  a.w * a.h - Math.max(0, Math.min(a.x + a.w, w) - Math.max(a.x, 0)) * Math.max(0, Math.min(a.y + a.h, h) - Math.max(a.y, 0))

function shifts(b: Box, alt: Array<[number, number]> = []): Array<[number, number]> {
  const out: Array<[number, number]> = [[0, 0], ...alt]
  const sy = b.h + GAP, sx = Math.min(b.w, 60)
  for (let k = 1; k <= 3; k++) {
    out.push([0, -k * sy], [0, k * sy])
    for (const f of [0.5, 1]) out.push([-f * sx * k, 0], [f * sx * k, 0], [-f * sx * k, -k * sy], [f * sx * k, -k * sy], [-f * sx * k, k * sy], [f * sx * k, k * sy])
  }
  return out
}

export function declutter(items: Item[], obstacles: Box[], w: number, h: number): Placed[] {
  const res: Placed[] = items.map(() => ({ dx: 0, dy: 0, hidden: false }))
  const placed: Box[] = []
  const order = items.map((_, i) => i).sort((a, b) => items[a].prio - items[b].prio)
  for (const i of order) {
    const it = items[i]
    if (it.fixed) { placed.push(it.box); continue }
    // Text over text counts most; scene obstacles and the edges less.
    const text = (dx: number, dy: number) => {
      const b = { ...it.box, x: it.box.x + dx, y: it.box.y + dy }
      let c = 0
      for (const p of placed) c += overlap(b, p)
      return c
    }
    const cost = ([dx, dy]: [number, number]) => {
      const b = { ...it.box, x: it.box.x + dx, y: it.box.y + dy }
      let c = outside(b, w, h) * 8 + text(dx, dy) * 8
      // The own planet is ignored only at home (beside it); a shifted label must not cover it.
      obstacles.forEach((o, k) => { if (k !== it.own || dx !== 0 || dy !== 0) c += overlap(b, o) })
      return c
    }
    let best: [number, number] = [0, 0], bc = Infinity
    // Home first when free, then the last shift (stable while spinning), then the rest.
    const all = shifts(it.box, it.alt).filter(([dx, dy]) => it.near === undefined || Math.hypot(dx, dy) <= it.near), cands = it.prev ? [all[0], it.prev, ...all.slice(1)] : all
    for (const s of cands) {
      const c = cost(s)
      // Prefer the earliest (nearest) candidate; a later one must be strictly better.
      if (c < bc) { bc = c; best = s }
      if (c === 0) break
    }
    // Never text over text, never a clipped label (the card may clip); optional boxes also
    // hide rather than cover the scene.
    const nb = { ...it.box, x: it.box.x + best[0], y: it.box.y + best[1] }
    if ((bc > 0 && it.hide) || text(best[0], best[1]) > 0 || (it.prio > 1 && outside(nb, w, h) > 0)) { res[i] = { dx: 0, dy: 0, hidden: true }; continue }
    res[i] = { dx: best[0], dy: best[1], hidden: false }
    placed.push(nb)
  }
  return res
}

// DOM glue: overlays carry data-prio (and data-fixed, data-hide, data-up, data-own).
export function declutterDom(root: HTMLElement, obstacles: Box[]) {
  const els = [...root.querySelectorAll<HTMLElement>('[data-prio]')]
  for (const e of els) e.style.translate = ''
  const r0 = root.getBoundingClientRect()
  const items: Item[] = els.map((e) => {
    const r = e.getBoundingClientRect()
    const prev = e.dataset.at ? (e.dataset.at.split(',').map(Number) as [number, number]) : undefined
    return {
      box: { x: r.left - r0.left, y: r.top - r0.top, w: r.width, h: r.height },
      prio: Number(e.dataset.prio), fixed: 'fixed' in e.dataset, hide: 'hide' in e.dataset,
      // data-up: the card may flip above its planet, or dock at the hero bottom.
      alt: e.dataset.up ? [[0, -(r.height + Number(e.dataset.up))], [0, r0.bottom - 8 - r.bottom]] : undefined,
      own: e.dataset.own !== undefined ? Number(e.dataset.own) : undefined, prev,
      near: e.dataset.near !== undefined ? Number(e.dataset.near) : undefined,
    }
  })
  const res = declutter(items, obstacles, r0.width, r0.height)
  els.forEach((e, i) => {
    const p = res[i]
    e.style.translate = p.dx || p.dy ? `${p.dx}px ${p.dy}px` : ''
    e.style.visibility = p.hidden ? 'hidden' : ''
    e.dataset.at = `${p.dx},${p.dy}`
  })
}
