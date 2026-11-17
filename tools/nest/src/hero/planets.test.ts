import { describe, expect, it } from 'vitest'
import type { Planet } from './model'
import { A_MIN, castPlanets, frame, shadePlanet, tableOf, type Body, type Cast } from './planets'
import { add, cross, dot, mul, norm, sub, V, type RGB, type V3 } from './vec'

const KINDS: Planet[] = ['bands', 'terrain', 'rock', 'ice']
const COL: RGB = [46, 242, 255]

// Same pinhole camera as the scene: looks at the origin from -z.
function cam(w: number, h: number): Cast {
  const pos = V(0, 0, -6), f = V(0, 0, 1), r = norm(cross(V(0, 1, 0), f)), u = cross(f, r), focal = 260, cx = w / 2, cy = h / 2
  return {
    pos, f, focal,
    proj(p: V3) { const v = sub(p, pos), z = dot(v, f); return { x: cx + (focal * dot(v, r)) / z, y: cy - (focal * dot(v, u)) / z, z } },
    ray(sx: number, sy: number) { return norm(add(f, add(mul(r, (sx - cx) / focal), mul(u, -(sy - cy) / focal)))) },
  }
}
function render(body: Partial<Body>, w = 200, h = 200, cw = 2, ch = 3.5) {
  const cols = Math.ceil(w / cw), rows = Math.ceil(h / ch), out = new Map<number, { ch: string | null; a: number; col: RGB; z: number }>()
  castPlanets(cam(w, h), cols, rows, cw, ch, [{ c: V(0, 0, 0), r: 1, col: COL, planet: 'rock', tilt: 0.2, spin: 0.7, moons: [], ...body }], (c, r, z, g, col, a) => {
    const k = r * cols + c, o = out.get(k)
    if (!o || z < o.z) out.set(k, { ch: g, a, col, z })
  })
  return { out, cols, cw, ch, cam: cam(w, h) }
}
// Cells whose centre ray hits the planet disc.
function discCells(cols: number, rows: number, cw: number, ch: number, c: Cast) {
  const ks: number[] = []
  for (let r = 0; r < rows; r++) for (let k = 0; k < cols; k++) {
    const d = c.ray(k * cw + cw / 2, r * ch + ch / 2), oc = sub(c.pos, V(0, 0, 0)), b = dot(oc, d)
    if (b * b - (dot(oc, oc) - 1) >= 0) ks.push(r * cols + k)
  }
  return ks
}

describe('tableOf', () => {
  it('reads a and b only', () => {
    expect(tableOf('?table=a')).toBe('a')
    expect(tableOf('?x=1&table=b')).toBe('b')
    expect(tableOf('')).toBeUndefined()
    expect(tableOf('?table=c')).toBeUndefined()
  })
})

describe('shadePlanet type dispatch', () => {
  const f = frame(0.2, 0.7), P = { col: COL, toWorld: f.toWorld }
  // Glyph sets each type can draw: the four looks never share a full set.
  const sets = KINDS.map((k) => {
    const seen = new Set<string>()
    for (let i = 0; i < 600; i++) {
      const n = norm(V(Math.sin(i * 1.7), Math.cos(i * 0.93), -Math.abs(Math.sin(i * 0.41)) - 0.2))
      seen.add(shadePlanet(k, P, n, f.toLocal(n), V(0, 0, -1), false)[0])
    }
    return seen
  })
  it('gives each type its own glyphs', () => {
    expect(sets[2].has('O')).toBe(true) // rock craters
    expect([...sets[3]].some((g) => '/'.includes(g)) || sets[3].has('%')).toBe(true) // ice cracks or sheen
    expect(sets[1].has('^') || sets[1].has('~')).toBe(true) // terrain peaks or sea
    expect(sets[0].has('O') || sets[0].has('^') || sets[0].has('/')).toBe(false) // bands: ramp only
  })
  it('outlines the selected planet at the limb', () => {
    const n = norm(V(1, 0, -0.1))
    expect(shadePlanet('bands', { ...P, sel: true }, n, f.toLocal(n), V(0, 0, -1), false)[0]).toBe('@')
  })
  it('frame round-trips', () => {
    const n = norm(V(0.3, -0.5, 0.8)), b = f.toWorld(f.toLocal(n))
    expect(Math.hypot(b.x - n.x, b.y - n.y, b.z - n.z)).toBeLessThan(1e-9)
  })
})

describe('shading floor', () => {
  for (const planet of KINDS) for (const fade of [1, 0.2]) {
    it(`${planet} fade ${fade}: no blank cell inside the disc`, () => {
      const { out, cols, cw, ch, cam: c } = render({ planet, fade, ring: { phase: 0 }, moons: [{ c: V(1.4, 0.3, -0.6), r: 0.2, col: COL }] })
      const disc = discCells(cols, Math.ceil(200 / ch), cw, ch, c)
      expect(disc.length).toBeGreaterThan(200)
      for (const k of disc) {
        const o = out.get(k)
        expect(o, `cell ${k}`).toBeDefined()
        expect(o!.ch && o!.ch.trim()).toBeTruthy()
        expect(o!.a).toBeGreaterThanOrEqual(Math.min(A_MIN, 0.35))
        expect(Math.max(...o!.col)).toBeGreaterThan(20)
      }
    })
  }
  it('dark side stays lit above the floor', () => {
    const f = frame(0, 0), n = norm(V(0.55, -0.75, 0.6)) // facing away from the light
    for (const k of KINDS) expect(shadePlanet(k, { col: COL, toWorld: f.toWorld }, n, f.toLocal(n), V(0, 0, -1), true)[2]).toBeGreaterThan(0.3)
  })
  it('keeps every channel in 0..255 at full glow', () => {
    for (const planet of KINDS) for (const ring of [undefined, { phase: 0 }]) {
      const { out } = render({ planet, col: [255, 46, 99], glow: 1.2, sel: true, ring })
      for (const o of out.values()) for (const v of o.col) { expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThanOrEqual(255) }
    }
  })
})
