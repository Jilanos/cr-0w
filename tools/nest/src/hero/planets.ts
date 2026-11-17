import type { Planet } from './model'
import { add, clamp, cross, dot, LIGHT, mix, mul, norm, sub, V, type RGB, type V3 } from './vec'

// Lit planets (item_216), ported from the locked renderer (item_212 planet-types-8): per-cell
// ray-cast spheres shaded by type (banded giant, terrain, cratered rock, ice), wrap light with an
// ambient floor, a faint rim and a small highlight. Nothing goes black. A ring marks a live run,
// moons are sessions, an outline marks the selected planet.

const RAMP = '.,-~:;=!*#$@'
const DARK: RGB = [20, 20, 50]
const WHITE: RGB = [255, 255, 255]
// Lowest alpha a planet cell keeps after depth and hover dimming: a planet never blanks out.
export const A_MIN = 0.3

// Value noise on 3D points (planet surface detail).
const hash0 = (x: number, y: number, z: number) => { const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return s - Math.floor(s) }
// The reference sin hash, cached on the integer lattice the shading reaches (-32..31 per axis):
// same values, about four times faster on the hot path.
const HB = 32, HN = 64, HT = new Float64Array(HN * HN * HN).fill(-1)
function hash(x: number, y: number, z: number) {
  const i = x + HB, j = y + HB, k = z + HB
  if (i < 0 || j < 0 || k < 0 || i >= HN || j >= HN || k >= HN) return hash0(x, y, z)
  const n = (i * HN + j) * HN + k
  let v = HT[n]
  if (v < 0) v = HT[n] = hash0(x, y, z)
  return v
}
function vnoise(x: number, y: number, z: number) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z)
  const fx = x - ix, fy = y - iy, fz = z - iz
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy), uz = fz * fz * (3 - 2 * fz)
  // Trilinear blend of the eight corner hashes, unrolled (hot path: several calls per planet cell).
  const h000 = hash(ix, iy, iz), h100 = hash(ix + 1, iy, iz), h010 = hash(ix, iy + 1, iz), h110 = hash(ix + 1, iy + 1, iz)
  const h001 = hash(ix, iy, iz + 1), h101 = hash(ix + 1, iy, iz + 1), h011 = hash(ix, iy + 1, iz + 1), h111 = hash(ix + 1, iy + 1, iz + 1)
  const a0 = h000 + (h100 - h000) * ux, a1 = h010 + (h110 - h010) * ux, b0 = h001 + (h101 - h001) * ux, b1 = h011 + (h111 - h011) * ux
  const a = a0 + (a1 - a0) * uy, b = b0 + (b1 - b0) * uy
  return a + (b - a) * uz
}
export const fbm = (p: V3) => vnoise(p.x * 2.1, p.y * 2.1, p.z * 2.1) * 0.55 + vnoise(p.x * 4.3, p.y * 4.3, p.z * 4.3) * 0.3 + vnoise(p.x * 8.7, p.y * 8.7, p.z * 8.7) * 0.15
const vmul = (a: V3, b: V3) => V(a.x * b.x, a.y * b.y, a.z * b.z)
const reflect = (d: V3, n: V3) => sub(d, mul(n, 2 * dot(d, n)))

// Planet frame: axis tilt and spin. toLocal turns a world normal into the planet's own frame
// (y = spin axis), so surface features turn with the spin; toWorld is its inverse.
export function frame(tilt: number, spin: number) {
  const ax = norm(V(Math.sin(tilt), Math.cos(tilt), 0.15)), e1 = norm(cross(ax, V(0, 0, 1))), e2 = cross(ax, e1)
  const c = Math.cos(spin), s = Math.sin(spin)
  return {
    toLocal: (n: V3) => { const y = dot(n, ax), x0 = dot(n, e1), z0 = dot(n, e2); return V(x0 * c - z0 * s, y, x0 * s + z0 * c) },
    toWorld: (l: V3) => { const x0 = l.x * c + l.z * s, z0 = -l.x * s + l.z * c; return add(add(mul(e1, x0), mul(ax, l.y)), mul(e2, z0)) },
  }
}

