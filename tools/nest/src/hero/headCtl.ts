// Head character controller (items 196 + 198). Pure logic: inputs per frame in, a HeadFrame out.
// Layers (research "Motion Research.md"): perpetual idle (breathing, drift, shimmer), periodic
// (blink, glance, scan, flicker) and episodic beats (nod on select, present, ask tilt, fail glitch).
// Arms: wave on load, think on a long hover, tap the table while working, trail a drag, shiver then droop on fail.
// Persona: formal and calm, so every move rides a critically damped spring (no overshoot, no jitter).
import { FACE_STYLE, type Face, type HeadFrame, type Pose } from './gl/head'
import { gaze, settled, spring, stepGaze, type Gaze, type Spring } from './motion'

type RGB = [number, number, number]

// Character presets from the item_198 mockup. The owner picked lively with strong holo effects.
export interface Character {
  headMs: number; dead: number // gaze follow half-life and dead zone (deg)
  blink: [number, number]; double: number // blink gap range (ms), chance of a double blink
  breathe: number; drift: number // breathing pitch (deg) and idle yaw drift (deg)
  glance: [number, number] | null // idle glance gap range (ms)
  nod: number; tilt: number // nod depth and ask tilt (deg)
  scan: [number, number] | null; flicker: [number, number] | null; shimmer: number // holo effects
}
export const CHARACTER: Record<'calm' | 'attentive' | 'lively', Character> = {
  calm: { headMs: 300, dead: 8, blink: [5000, 8000], double: 0.08, breathe: 1.1, drift: 3, glance: [15000, 22000], nod: 5, tilt: 6, scan: [9000, 12000], flicker: null, shimmer: 0.006 },
  attentive: { headMs: 220, dead: 6, blink: [4000, 7000], double: 0.15, breathe: 1.5, drift: 4, glance: [10000, 15000], nod: 6, tilt: 7, scan: [6000, 8000], flicker: [20000, 40000], shimmer: 0.01 },
  lively: { headMs: 150, dead: 4, blink: [3000, 5500], double: 0.25, breathe: 2, drift: 6, glance: [6000, 9000], nod: 8, tilt: 9, scan: [3000, 4000], flicker: [5000, 7000], shimmer: 0.02 },
}

export const YAW_MAX = 28, PITCH_MAX = 8
const WAVE_AT = 350, WAVE_MS = 1900, THINK_AFTER = 1500, BRACE_MS = 1300, SHIVER_MS = 650, GRAB_MS = 260, TAP_MS = 460
const BLINK_MS = 180, NOD_MS = 420, POSE_MS = 520, PRESENT_MS = 1600, ASK_MS = 1000, GLITCH_MS = 180, GLANCE_MS = 1100, SCAN_MS = 1400, FLICKER_MS = 70

export interface Look { yaw: number; pitch: number }
export interface HeadIn {
  t: number; dt: number // ms
  look?: Look // explicit target (pointer, hover, drag); undefined = idle
  rest?: Look // where the head rests when idle (the target planet)
  glances: Look[] // other planets to glance at
  face: Face; eye?: RGB; tip: RGB
  hover?: boolean // pointer rests on a planet (thinks after THINK_AFTER)
  drag?: number // spin velocity (deg/ms) while dragging; undefined = not dragging
}

const pick = (r: () => number, [a, b]: [number, number]) => a + (b - a) * r()
const smooth = (u: number) => u * u * (3 - 2 * u)
function rng(seed: number) { let s = seed >>> 0 || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296) }

export class HeadCtl {
  c: Character
  private r: () => number
  private g: Gaze
  private pitch: Spring = { x: 0, v: 0 }
  private tilt: Spring = { x: 0, v: 0 }
  private pose: { from: Pose; to: Pose; t0: number; side: [number, number] } = { from: 'rest', to: 'rest', t0: -1e9, side: [1, 1] }
  private face: Face | undefined
  private shown: Face = 'idle' // face on screen: a new face swaps in under a blink
  private mouth: Spring = { x: 0, v: 0 }
  private eyeS: Spring = { x: 1, v: 0 }
  private trail: Spring = { x: 0, v: 0 } // arm lag behind a drag
  private spread: Spring = { x: 0, v: 0 } // claw opening with drag speed
  private waveAt = -1e9; private hoverAt: number | undefined; private failAt = -1e9; private grabAt = -1e9; private dragging = false
  private work: Pose = 'rest'
  private next = { blink: 0, glance: 0, scan: 0, flicker: 0 }
  private blinkAt = -1e9
  private blink2 = false
  private nodAt = -1e9; private askAt = -1e9; private glitchAt = -1e9; private presentAt = -1e9; private scanAt = -1e9; private flickAt = -1e9
  private glanceAt = -1e9; private glanceTo: Look | undefined
  private started = false

