import type { UiState } from '../data/state'
import type { HeroModel, HeroProject } from './model'
import { elapsed } from '../format'
import { castPlanets, type Body } from './planets'
import { add, clamp, cross, dot, LIGHT, mix, mul, norm, sub, V, type RGB, type V3 } from './vec'

// Static ASCII scene, ported from the approved hero pass 7 renderer (item_139) with the
// option B head (item_126 shader port) pasted in from heads.json. Draws one frame per call.

export interface Heads { palette: string[]; moods: Record<string, { cols: number; glyphs: string[]; colours: string[] }> }
// quiet: the violet of quiet planets on the lit table (item_216).
export interface Palette { ring: RGB; dim: RGB; fg: RGB; accent: RGB; state: Record<UiState, RGB>; quiet?: RGB }
// cx, cy, rad: projected planet disc for hit tests. a0: table angle without spin. back: behind the lens.
export interface PlanetLabel {
  x: number; y: number; name: string; state: UiState; side: 'l' | 'r' | 'c'; note?: string; target?: boolean
  cx: number; cy: number; rad: number; a0: number; back: boolean; hidden?: boolean
}
export interface MoonOut { x: number; y: number; r: number; id: string; title: string; state: UiState; member?: boolean }
// cw/ch/font: one head cell in CSS px (the live GL head draws on the same grid). hw/hh: head size.
export interface HeadBox { x: number; y: number; top: number; left: number; right: number; cw: number; ch: number; font: number; hw: number; hh: number }
export interface SceneOut { planets: PlanetLabel[]; head: HeadBox; lens: { x: number; y: number }; moons: MoonOut[]; more?: { x: number; y: number; n: number } }
// spin: degrees added to every planet angle (item_158). hover: lifted planet and its moons.
// look: head turn override (-1 left, 1 right, 0 front). lean: head tilt in degrees.
// pulse: 0..1 working pulse phase. lift: needs-you lift per project (0..1 of 4 px).
// glitch: failed glitch per project (0..1 left of the 180 ms).
export interface SceneOpts {
  now: Date; spin?: number; hover?: { name: string; k: number }
  look?: number; lean?: number; pulse?: number; sweep?: number; lift?: Record<string, number>; glitch?: Record<string, number>
  // Item 198. t: animation clock (ms). fx: table life switches. ripple: select wave (0..1 elapsed).
  // live: the GL head draws the head; the scene only clears its silhouette so the head hides the table back.
  t?: number; fx?: TableFx; ripple?: { name: string; k: number }; live?: boolean
  // Item 216: `?table=a|b` draws lit planets (planets.ts). Unset keeps the current table.
  table?: 'a' | 'b'
}
export interface TableFx { ping?: boolean; bob?: boolean; stream?: boolean }
export const TABLE_FX: TableFx = { ping: true, bob: true, stream: true }
// Fixed head height in bake rows: every mood keeps the same top (the fail bake is shorter).
const HEAD_ROWS = 87

// Cell size in px. The scene uses the head's own cell size, so the table, planets and moons
// keep the same ASCII definition as the head (item_158). Cells scale with the hero (item_194).
const CW0 = 4, CH0 = 7
let CW = CW0, CH = CH0, FONT = 6.65
const RAMP = '.,-~:;=!*#$@'
const KEYS = [...Array(94)].map((_, i) => String.fromCharCode(33 + i)).filter((c) => !'"\\'.includes(c)).join('')
const WHITE: RGB = [255, 240, 255]

const rotX = (p: V3, a: number) => { const c = Math.cos(a), s = Math.sin(a); return V(p.x, p.y * c - p.z * s, p.y * s + p.z * c) }
const D2R = Math.PI / 180
const QUIET: RGB = [168, 140, 255]
const nameHash = (s: string) => { let h = 2166136261; for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return (h >>> 0) / 4294967296 }
// Lit planet (item_216): type from the project, tilt and spin seed from its name, so each
// planet keeps its own look. A live run wears the ring; sessions orbit as moons (max 3), hidden
// on hover where the mission moons take over, and on systems where members orbit instead.
function litBody(p: { name: string; planet: HeroProject['planet']; state: UiState; c: V3; r: number; hk: number; agents: HeroProject['agents']; members?: HeroProject[] }, col: RGB, quiet: boolean, tt: number, glow: number, fade: number, SC: Record<UiState, RGB>): Body {
  const h = nameHash(p.name)
  const ags = p.members || p.hk > 0 ? [] : p.agents.slice(0, 3)
  const moons = ags.map((a, i) => {
    const t = (i / ags.length) * Math.PI * 2 + tt * 0.0004 + h * 6.28
    return { c: moonAt(p, t), r: p.r * 0.5, col: SC[a.state], t }
  })
  return {
    c: p.c, r: p.r, col, planet: p.planet, tilt: (h - 0.5) * 0.8, spin: h * 6.28 + tt * 0.00025,
    ring: p.state === 'working' ? { phase: -tt * 0.0008 } : undefined, moons, sel: p.hk > 0, quiet, glow, fade,
  }
}
const moonAt = (p: { c: V3; r: number }, t: number, k = 1) => { const R = p.r * 1.9 * k; return add(p.c, V(R * Math.cos(t), R * 0.35 * Math.sin(t), R * 0.8 * Math.sin(t))) }
// Orbit trail behind each session moon in its state colour, fading out over ~85 degrees, wider near the moon.
function moonTrails(g: Grid, cam: Cam, b: Body) {
  const f = b.fade ?? 1
  for (const m of b.moons) for (let k = 0; k < 60; k++) {
    const q = k / 60
    const a = (0.55 + 0.45 * q) * Math.max(0.7, f), t = m.t! - 1.5 * (1 - q)
    // Comet glyphs (no '-' or '=', which the table already uses), denser toward the moon.
    splat(g, cam, moonAt(b, t), q > 0.7 ? '*' : q > 0.35 ? '+' : '.', mix(m.col, WHITE, 0.25 * q), a, 0.1)
    if (q > 0.5) { splat(g, cam, moonAt(b, t, 0.95), '+', m.col, a * 0.8, 0.1); splat(g, cam, moonAt(b, t, 1.05), '+', m.col, a * 0.8, 0.1) }
  }
}
const rampCh = (L: number) => RAMP[clamp(Math.floor(L * 12), 0, 11)]