// Five big craters fixed on the surface, spaced round the spin axis: two or three face the viewer.
const RCRAT: Array<[V3, number]> = ([[0, -0.3, 0.5], [1.26, 0.36, 0.42], [2.51, -0.1, 0.46], [3.77, 0.4, 0.4], [5.03, -0.34, 0.44]] as const)
  .map(([lo, la, k]) => [V(Math.cos(la) * Math.cos(lo), Math.sin(la), Math.cos(la) * Math.sin(lo)), k])

export type Shade = [string, RGB, number]
export interface ShadeIn { col: RGB; sel?: boolean; quiet?: boolean; glow?: number; toWorld: (l: V3) => V3 }

// One planet cell: n = world normal, ln = planet-frame normal, view = toward the eye.
// glow (ping, pulse, hover) adds light on top of the wrap light.
export function shadePlanet(kind: Planet, P: ShadeIn, n: V3, ln: V3, view: V3, shadowed: boolean): Shade {
  const facing = dot(n, view), col = P.glow ? mix(P.col, WHITE, P.glow * 0.3) : P.col, nl = dot(n, LIGHT)
  const rim = clamp(1 - facing, 0, 1) ** 4 * 0.16
  const spec = shadowed ? 0 : Math.max(0, dot(reflect(mul(LIGHT, -1), n), view)) ** 18 * 0.35
  const lam = (clamp((nl + 0.4) / 1.4, 0, 1) ** 1.8 * (shadowed ? 0.4 : 1)) * 0.88 + 0.07 + spec + rim * (1 - Math.max(0, nl)) + (P.glow ?? 0) * 0.35
  if (P.sel && facing < 0.3) return ['@', mix(col, WHITE, 0.5), 1]
  const lit = (L: number, c: RGB, ramp = RAMP): Shade => [ramp[clamp(Math.floor(L * ramp.length), 0, ramp.length - 1)], mix(mix(c, DARK, 0.45), c, L), 0.5 + 0.5 * L]
  if (kind === 'bands') {
    const lat = ln.y, lon = Math.atan2(ln.z, ln.x), w = Math.sin(lat * 11 + fbm(mul(ln, 1.6)) * 3.2), storm = Math.hypot(lat + 0.38, (lon - 0.9) * 0.5) < 0.16
    const tone = storm ? 0.12 : w > 0.3 ? 0.3 : w < -0.35 ? -0.28 : 0
    const L = clamp(lam * 0.7 + 0.3 + tone * 0.8, 0.22, 1)
    const c = storm ? mix(col, WHITE, 0.45) : w > 0.3 ? mix(col, WHITE, 0.3) : w < -0.35 ? mix(col, DARK, 0.45) : col
    const atmo = clamp(1 - facing, 0, 1) ** 3 * (lam > 0.05 ? 0.6 : 0)
    const r = lit(L + atmo * 0.4, c)
    return [r[0], mix(r[1], mix(col, WHITE, 0.5), atmo), r[2]]
  }
  if (kind === 'rock') {
    let L = clamp(lam * 0.9 + 0.14 + (fbm(mul(ln, 1.6)) - 0.5) * 0.35, 0, 1), c = col, part: 'bowl' | 'rim' | undefined
    for (const [cd, k] of RCRAT) {
      const d = Math.acos(clamp(dot(ln, cd), -1, 1)) / k
      if (d >= 1) continue
      // The bowl wall leans toward the crater centre: the wall facing the light glows, the other stays dim.
      const cw = P.toWorld(cd), t = sub(n, mul(cw, dot(n, cw))), tl = Math.sqrt(dot(t, t)), tn = tl > 1e-4 ? mul(t, 1 / tl) : V(0, 0, 0)
      const wall = clamp(dot(norm(sub(cw, mul(tn, d < 0.72 ? 1.4 * d : -0.9))), LIGHT), 0, 1) * (shadowed ? 0.4 : 1)
      if (d < 0.72) { L = clamp(0.2 + wall * 0.62 * (0.4 + 0.6 * lam), 0, 1); c = mix(col, DARK, 0.15); part = 'bowl'; break }
      L = clamp(0.35 + wall * 0.65, 0, 1); c = mix(col, WHITE, 0.2 + 0.3 * wall); part = 'rim'; break
    }
    if (part === 'bowl') { const r = lit(L, c, '.:;=+*'); return [r[0], r[1], r[2] * 0.95] }
    if (part === 'rim') return ['O', c, 0.45 + 0.55 * L]
    return lit(L, col, '.:;-=+*#%')
  }
  if (kind === 'ice') {
    const q = vmul(ln, V(1.3, 7.5, 1.3)), crack = Math.abs(fbm(add(q, mul(V(fbm(mul(ln, 1.2)), 0, 0), 2))) - 0.5) < 0.045, L = clamp(lam * 0.85 + 0.2, 0, 1)
    if (crack) return ['/', mix(col, DARK, 0.3), 0.55 + 0.4 * L]
    return lit(L, mix(col, WHITE, P.quiet ? 0.25 : 0.45), '.-=+*%@')
  }
  // terrain
  const rl = V(0.8 * ln.x + 0.6 * ln.z, ln.y * 0.9 + ln.x * 0.3, -0.6 * ln.x + 0.8 * ln.z)
  const w = mul(V(fbm(add(mul(rl, 1.1), V(3, 1, 7))), fbm(add(mul(rl, 1.1), V(9, 4, 2))), 0), 0.6)
  const h = clamp((fbm(add(mul(rl, 0.85), w)) - 0.5) * 1.7 + 0.52, 0, 1), sea = 0.5
  const cap = Math.abs(ln.y) > 0.82 + (fbm(mul(ln, 2)) - 0.5) * 0.25
  if (cap) return lit(clamp(lam * 0.9 + 0.2, 0, 1), mix(col, WHITE, 0.6), '.:-=+*%@')
  if (h < sea) { const r = lit(clamp(lam * 0.35 + 0.3, 0, 0.7), mix(col, DARK, 0.3), '.~-='); return [r[0], r[1], r[2] * 0.9] }
  const e = (h - sea) / (1 - sea)
  if (e < 0.05) return [':', mix(col, WHITE, 0.3), 0.55 + 0.45 * lam]
  if (e > 0.78) return ['^', mix(col, WHITE, 0.45 + 0.3 * lam), 0.6 + 0.4 * lam]
  return lit(clamp(lam * 0.85 + 0.2 + e * 0.3, 0, 1), col, '-=+*#%@')
}