  greet: boolean
  constructor(c: Character = CHARACTER.attentive, seed = 7, greet = true) { this.c = c; this.r = rng(seed); this.g = gaze(0); this.greet = greet }

  // Episodic beats, called by the hero on events.
  nod(t: number) { this.nodAt = t }
  present(t: number) { this.presentAt = t; this.nodAt = t }
  ask(t: number) { this.askAt = t }

  private setPose(to: Pose, t: number, side = 1) {
    if (to === this.pose.to && side === this.pose.side[1]) return
    // Mid-blend: start from whichever pose dominates now.
    const k = this.poseK(t), back = k < 0.5
    this.pose = { from: back ? this.pose.from : this.pose.to, to, t0: t, side: [back ? this.pose.side[0] : this.pose.side[1], side] }
  }
  // Weight of a pose in the current blend.
  private poseW(p: Pose, k: number) { return (this.pose.to === p ? k : 0) + (this.pose.from === p ? 1 - k : 0) }
  private poseK(t: number) { return smooth(Math.max(0, Math.min(1, (t - this.pose.t0) / POSE_MS))) }

  private schedule(t: number) {
    const c = this.c
    this.next = { blink: t + pick(this.r, c.blink), glance: c.glance ? t + pick(this.r, c.glance) : Infinity, scan: c.scan ? t + pick(this.r, c.scan) : Infinity, flicker: c.flicker ? t + pick(this.r, c.flicker) : Infinity }
  }