function rng(seed: number) {
  let a = seed
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

type Cam = ReturnType<typeof camera>
function camera(pos: V3, tgt: V3, focal: number, cx: number, cy: number) {
  const f = norm(sub(tgt, pos)), r = norm(cross(V(0, 1, 0), f)), u = cross(f, r)
  return {
    pos, f, focal,
    proj(p: V3) { const v = sub(p, pos), z = dot(v, f); return { x: cx + (focal * dot(v, r)) / z, y: cy - (focal * dot(v, u)) / z, z } },
    ray(sx: number, sy: number) { return norm(add(f, add(mul(r, (sx - cx) / focal), mul(u, -(sy - cy) / focal)))) },
  }
}

// bg: optional cell backdrop alpha (sphere cells), so a sphere reads as one solid disc.
// k: cell scale vs the scene grid (head bakes at another density).
interface Grid { cols: number; rows: number; z: Float32Array; ch: (string | null)[]; col: RGB[]; a: Float32Array; bg?: Float32Array; k?: number }
function makeGrid(w: number, h: number): Grid {
  const cols = Math.ceil(w / CW), rows = Math.ceil(h / CH), n = cols * rows
  return { cols, rows, z: new Float32Array(n).fill(1e9), ch: new Array(n).fill(null), col: new Array(n), a: new Float32Array(n), bg: new Float32Array(n) }
}
function put(g: Grid, c: number, r: number, z: number, ch: string | null, col: RGB, a = 1, bg = 0) {
  if (c < 0 || r < 0 || c >= g.cols || r >= g.rows) return
  const i = r * g.cols + c
  if (z >= g.z[i]) return
  g.z[i] = z; g.ch[i] = ch; g.col[i] = col; g.a[i] = a
  if (g.bg) g.bg[i] = bg
}
function splat(g: Grid, cam: Cam, p: V3, ch: string, col: RGB, a = 1, zb = 0) {
  const s = cam.proj(p)
  if (s.z <= 0.1) return
  put(g, Math.floor(s.x / CW), Math.floor(s.y / CH), s.z - zb, ch, col, a)
}
function splatLit(g: Grid, cam: Cam, p: V3, n: V3, col: RGB, gain = 1, floor = 0.08, a = 1) {
  const L = clamp(Math.max(0, dot(n, LIGHT)) * gain + floor, 0, 1)
  splat(g, cam, p, rampCh(L), mix(mix(col, [20, 20, 50], 0.55), col, L), a * (0.45 + 0.55 * L))
}
function ringOnPlane(g: Grid, cam: Cam, c: V3, R: number, ch: string, col: RGB, a = 1, step = 0.012, dash = 0, phase = 0) {
  for (let t = 0; t < Math.PI * 2; t += step) {
    if (dash && Math.floor((t + phase) / dash) % 2) continue
    splat(g, cam, add(c, V(R * Math.cos(t), 0, R * Math.sin(t))), ch, col, a)
  }
}
// Hex outline on the table plane, same orientation as the etched grid (turned with the table).
function hexOnPlane(g: Grid, cam: Cam, c: V3, e: number, spin: number, ch: string, col: RGB, a = 1, dt = 0.05) {
  for (let s = 0; s < 6; s++) {
    const a0 = (s * Math.PI) / 3, a1 = a0 + Math.PI / 3
    for (let t = 0; t < 1; t += dt) splat(g, cam, add(c, rotY(V(e * ((1 - t) * Math.cos(a0) + t * Math.cos(a1)), 0, e * ((1 - t) * Math.sin(a0) + t * Math.sin(a1))), spin)), ch, col, a)
  }
}
function octa(g: Grid, cam: Cam, c: V3, s: number, col: RGB, gain = 1) {
  const rnd = rng(7)
  for (let f = 0; f < 8; f++) {
    const sx = f & 1 ? 1 : -1, sy = f & 2 ? 1 : -1, sz = f & 4 ? 1 : -1, n = norm(V(sx, sy * 0.8, sz))
    for (let k = 0; k < 420; k++) {
      let a = rnd(), b = rnd()
      if (a + b > 1) { a = 1 - a; b = 1 - b }
      splatLit(g, cam, add(c, V(sx * s * a, sy * s * 1.35 * b, sz * s * (1 - a - b))), n, col, gain, 0.25)
    }
  }
}
// tilt 0 lies flat on the table, PI/2 - 0.25 stands nearly upright.
function brokenRing(g: Grid, cam: Cam, c: V3, col: RGB, tilt = Math.PI / 2 - 0.25) {
  const R = 0.26, r = 0.06
  for (let i = 0; i < 220; i++) {
    const th = (i / 220) * Math.PI * 2
    if ((th > 0.5 && th < 1.0) || (th > 3.3 && th < 3.6)) continue
    for (let j = 0; j < 8; j++) {
      const ph = (j / 8) * Math.PI * 2
      const p = rotX(V((R + r * Math.cos(ph)) * Math.cos(th), r * Math.sin(ph), (R + r * Math.cos(ph)) * Math.sin(th)), tilt)
      const n = rotX(V(Math.cos(ph) * Math.cos(th), Math.sin(ph), Math.cos(ph) * Math.sin(th)), tilt)
      splatLit(g, cam, add(c, p), n, col, 1.4, 0.3)
    }
  }
}
interface Sphere { c: V3; r: number; col: RGB; emit: number; dimf: number }
function raySpheres(g: Grid, cam: Cam, spheres: Sphere[]) {
  // Per sphere, only the cells inside its screen box; the grid z test keeps the nearest hit.
  for (const s of spheres) {
    const p = cam.proj(s.c)
    if (p.z <= 0.1) continue
    const rad = (s.r * cam.focal) / p.z
    const c0 = Math.max(0, Math.floor((p.x - rad) / CW) - 1), c1 = Math.min(g.cols - 1, Math.ceil((p.x + rad) / CW) + 1)
    const r0 = Math.max(0, Math.floor((p.y - rad) / CH) - 1), r1 = Math.min(g.rows - 1, Math.ceil((p.y + rad) / CH) + 1)
    const oc = sub(cam.pos, s.c), cc = dot(oc, oc) - s.r * s.r
    const base = mix(s.col, [20, 20, 50], 0.25), lit = mix(s.col, WHITE, s.emit * 0.4)
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
      const d = cam.ray(c * CW + CW / 2, r * CH + CH / 2)
      const b = dot(oc, d), h = b * b - cc
      if (h < 0) continue
      const t = -b - Math.sqrt(h)
      if (t <= 0) continue
      const n = norm(sub(add(cam.pos, mul(d, t)), s.c))
      const L = clamp(Math.max(0, dot(n, LIGHT)) * (1 - s.emit) + s.emit * 0.75 + 0.22, 0, 1) * s.dimf
      put(g, c, r, t * dot(d, cam.f), rampCh(L), mix(base, lit, L), 0.7 + 0.3 * L, (0.14 + 0.16 * L) * s.dimf)
    }
  }
}