export interface Cast { pos: V3; f: V3; focal: number; proj(p: V3): { x: number; y: number; z: number }; ray(sx: number, sy: number): V3 }
export interface Moon { c: V3; r: number; col: RGB }
// spin: surface turn in radians. ring.phase: angle of the bright arc on the run ring.
// fade: depth and hover dimming (1 = full), floored at A_MIN.
export interface Body {
  c: V3; r: number; col: RGB; planet: Planet; tilt: number; spin: number
  ring?: { phase: number }; moons: Moon[]; sel?: boolean; quiet?: boolean; glow?: number; fade?: number
}
// `?table=a|b` (item_216): either board shows the lit planets; anything else keeps the current table.
export const tableOf = (search: string): 'a' | 'b' | undefined => { const v = new URLSearchParams(search).get('table'); return v === 'a' || v === 'b' ? v : undefined }

export type Put = (c: number, r: number, z: number, ch: string | null, col: RGB, a: number, bg: number) => void

const RN = norm(V(0.22, 1, -0.2)), RU = norm(cross(RN, V(0, 0, 1))), RV = cross(RN, RU)
function hitSphere(o: V3, d: V3, c: V3, r: number) {
  const oc = sub(o, c), b = dot(oc, d), h = b * b - (dot(oc, oc) - r * r)
  if (h < 0) return -1
  const t = -b - Math.sqrt(h)
  return t > 0 ? t : -1
}
function ringHit(o: V3, d: V3, c: V3, r: number) {
  const den = dot(d, RN)
  if (Math.abs(den) < 1e-4) return null
  const t = dot(sub(c, o), RN) / den
  if (t <= 0) return null
  const q = add(o, mul(d, t)), v = sub(q, c), rad = Math.sqrt(dot(v, v)) / r
  return rad > 1.32 && rad < 1.78 ? { t, q, rad, th: Math.atan2(dot(v, RV), dot(v, RU)) } : null
}