  // Returns the frame and whether it needs full frame rate (springs or beats in motion).
  step(i: HeadIn): { frame: HeadFrame; busy: boolean } {
    const { t, dt } = i, c = this.c
    if (!this.started) {
      this.started = true; this.schedule(t); this.shown = i.face; this.mouth.x = FACE_STYLE[i.face].mouth
      if (i.rest) { this.g = gaze(i.rest.yaw); this.pitch.x = i.rest.pitch }
      if (this.greet) this.waveAt = t + WAVE_AT
    }

    // Face beats: entering fail glitches first, braces, then droops. The new face swaps in under a blink.
    if (i.face !== this.face) {
      if (this.face !== undefined) {
        if (i.face === 'fail') this.glitchAt = t
        if (i.face !== this.shown) { this.blinkAt = t; this.blink2 = false }
      }
      if (i.face === 'fail') this.failAt = t
      this.face = i.face
      this.work = i.face === 'fail' ? 'brace' : i.face === 'run' ? 'grab' : 'rest'
    }
    if (this.work === 'brace' && t - this.failAt >= BRACE_MS) this.work = 'droop'
    if (i.face !== this.shown && (t - this.blinkAt >= BLINK_MS * 0.4 || t - this.blinkAt < 0)) this.shown = i.face

    // Arm beats by priority: present, wave, think (long hover while idle), then the work pose.
    const presenting = t - this.presentAt < PRESENT_MS
    const waving = t >= this.waveAt && t - this.waveAt < WAVE_MS
    if (i.hover && !i.drag) this.hoverAt ??= t; else this.hoverAt = undefined
    const thinking = this.hoverAt !== undefined && t - this.hoverAt >= THINK_AFTER && i.face === 'idle'
    if (t - this.glitchAt >= GLITCH_MS) {
      if (presenting) this.setPose('present', t, this.pose.to === 'present' ? this.pose.side[1] : (i.look?.yaw ?? this.g.head.x) < 0 ? -1 : 1)
      else this.setPose(waving ? 'wave' : thinking ? 'think' : this.work, t)
    }

    // Drag: eyes widen on the grab, arms trail the spin, claws open with speed.
    const dragging = i.drag !== undefined
    if (dragging && !this.dragging) this.grabAt = t
    this.dragging = dragging
    const v = i.drag ?? 0
    spring(this.trail, Math.max(-0.28, Math.min(0.28, -v * 2.2)), 90, dt)
    spring(this.spread, Math.min(0.4, Math.abs(v) * 3), 90, dt)
    const eGoal = t - this.grabAt < GRAB_MS ? 1.28 : 1
    spring(this.eyeS, eGoal, 70, dt)

    // Periodic: blink, glance, scan, flicker.
    if (t >= this.next.blink) {
      this.blinkAt = t
      this.blink2 = this.r() < c.double
      this.next.blink = t + pick(this.r, c.blink)
    }
    if (this.blink2 && t - this.blinkAt > BLINK_MS + 90) { this.blinkAt = t; this.blink2 = false }
    if (t >= this.next.glance) {
      this.next.glance = c.glance ? t + pick(this.r, c.glance) : Infinity
      if (!i.look && i.glances.length) { this.glanceTo = i.glances[Math.floor(this.r() * i.glances.length)]; this.glanceAt = t }
    }
    if (t >= this.next.scan) { this.scanAt = t; this.next.scan = c.scan ? t + pick(this.r, c.scan) : Infinity }
    if (t >= this.next.flicker) { this.flickAt = t; this.next.flicker = c.flicker ? t + pick(this.r, c.flicker) : Infinity }

    // Gaze target: explicit look, else a glance, else rest with a slow drift.
    const glancing = !i.look && this.glanceTo && t - this.glanceAt < GLANCE_MS
    const drift = i.look ? 0 : c.drift * Math.sin(t / 2700) * Math.sin(t / 4100 + 1)
    const to = i.look ?? (glancing ? this.glanceTo! : i.rest ?? { yaw: 0, pitch: 0 })
    const yaw = Math.max(-YAW_MAX, Math.min(YAW_MAX, to.yaw + drift))
    let busy = stepGaze(this.g, yaw, dt, { eyeMs: 40, headMs: c.headMs, dead: c.dead, eyeMax: 12 })
    busy ||= !settled(this.trail, 0, 0.004) || !settled(this.spread, 0, 0.004) || !settled(this.eyeS, 1, 0.004) || dragging

    // Pitch: target + breathing + nod (dip with a small back-ease rebound).
    const u = (t - this.nodAt) / NOD_MS
    const nod = u >= 0 && u < 1 ? -c.nod * Math.sin(Math.PI * u) * (1 - 0.35 * u) + (u > 0.7 ? 0.8 * Math.sin(Math.PI * (u - 0.7) / 0.3) : 0) : 0
    const breathe = c.breathe * Math.sin((2 * Math.PI * 0.4 * t) / 1000)
    const think = this.pose.to === 'think' ? -2 : 0, droop = this.work === 'droop' ? -4 : 0
    const pGoal = Math.max(-PITCH_MAX, Math.min(PITCH_MAX, to.pitch)) + nod + think + droop
    spring(this.pitch, pGoal, 120, dt)
    busy ||= !settled(this.pitch, pGoal, 0.1) || (u >= 0 && u < 1)

    const tGoal = t - this.askAt < ASK_MS ? c.tilt : this.pose.to === 'think' ? 5 : this.pose.to === 'wave' ? -5 : 0
    spring(this.tilt, tGoal, 180, dt)
    busy ||= !settled(this.tilt, tGoal, 0.1)

    const bu = (t - this.blinkAt) / BLINK_MS
    const blink = bu >= 0 && bu < 1 ? (bu < 0.4 ? bu / 0.4 : 1 - (bu - 0.4) / 0.6) : 0
    const k = this.poseK(t)
    busy ||= k < 1 || blink > 0

    const gu = (t - this.glitchAt) / GLITCH_MS
    const glitch = gu >= 0 && gu < 1 ? 1 - gu : 0
    const su = (t - this.scanAt) / SCAN_MS
    const flicker = t - this.flickAt < FLICKER_MS ? 0.55 : 1
    busy ||= glitch > 0 || (su >= 0 && su < 1) || flicker < 1

    // Arms: idle sway out of phase with the breathing head, claws flexing; the work pose taps the table
    // (alternate claws, a spark on the tap); a fail shivers after the glitch. Wave rocks the waving claw.
    const sway = c.breathe / 2, w = (2 * Math.PI * 0.4 * t) / 1000
    const wGrab = this.poseW('grab', k), wWave = this.poseW('wave', k)
    const fu = (t - this.failAt - GLITCH_MS) / SHIVER_MS, shiver = fu >= 0 && fu < 1 ? 1 - fu : 0
    const dw: [number, number, number][] = [], open: [number, number] = [0, 0]
    let spark: HeadFrame['spark']
    for (const [n, sx] of [[0, -1], [1, 1]] as const) {
      const tap = Math.max(0, Math.sin((2 * Math.PI * t) / TAP_MS + (sx > 0 ? 0 : Math.PI))) ** 3 * wGrab
      const rock = sx > 0 ? wWave * Math.sin((2 * Math.PI * (t - this.waveAt)) / 520) : 0
      const sh = shiver * 0.045 * Math.sin((2 * Math.PI * t) / 70 + sx)
      dw.push([this.trail.x + sh + rock * 0.22, 0.035 * sway * Math.sin(w + Math.PI * 0.6 + sx * 0.4) - 0.09 * tap, rock * -0.05])
      open[n] = 0.07 * sway * Math.sin(t / 1300 + sx) + this.spread.x - 0.35 * tap
      if (tap > 0.55) spark = { side: sx, r: 0.075 * (tap - 0.55) / 0.45 }
    }
    busy ||= wGrab > 0 || shiver > 0 || wWave > 0

    // Face: mouth eases between faces and widens on present, wave and planet hover; happy eyes on the wave.
    const glad = this.shown !== 'fail' && (presenting || waving || i.hover) ? 0.35 : 0
    const mGoal = Math.min(1.1, FACE_STYLE[this.shown].mouth + glad)
    spring(this.mouth, mGoal, 110, dt)
    busy ||= !settled(this.mouth, mGoal, 0.01) || i.face !== this.shown

    const eyeX = this.g.eye.x / 12 * 3, eyeY = Math.max(-2, Math.min(2, (-this.pitch.x / PITCH_MAX) * 1.2 - ((to.pitch - this.pitch.x) / PITCH_MAX) * 2)) // face y is down, pitch down is negative
    const frame: HeadFrame = {
      yaw: this.g.head.x + shiver * 1.4 * Math.sin((2 * Math.PI * t) / 80), pitch: this.pitch.x + breathe, tilt: this.tilt.x, blink,
      gaze: [eyeX, eyeY], face: this.shown, pose: { from: this.pose.from, to: this.pose.to, k, side: this.pose.side },
      arms: { dw, open }, spark, mouth: this.mouth.x, eyeS: this.eyeS.x, eyes: wWave > 0.5 && this.shown === 'idle' ? 2 : undefined,
      eye: i.eye, tip: i.tip, hold: i.tip, glitch, flicker,
      scan: su >= 0 && su < 1 ? su : undefined, shimmer: c.shimmer,
    }
    return { frame, busy }
  }
}

// Screen point to head angles: yaw from x across the hero, pitch from y against the eye line.
export function lookAt(x: number, y: number, w: number, h: number, eyeY: number): Look {
  return {
    yaw: Math.max(-YAW_MAX, Math.min(YAW_MAX, ((x - w / 2) / (w / 2)) * YAW_MAX)),
    pitch: Math.max(-PITCH_MAX, Math.min(PITCH_MAX, ((eyeY - y) / (h / 2)) * PITCH_MAX)), // negative = down (GL: y up, camera on -z)
  }
}

// Bake fallback: pick a turned bake from a continuous yaw with hysteresis (turn past 10, back under 6).
export function bakeLook(yaw: number, prev: number): number {
  if (Math.abs(yaw) > 10) return Math.sign(yaw)
  if (Math.abs(yaw) < 6) return 0
  return prev
}

// Work face: the face follows the work, never the ask face (owner pref).
export const faceOf = (mood: string, working: boolean): Face => mood === 'fail' ? 'fail' : mood === 'run' || (mood === 'ask' && working) ? 'run' : 'idle'