// Holotable (item_162): a projector lens on a galaxy-map table, CR-0W floating above it.
// Planets = projects, colour = most urgent state.
// Sky ring (item_197): planets sit evenly on a ring parallel to the table, under the head. Height
// above the table = priority (failed, needs you, working, quiet, done just above the table). The highest
// sits at the front, the next ones alternate left and right; a spin shows the rest.
const RT = 4.6
const PY = -0.55
const RING = 0.8
const RANK: Record<UiState, number> = { failed: 0, needs: 1, working: 2, sleeping: 3, queued: 3, done: 4 }
const ALT: Record<UiState, number> = { failed: 0.95, needs: 0.62, working: 0.38, sleeping: 0.2, queued: 0.2, done: 0.08 }
// Size by priority, so the same state always reads the same (not by open missions).
const SIZE: Record<UiState, number> = { failed: 0.34, needs: 0.34, working: 0.3, sleeping: 0.26, queued: 0.26, done: 0.24 }
const MAXP = 9
// Lit table (item_217): size by planet type (owner 2026-11-16), hex cell size, phone breakpoint (one label).
const TSIZE: Record<HeroProject['planet'], number> = { bands: 0.44, terrain: 0.34, ice: 0.3, rock: 0.26 }
const HSZ = 0.62, S3 = Math.sqrt(3), DARK: RGB = [20, 20, 50]
export const PHONE_W = 500
const hexOf = (p: V3) => { const q = Math.round(p.x / (HSZ * 1.5)), r = Math.round(p.z / (HSZ * S3) - q / 2); return V(HSZ * 1.5 * q, PY, HSZ * S3 * (r + q / 2)) }
const rotY = (p: V3, deg: number) => { const c = Math.cos(deg * D2R), s = Math.sin(deg * D2R); return V(p.x * c + p.z * s, p.y, -p.x * s + p.z * c) }
// Hex etch: edge points in the table frame built once; projected cells cached per size and spin
// (idle frames redraw the same grid, a drag re-projects about 9k points).
let hexPts: Float32Array | undefined
let hexCache: { k: string; cells: Float32Array } | undefined
function hexGrid(g: Grid, cam: Cam, w: number, h: number, spin: number, col: RGB) {
  if (!hexPts) {
    const out: number[] = [], e = HSZ * 0.97
    for (let q = -9; q <= 9; q++) for (let r = -9; r <= 9; r++) {
      const cx = HSZ * 1.5 * q, cz = HSZ * S3 * (r + q / 2), d = Math.hypot(cx, cz)
      if (d > RT * 0.93) continue
      const a = 0.8 * (1 - (d / RT) * 0.3)
      for (let s = 0; s < 6; s++) {
        const a0 = (s * Math.PI) / 3, a1 = a0 + Math.PI / 3
        for (let t = 0; t < 1; t += 0.08) out.push(cx + e * ((1 - t) * Math.cos(a0) + t * Math.cos(a1)), cz + e * ((1 - t) * Math.sin(a0) + t * Math.sin(a1)), a)
      }
    }
    hexPts = Float32Array.from(out)
  }
  const k = `${w}x${h}:${spin}:${CW}`
  if (hexCache?.k !== k) {
    const out: number[] = [], c = Math.cos(spin * D2R), sn = Math.sin(spin * D2R), P = hexPts
    for (let i = 0; i < P.length; i += 3) {
      const x = P[i] * c + P[i + 1] * sn, z = -P[i] * sn + P[i + 1] * c, sp = cam.proj(V(x, PY, z))
      if (sp.z > 0.1) out.push(Math.floor(sp.x / CW), Math.floor(sp.y / CH), sp.z, P[i + 2] * clamp(1 - ((z + RT) / (2 * RT)) * 0.5, 0.45, 1))
    }
    hexCache = { k, cells: Float32Array.from(out) }
  }
  const cs = hexCache.cells
  for (let i = 0; i < cs.length; i += 4) put(g, cs[i], cs[i + 1], cs[i + 2], ':', col, cs[i + 3])
}
// Cell scale (item_194): one rule for every size, calibrated on the phone cover hero (344x400 at
// 0.434). The smaller of the width and height fits wins, so head and scene keep their share of the hero.
// DENSITY: glyphs per head-scale cell (item_195: 1.25x so spheres and head read rounder). The
// head is baked at the same density (scripts/hero-heads.mjs); HEAD_COLS is its width at 1x, so
// a bake at another density keeps the head the same size.
const HS = 0.434, REF_W = 344, REF_H = 400, HEAD_COLS = 173, DENSITY = 1.25
export const fmtWait = (m: number) => (m < 60 ? `${m}m` : `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}`)