// Ray-casts each body over the cells of its screen box (planet, ring, moons); put keeps the nearest.
export function castPlanets(cam: Cast, cols: number, rows: number, cw: number, chh: number, bodies: Body[], put: Put) {
  for (const p of bodies) {
    const s = cam.proj(p.c)
    if (s.z <= 0.1) continue
    const fr = frame(p.tilt, p.spin), fade = p.fade ?? 1
    const P: ShadeIn = { col: p.col, sel: p.sel, quiet: p.quiet, glow: p.glow, toWorld: fr.toWorld }
    let ext = p.r * (p.ring ? 1.8 : p.sel ? 1.12 : 1)
    for (const m of p.moons) { const v = sub(m.c, p.c); ext = Math.max(ext, Math.sqrt(dot(v, v)) + m.r) }
    const rad = (ext * cam.focal) / (s.z - ext)
    const c0 = Math.max(0, Math.floor((s.x - rad) / cw) - 1), c1 = Math.min(cols - 1, Math.ceil((s.x + rad) / cw) + 1)
    const r0 = Math.max(0, Math.floor((s.y - rad) / chh) - 1), r1 = Math.min(rows - 1, Math.ceil((s.y + rad) / chh) + 1)
    // Dimmed planets keep their glyphs and lose some light and alpha, never below A_MIN.
    // Channels clamp to 0..255: the grid's colour cache masks bits, so 280 would wrap to a dark 24.
    const c8 = (c: RGB): RGB => [clamp(c[0], 0, 255), clamp(c[1], 0, 255), clamp(c[2], 0, 255)]
    const out = (o: Shade): Shade => fade >= 1 ? [o[0], c8(o[1]), o[2]] : [o[0], c8(mix(mix(o[1], DARK, 0.5), o[1], fade)), Math.max(A_MIN, o[2] * fade)]
    for (let row = r0; row <= r1; row++) for (let col = c0; col <= c1; col++) {
      const d = cam.ray(col * cw + cw / 2, row * chh + chh / 2)
      let best = 1e9, o: Shade | null = null, solid = false
      const t = hitSphere(cam.pos, d, p.c, p.r)
      if (t > 0) {
        const q = add(cam.pos, mul(d, t)), n = norm(sub(q, p.c)), ln = fr.toLocal(n)
        const sh = (p.ring && ringHit(q, LIGHT, p.c, p.r)) || p.moons.some((m) => hitSphere(add(q, mul(LIGHT, 0.01)), LIGHT, m.c, m.r) > 0)
        best = t; o = shadePlanet(p.planet, P, n, ln, mul(d, -1), !!sh); solid = true
      }
      if (p.ring) {
        const h = ringHit(cam.pos, d, p.c, p.r)
        if (h && h.t < best) {
          const band = h.rad < 1.46 ? 0 : h.rad < 1.51 ? -1 : h.rad < 1.68 ? 1 : 2
          if (band >= 0) {
            // A bright arc runs round the ring so the run reads as turning.
            const shadow = hitSphere(h.q, LIGHT, p.c, p.r) > 0, arc = 0.75 + 0.25 * Math.cos(h.th - p.ring.phase)
            const L = shadow ? 0.2 : [0.75, 1, 0.6][band] * arc
            best = h.t; solid = false
            o = [['-', '=', '-'][band], mix(mix(p.col, DARK, 0.45), mix(p.col, WHITE, 0.35), L), shadow ? 0.35 : 0.55 + 0.45 * L]
          }
        }
      }
      for (const m of p.moons) {
        const t2 = hitSphere(cam.pos, d, m.c, m.r)
        if (t2 > 0 && t2 < best) {
          best = t2; solid = false
          const n = norm(sub(add(cam.pos, mul(d, t2)), m.c)), L = clamp(Math.max(0, dot(n, LIGHT)) * 0.9 + 0.1, 0, 1)
          o = [RAMP[clamp(Math.floor(L * 12), 0, 11)], mix(mix(m.col, DARK, 0.5), WHITE, L * 0.7), 0.5 + 0.5 * L]
        }
      }
      if (o) {
        const [ch, cc, a] = out(o)
        put(col, row, best * dot(d, cam.f), ch, cc, a, solid ? (0.14 + 0.16 * a) * fade : 0)
      } else if (p.sel) {
        // Cut-out margin round the selected planet so table lines stay out.
        const oc = sub(p.c, cam.pos), tc = dot(oc, d), dd = Math.sqrt(Math.max(0, dot(oc, oc) - tc * tc))
        if (dd < p.r * 1.12) put(col, row, dot(oc, cam.f) - p.r, ' ', [0, 0, 0], 0, 0)
      }
    }
  }
}