export function drawScene(cv: HTMLCanvasElement, w: number, h: number, dpr: number, m: HeroModel, heads: Heads | undefined, pal: Palette, turn: { l: Heads; r: Heads } | undefined, opts: SceneOpts): SceneOut {
  const cw = Math.round(w * dpr), ch = Math.round(h * dpr)
  if (cv.width !== cw || cv.height !== ch) { cv.width = cw; cv.height = ch }
  const cs = HS * Math.min(w / REF_W, h / REF_H)
  CW = (CW0 * cs) / DENSITY; CH = (CH0 * cs) / DENSITY; FONT = (6.65 * cs) / DENSITY
  const g = makeGrid(w, h), rnd = rng(42), SC = pal.state
  const spin = opts.spin ?? 0, tt = opts.t ?? 0, fx = opts.fx ?? {}
  const POS = V(0, 4.4, -14.5), TGT = V(0, 0.2, 0), LENS = V(0, PY, 0)
  const focal = ((w / 2 - 28) * 14.5) / RT
  let cam = camera(POS, TGT, focal, w / 2, h / 2)
  cam = camera(POS, TGT, focal, w / 2, h / 2 + (h * 0.8 - cam.proj(LENS).y))
  const at = (a: number, f: number, y = PY) => V(RT * f * Math.cos(a * D2R), y, -RT * f * Math.sin(a * D2R))

  // Table: faint rings, plus spokes that turn with the planets so a spin reads (item_158).
  // Lit table (item_217, pick C2): a hex grid etched in the table and a radar scope at the centre.
  const T = !!opts.table
  if (T) hexGrid(g, cam, w, h, spin, mix(pal.ring, SC.working, 0.45))
  else for (const f of [0.25, 0.5, 0.75]) for (let t = 0; t < 360; t += 2.4 / f) splat(g, cam, at(t, f), '·', pal.ring, 0.2)
  for (let k = 0; k < 8; k++) for (let f = 0.2; f < 0.92; f += 0.05) splat(g, cam, at(k * 45 + 22.5 + spin, f), '·', pal.ring, T ? 0.28 : 0.1)
  if (T) {
    for (const f of [0.2, 0.4, 0.6]) for (let t = 0; t < 360; t += 1.2 / f) splat(g, cam, at(t + spin, f), (Math.round(t) % 30) < 3 ? '+' : '-', SC.working, 0.8)
    for (const t of [0, 90]) for (let f = -0.95; f <= 0.95; f += 0.02) if (Math.abs(f) > 0.12) splat(g, cam, at(t + spin, f), '-', SC.working, 0.6)
    if (opts.sweep !== undefined) {
      const s0 = opts.sweep * 360
      for (let d = 0; d < 60; d += 0.5) for (let f = 0.1; f < 0.98; f += 0.022) splat(g, cam, at(s0 - d, f), d < 1.5 ? '#' : ':', mix(SC.working, WHITE, d < 1.5 ? 0.5 : 0), (d < 1.5 ? 1 : 0.55) * (1 - d / 60) ** 1.8, 0.02)
    }
  }

  // Rim (item_197, the 24h clock is gone): a bezel that turns with the planets, minor ticks every
  // 10 deg, long accent ticks every 45. Front is lit more, the back fades.
  const TC = mix(pal.ring, pal.fg, 0.55)
  const rimA = (t: number) => 0.4 + 0.45 * Math.max(0, Math.sin((((t % 360) + 360) % 360) * D2R))
  for (let t = 0; t < 360; t += 0.8) splat(g, cam, at(t, 1), '-', TC, rimA(t) * 0.8)
  for (let k = 0; k < 36; k++) {
    const t = k * 10 + spin, major = k % 9 === 0
    for (let f = 1.015; f < (major ? 1.11 : 1.045); f += 0.012) splat(g, cam, at(t, f), major ? '#' : "'", major ? pal.accent : TC, rimA(t) * (major ? 2.2 : 1.6))
  }
  // Scan sweep (idle): a bright head with a fading tail running round the rim.
  if (opts.sweep !== undefined) {
    const s0 = opts.sweep * 360
    for (let d = 0; d < 90; d += 0.4) for (const f of [0.98, 1, 1.02]) splat(g, cam, at(s0 - d, f), d < 2.5 ? '#' : d < 10 ? '=' : d < 40 ? '-' : '.', mix(SC.working, WHITE, d < 2.5 ? 0.55 : 0), 1.7 * (1 - d / 90) ** 1.6)
    // Faint wedge on the table behind the beam, so the sweep reads as a scan, not a dot.
    for (let d = 0; d < 24; d += 1.2) for (let f = 0.3; f < 0.97; f += 0.07) splat(g, cam, at(s0 - d, f), '.', SC.working, 0.22 * (1 - d / 24) * f)
  }

  // Lens: the projector core, and a sparse cone that carries the head up.
  for (let r = 0; r < 0.34; r += 0.03) for (let t = 0; t < 360; t += 4) splat(g, cam, add(LENS, V(r * Math.cos(t * D2R), 0.02, r * Math.sin(t * D2R))), r < 0.18 ? '@' : '*', mix(WHITE, SC.working, r * 2.5), 0.9)
  ringOnPlane(g, cam, add(LENS, V(0, 0.02, 0)), 0.6, '-', SC.working, 0.6, 0.02)
  for (let i = 0; i < 700; i++) {
    const y0 = Math.pow(rnd(), 1.4) * 3.2, y = fx.stream ? (y0 + (tt / 7000) * 3.2) % 3.2 : y0, rad = (0.2 + y * 0.42) * Math.sqrt(rnd()), t = rnd() * Math.PI * 2
    splat(g, cam, add(LENS, V(rad * Math.cos(t), y + 0.05, rad * Math.sin(t))), rnd() < 0.2 ? ':' : '.', mix(SC.working, pal.accent, rnd() * 0.3), 0.08 + 0.2 * (1 - y / 3.2))
  }

  // Planets.
  const hov = opts.hover
  // Most urgent first, then cap: a live, failed or waiting system is never cut (item_200).
  const ranked = m.projects.map((p, i) => ({ p, i })).sort((a, b) => RANK[a.p.state] - RANK[b.p.state] || a.i - b.i).map((o) => o.p).slice(0, MAXP)
  const stepA = 360 / Math.max(ranked.length, 1)
  const ps = ranked.map((p, i) => {
    const a = 90 + (i % 2 ? 1 : -1) * Math.ceil(i / 2) * stepA
    let base = at(a + spin, RING)
    // C2: each planet stands on the centre of a hex cell (snapped in the table frame, then turned).
    if (T) base = rotY(hexOf(at(a, RING)), spin)
    // Back half of the table (behind the lens): smaller and dimmer, labels hidden.
    const depth = clamp(base.z / (RT * 0.5), 0, 1)
    const back = base.z > RT * 0.15
    // Failed: one short sideways glitch.
    const gl = opts.glitch?.[p.name] ?? 0
    if (gl > 0) base = add(base, V((Math.random() - 0.5) * 0.5 * gl, 0, 0))
    // Lit table: size by planet type, bigger on a phone where one label leaves room; back planets grow
    // to offset perspective so they stay readable (owner 2026-11-17).
    const r = T ? TSIZE[p.planet] * (w < PHONE_W ? 1.45 : 1.3) * (1 + 0.3 * depth) : SIZE[p.state] * (1 - 0.25 * depth)
    const z0 = cam.proj(base).z, px = z0 / cam.focal
    const hk = hov?.name === p.name ? hov.k : 0
    const stalk = ALT[p.state] + (p.state === 'needs' ? 0.18 * Math.min((p.wait ?? 0) / 300, 1) : 0)
      + (opts.lift?.[p.name] ?? (p.state === 'needs' ? 1 : 0)) * 4 * px + hk * 0.3
    // Beam ping: a planet brightens as the sweep passes it, then fades over 40 deg of beam travel.
    const behind = opts.sweep === undefined || !fx.ping ? 1e9 : ((((opts.sweep * 360 - (a + spin)) % 360) + 360) % 360)
    const ping = behind < 40 ? 1 - behind / 40 : 0
    const bob = fx.bob ? CH * px * Math.sin(tt / 1700 + i * 2.1) : 0
    return { ...p, a0: a, base, r, stalk, depth, back, hk, ping, c: add(base, V(0, stalk + r + bob, 0)) }
  })
  // Rim footprints: each planet marks the bezel with an arc in its colour, brighter when hovered
  // and when it turns into the front, so a spin shows which one has the focus.
  for (const p of ps) {
    const t0 = p.a0 + spin, off = Math.abs(((((t0 - 90) % 360) + 540) % 360) - 180)
    const front = Math.max(0, 1 - off / 25), k = 1 + 0.6 * (1 - p.depth) + p.hk + 0.8 * front
    for (let d = -6; d <= 6; d += 0.5) for (const f of [0.985, 1.015]) splat(g, cam, at(t0 + d, f), '=', mix(SC[p.state], WHITE, 0.25 * front), k * (1 - Math.abs(d) / 8))
  }
  // Select ripple: a ring runs out from the picked planet's footprint and fades.
  const rp = opts.ripple && ps.find((p) => p.name === opts.ripple!.name)
  if (rp) {
    const k = opts.ripple!.k, e = 1 - (1 - k) ** 3
    for (const lag of [0, 0.12]) { const u = Math.max(0, e - lag); if (u > 0) ringOnPlane(g, cam, add(rp.base, V(0, 0.02, 0)), rp.r * 1.2 + u * 1.6, lag ? '.' : '~', mix(SC[rp.state], WHITE, 0.3), 1.4 * (1 - k), 0.01) }
  }
  // Bot intent: longest wait first (model order), then a failure, then live work.
  const target = ps.find((p) => p.state === 'needs') ?? ps.find((p) => p.state === 'failed') ?? ps.find((p) => p.state === 'working')
  const spheres: Sphere[] = [], bodies: Body[] = []
  const dimOthers = hov ? 1 - 0.3 * hov.k : 1
  const pulse = opts.pulse === undefined ? 0 : 0.5 - 0.5 * Math.cos(opts.pulse * Math.PI * 2)
  for (const p of ps) {
    const col = SC[p.state], flat = add(p.base, V(0, 0.02, 0))
    const fade = (p.hk > 0 ? 1 : dimOthers) * (1 - 0.55 * p.depth)
    if (T) {
      // C2 foot: a dim filled shadow with a bright outline, a thin stem (broken when failed), a radar blip.
      const back = 1 - 0.45 * p.depth
      // The planet's hex cell lights up: filled shadow, bright edge; needs adds a dashed outer hex.
      const E = HSZ * 0.97
      for (let e = 0.05; e < E * 0.9; e += 0.05) hexOnPlane(g, cam, flat, e, spin, '.', mix(col, DARK, 0.4), 0.32 * back, 0.02 / e)
      hexOnPlane(g, cam, flat, E, spin, '=', mix(col, WHITE, 0.3), 0.9 * back, 0.012)
      if (p.state === 'needs') hexOnPlane(g, cam, flat, E * 1.3, spin, '-', col, 0.45 * back, 0.04)
      for (let y = 0.05; y < p.stalk; y += 0.045) {
        const u = y / p.stalk
        if (p.state === 'failed' && ((u > 0.3 && u < 0.4) || (u > 0.6 && u < 0.68))) continue
        splat(g, cam, add(p.base, V(0, y, 0)), '|', mix(col, WHITE, 0.2), 0.6 * back)
      }
      const blip = at(p.a0 + spin, 0.5, PY + 0.02)
      ringOnPlane(g, cam, blip, 0.1, '#', col, 1, 0.04)
      ringOnPlane(g, cam, blip, 0.05, '@', mix(col, WHITE, 0.4), 1, 0.05)
    } else {
      ringOnPlane(g, cam, flat, p.r * 1.2, '.', mix(col, [20, 20, 50], 0.35), 0.5, 0.06)
      for (let y = 0.05; y < p.stalk; y += 0.07) splat(g, cam, add(p.base, V(0, y, 0)), ':', col, 0.55)
    }
    const quiet = p.state === 'sleeping' || p.state === 'queued' || p.state === 'done'
    // One light for every live planet; the target stands out by its marker and the head's gaze.
    const emit = (quiet ? 0.12 : 0.45) + (p.state === 'working' ? 0.25 * pulse : 0) + 0.25 * p.hk + 0.35 * p.ping ** 2
    // Quiet planets go grey so only live states carry a colour; the working one glows a bit more (item_200 pick B).
    const qcol = mix(pal.dim, [128, 128, 128], 0.6), wemit = p.state === 'working' ? 0.25 : 0
    if (opts.table) { const b = litBody(p, quiet ? pal.quiet ?? QUIET : col, quiet, tt, (pulse * (p.state === 'working' ? 0.25 : 0)) + 0.25 * p.hk + 0.35 * p.ping ** 2, fade, SC); bodies.push(b); moonTrails(g, cam, b) }
    else spheres.push({ c: p.c, r: p.r, col: quiet && p.state !== 'done' ? qcol : p.state === 'failed' ? mix(col, WHITE, 0.2) : col, emit: emit + wemit, dimf: (quiet ? 0.5 : 1) * fade })
    if (p.state === 'failed') brokenRing(g, cam, p.c, col)
    // Running planets wear a turning ring around their equator, so work reads without relying on colour.
    if (p.state === 'working' && !opts.table) {
      // Tilted toward the camera like Saturn's, so its front arc crosses the planet's face.
      const R = p.r * 1.9, tilt = 0.45, ph = -tt * 0.0008, rc = mix(col, WHITE, 0.35)
      for (let t = 0; t < Math.PI * 2; t += 0.012) {
        if (Math.floor((t + ph) / 0.35) % 3 === 2) continue
        const x = R * Math.cos(t), z = R * Math.sin(t)
        splat(g, cam, add(p.c, V(x, -z * Math.sin(tilt), z * Math.cos(tilt))), '=', rc, 1.2 * fade)
      }
    }
    if (p === target && p.state === 'needs') octa(g, cam, add(p.c, V(0, p.r + 0.34, 0)), 0.12, col, 1.4)
  }
  // Hovered planet: its open missions orbit it as moons, max 6 then +n.
  const moons: { c: V3; r: number; id: string; title: string; state: UiState; member?: boolean }[] = []
  let more: { c: V3; n: number } | undefined
  const hp = ps.find((p) => p.hk > 0)
  if (hp) {
    // Moons fly out as the hover eases in, leaving room for their titles. The orbit is
    // tilted toward the camera so the titles spread vertically instead of stacking.
    const list = hp.members ? [] : hp.missions.slice(0, 6), R = (Math.max(hp.r, 0.2) * 1.9 + 0.12) * (1 + 0.5 * hp.hk)
    list.forEach((mi, i) => {
      const t = (i / Math.max(list.length, 1)) * Math.PI * 2 + spin * D2R * 0.5 + 0.4
      const c = add(hp.c, V(R * Math.cos(t), R * 0.55 * Math.sin(t), R * 0.8 * Math.sin(t)))
      const r = 0.21 * hp.hk
      moons.push({ c, r, id: mi.id, title: mi.title, state: mi.state })
      spheres.push({ c, r, col: SC[mi.state], emit: 0.3, dimf: hp.hk })
    })
    if (!hp.members && hp.missions.length > 6) more = { c: add(hp.c, V(0, hp.r + 0.25, 0)), n: hp.missions.length - 6 }
  }
  // System members (item_200 pick B): small moons always orbit their system planet, grey when
  // quiet. Hovering the planet spreads them out and names them (no state glyph).
  const qgrey = mix(pal.dim, [128, 128, 128], 0.6)
  for (const p of ps) {
    if (!p.members) continue
    const R = (p.r * 2.3 + 0.12) * (1 + 0.4 * p.hk), fade = (p.hk > 0 ? 1 : dimOthers) * (1 - 0.55 * p.depth)
    p.members.forEach((q, i) => {
      const t = (i / p.members!.length) * Math.PI * 2 + tt * 0.0002 + 0.4
      const c = add(p.c, V(R * Math.cos(t), R * 0.5 * Math.sin(t), R * 0.8 * Math.sin(t)))
      const quiet = q.state === 'sleeping' || q.state === 'queued'
      spheres.push({ c, r: 0.1 + 0.04 * p.hk, col: quiet ? qgrey : SC[q.state], emit: quiet ? 0.12 : 0.35, dimf: (quiet ? 0.6 : 1) * fade })
      if (p.hk > 0) moons.push({ c, r: 0.1 + 0.04 * p.hk, id: 'm:' + q.name, title: q.label ?? q.name, state: q.state, member: true })
    })
  }
  raySpheres(g, cam, spheres)
  if (bodies.length) castPlanets(cam, g.cols, g.rows, CW, CH, bodies, (c, r, z, ch, col, a, bg) => put(g, c, r, z, ch, col, a, bg))

  // Head: option B glyph grid on its own layer at HS scale, above the lens, turned toward the
  // target. Its eyes (the violet cells) take the target's state colour.
  const lens = cam.proj(LENS)
  let head: HeadBox = { x: w / 2, y: lens.y, top: lens.y, left: w / 2, right: w / 2, cw: CW, ch: CH, font: FONT, hw: 0, hh: 0 }
  let layer: HeadLayer | undefined
  const tx = target ? cam.proj(target.c).x : w / 2
  const dir = opts.look ?? (target && Math.abs(tx - w / 2) > 40 ? Math.sign(tx - w / 2) : 0)
  const H = turn && dir ? (dir < 0 ? turn.l : turn.r) : heads
  // The face follows the work, never the ask face (owner rule).
  const working = m.projects.some((p) => p.state === 'working')
  const face = m.mood === 'fail' ? 'fail' : m.mood === 'run' || (m.mood === 'ask' && working) ? 'run' : 'idle'
  if (H) {
    // The grid is always HEAD_ROWS tall so the lean pivot (its bottom) matches the GL head.
    const hd = H.moods[face] ?? H.moods[m.mood], rows = hd.glyphs.length, GR = Math.max(rows, HEAD_ROWS)
    const hg: Grid = { cols: hd.cols, rows: GR, z: new Float32Array(hd.cols * GR).fill(1e9), ch: new Array(hd.cols * GR).fill(null), col: new Array(hd.cols * GR), a: new Float32Array(hd.cols * GR), k: (HEAD_COLS * DENSITY) / hd.cols }
    if (opts.live) {
      // Silhouette only: the union of the three bakes' row spans, padded, cleared so the GL head shows.
      const PAD = 2
      for (let r = 0; r < rows + PAD; r++) {
        let lo = Infinity, hi = -1
        for (const B of [heads, turn?.l, turn?.r]) for (const rr of [r - PAD, r, r + PAD]) {
          const row = B?.moods[face]?.glyphs[rr]
          if (!row) continue
          const f = row.search(/\S/)
          if (f >= 0) { lo = Math.min(lo, f); hi = Math.max(hi, row.trimEnd().length) }
        }
        if (r >= rows || hi < 0) continue
        for (let c = Math.max(0, lo - PAD); c < Math.min(hd.cols, hi + PAD); c++) put(hg, c, r, 0, ' ', pal.dim, 0)
      }
    } else {
      const eye = target ? SC[target.state] : undefined
      hd.glyphs.forEach((row, r) => {
        const first = row.search(/\S/), last = row.trimEnd().length
        if (first < 0) return
        const eyes = eye && r > rows * 0.36 && r < rows * 0.54
        for (let c = first; c < last; c++) {
          const k = hd.colours[r].slice(2 * c, 2 * c + 2)
          if (row[c] === ' ' || k.length < 2 || k === '  ') { put(hg, c, r, 0, ' ', pal.dim, 0); continue }
          const [hex, alpha] = H.palette[KEYS.indexOf(k[0]) * KEYS.length + KEYS.indexOf(k[1])].split('/')
          const n = parseInt(hex.slice(1), 16)
          let col: RGB = [(n >> 16) & 255, (n >> 8) & 255, n & 255]
          if (eyes && col[0] > col[1] + 40 && col[2] > col[1]) col = mix(col, eye, 0.9)
          put(hg, c, r, 0, row[c], col, Math.min(1, Number(alpha) * 1.5))
        }
      })
    }
    const k = hg.k!, cw = CW * k, chh = CH * k
    const hw = hd.cols * cw, HH = GR * chh
    const top = Math.max(60, (70 + cam.proj(at(270, 1)).y - 50 - HH) / 2)
    layer = { g: hg, scale: 1, x: w / 2 - hw / 2, y: top, zSplit: lens.z, lean: (opts.lean ?? 0) * D2R }
    head = { x: w / 2, y: top + HH / 2, top, left: w / 2 - hw / 2, right: w / 2 + hw / 2, cw, ch: chh, font: FONT * k, hw, hh: HH }
  }

  paint(cv, g, dpr, layer)

  const gaps = new Map<PlanetLabel, number>(), depths = new Map<PlanetLabel, number>()
  const out: SceneOut = {
    planets: [], head, lens: { x: lens.x, y: lens.y },
    moons: moons.map((o) => { const s = cam.proj(o.c); return { x: s.x, y: s.y, r: Math.max(6, (o.r * cam.focal) / s.z), id: o.id, title: o.title, state: o.state, member: o.member } }),
    more: more && { ...cam.proj(more.c), n: more.n },
  }
  for (const p of ps) {
    const s = cam.proj(p.c)
    const rad = (p.r * cam.focal) / s.z
    const side = s.x < w / 2 ? 'l' : 'r'
    // The colour carries the state: the note only adds what it cannot say (run time, wait, failure cause).
    const note = p.state === 'working' && p.runFrom ? elapsed(p.runFrom, opts.now)
      : p.state === 'needs' && p.wait !== undefined ? fmtWait(p.wait)
      : p.state === 'failed' ? p.cause : undefined
    const label: PlanetLabel = {
      x: s.x + (side === 'r' ? rad + 8 : -rad - 8), y: s.y, name: p.name, state: p.state, side, note, target: p === target,
      cx: s.x, cy: s.y, rad: Math.max(rad, 10), a0: p.a0, back: p.back && p.hk === 0,
    }
    out.planets.push(label)
    gaps.set(label, rad + 8)
    depths.set(label, p.depth)
  }
  // Lit table (item_217): few labels. Phone: the front planet only, centred above it. Laptop: the 3 most urgent.
  const shown = new Set(out.planets)
  if (T) {
    const RANK: Partial<Record<UiState, number>> = { failed: 0, needs: 1, working: 2 }
    const phone = w < PHONE_W, rk = (l: PlanetLabel) => RANK[l.state] ?? 3, dp = (l: PlanetLabel) => depths.get(l) ?? 1
    const pick = phone ? [...out.planets].sort((a, b) => dp(a) - dp(b)).slice(0, 1)
      : [...out.planets].sort((a, b) => rk(a) - rk(b) || dp(a) - dp(b)).slice(0, 3)
    shown.clear(); for (const l of pick) shown.add(l)
    if (phone) for (const l of pick) Object.assign(l, { side: 'c', x: l.cx, y: l.cy - l.rad - 6 })
  }
  // Nudge planet labels apart (approximate text boxes), keep tags clear of the head.
  type Box = { x0: number; x1: number; y0: number; y1: number; own?: string }
  const boxes: Box[] = []
  const line = (x0: number, x1: number, y: number): Box => ({ x0, x1, y0: y - 8, y1: y + 8 })
  for (const p of ps) {
    const c = cam.proj(p.c), rr = (p.r * cam.focal) / c.z
    boxes.push({ x0: c.x - rr, x1: c.x + rr, y0: c.y - rr, y1: c.y + rr, own: p.name })
  }
  for (const l of [...shown].filter((l) => l.side !== 'c').sort((a, b) => a.y - b.y)) {
    const tw = (l.name.length + (l.note ? l.note.length + 3 : 0)) * 7.2
    const span = () => (l.side === 'r' ? [l.x, l.x + tw] : [l.x - tw, l.x])
    const hit = (y: number) => { const [x0, x1] = span(); return boxes.some((b) => b.own !== l.name && b.y0 < y + 8 && b.y1 > y - 8 && b.x0 < x1 && x0 < b.x1) }
    // Blocked where it is: try the other side of the planet, then the nearest free row up or down.
    if (hit(l.y)) {
      const g = 2 * (gaps.get(l) ?? 0), was = { x: l.x, side: l.side }
      l.x += l.side === 'r' ? -g : g; l.side = l.side === 'r' ? 'l' : 'r'
      if (hit(l.y)) Object.assign(l, was)
    }
    const [x0, x1] = span()
    let dy = 0
    while (hit(l.y + dy) && hit(l.y - dy) && dy < 200) dy += 4
    if (hit(l.y + dy)) dy = -dy
    l.y += dy
    boxes.push(line(x0, x1, l.y))
  }
  // Labels hidden where the head covers them.
  const inHead = (x: number, y: number) => x > head.left + 20 && x < head.right - 20 && y > head.top && y < 2 * head.y - head.top
  // Readability (item_158): back labels hide (YOUR MOVE tags stay); nothing sits under the head.
  for (const l of out.planets) {
    const tw = (l.name.length + (l.note ? l.note.length + 3 : 0)) * 7.2, x0 = l.side === 'r' ? l.x : l.side === 'c' ? l.x - tw / 2 : l.x - tw
    l.hidden = !shown.has(l) || (!T && l.back) || inHead(x0, l.y) || inHead(x0 + tw, l.y) || inHead(x0 + tw / 2, l.y)
  }
  return out
}

interface HeadLayer { g: Grid; scale: number; x: number; y: number; zSplit: number; lean: number }
let offscreen: HTMLCanvasElement | undefined, bloomCv: HTMLCanvasElement | undefined
// rgba() strings per quantised colour and alpha: building one per cell per frame dominated the paint.
const RGBA = new Map<number, string>()
const rgba = (col: RGB, a: number) => {
  const r = col[0] & 0xf8, g = col[1] & 0xf8, b = col[2] & 0xf8, q = Math.max(0, Math.min(63, Math.round(a * 63)))
  const k = (r << 16) | (g << 8) | b | (q << 24)
  let v = RGBA.get(k)
  if (!v) { v = `rgba(${r},${g},${b},${(q / 63).toFixed(3)})`; RGBA.set(k, v) }
  return v
}
const BLOOM_DIV = 4
function paint(cv: HTMLCanvasElement, g: Grid, dpr: number, head?: HeadLayer) {
  const ctx = cv.getContext('2d')
  if (!ctx) return
  const L = (offscreen ??= document.createElement('canvas'))
  if (L.width !== cv.width || L.height !== cv.height) { L.width = cv.width; L.height = cv.height }
  const l = L.getContext('2d')!
  l.setTransform(1, 0, 0, 1, 0, 0); l.clearRect(0, 0, L.width, L.height)
  l.scale(dpr, dpr)
  l.textBaseline = 'middle'; l.textAlign = 'center'
  const CWg = CW, CHg = CH
  const cells = (gr: Grid, keep: (z: number) => boolean) => {
    const k = gr.k ?? 1, CW = CWg * k, CH = CHg * k
    l.font = `500 ${(FONT * k).toFixed(2)}px 'Fira Code', ui-monospace, monospace`
    // Blank cells clear what is behind them; a run of blanks on a row is one clear (thousands per frame).
    let run = -1
    const flush = (r: number, c: number) => { if (run >= 0) { l.clearRect(run * CW - 0.5, r * CH - 0.5, (c - run) * CW + 1, CH + 1); run = -1 } }
    for (let r = 0; r < gr.rows; r++) {
      for (let c = 0; c < gr.cols; c++) {
        const i = r * gr.cols + c, ch = gr.ch[i]
        if (!ch || !keep(gr.z[i])) { flush(r, c); continue }
        if (ch === ' ') { if (run < 0) run = c; continue }
        flush(r, c)
        draw(gr, i, ch, c, r, CW, CH)
      }
      flush(r, gr.cols)
    }
  }
  const draw = (gr: Grid, i: number, ch: string, c: number, r: number, CW: number, CH: number) => {
    const col = gr.col[i], bg = gr.bg?.[i] ?? 0
    if (bg > 0) { l.fillStyle = rgba(col, bg); l.fillRect(c * CW, r * CH, CW, CH) }
    l.fillStyle = rgba(col, gr.a[i])
    l.fillText(ch, c * CW + CW / 2, r * CH + CH / 2 + 0.5)
  }
  // Behind the lens, then the head (its silhouette hides the table back), then the front.
  cells(g, (z) => !head || z > head.zSplit)
  if (head) {
    const hk = head.g.k ?? 1, hw = head.g.cols * CW * hk * head.scale, hh = head.g.rows * CH * hk * head.scale
    l.save(); l.translate(head.x + hw / 2, head.y + hh); l.rotate(head.lean); l.translate(-hw / 2, -hh); l.scale(head.scale, head.scale)
    cells(head.g, () => true)
    l.restore()
    cells(g, (z) => z <= head.zSplit)
  }
  // Bloom at a quarter of the resolution (blur cost scales with pixels x radius), upscaled smooth.
  const B = (bloomCv ??= document.createElement('canvas'))
  const bw = Math.ceil(L.width / BLOOM_DIV), bh = Math.ceil(L.height / BLOOM_DIV)
  if (B.width !== bw || B.height !== bh) { B.width = bw; B.height = bh }
  const b = B.getContext('2d')!
  b.clearRect(0, 0, bw, bh); b.drawImage(L, 0, 0, bw, bh)
  ctx.clearRect(0, 0, cv.width, cv.height)
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'; ctx.imageSmoothingQuality = 'high'
  ctx.filter = `blur(${(14 * dpr) / BLOOM_DIV}px)`; ctx.globalAlpha = 0.55; ctx.drawImage(B, 0, 0, cv.width, cv.height)
  ctx.filter = `blur(${(3 * dpr) / BLOOM_DIV}px)`; ctx.globalAlpha = 0.6; ctx.drawImage(B, 0, 0, cv.width, cv.height)
  ctx.restore()
  ctx.drawImage(L, 0, 0)
}
