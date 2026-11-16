// Trace boot (item_166, owner pick 2026-11-16). Plays on the first Home load of a session.
// Each step animates every element matching `sel`; delays spread over `spread` ms, so the end
// time does not depend on how many panels a screen has.

export const BUDGET_MS = 1500
export const SEEN_KEY = 'nest.boot'

export type Fx =
  | 'fade'
  | 'trace' // frame lines draw clockwise, then the fill and border settle
  | 'fill' // content fades in
  | 'resolve' // blurred and bright, then sharp
  | 'type' // text reveals one character at a time

export interface Step {
  sel: string
  fx: Fx
  at: number
  dur: number
  spread?: number
}

const FRAMES = '.pn, .hq'

export const STEPS: Step[] = [
  { sel: '.top, .tabbar', fx: 'fade', at: 0, dur: 220 },
  { sel: FRAMES, fx: 'trace', at: 40, dur: 380, spread: 320 },
  { sel: '.pn > *, .hq > *', fx: 'fill', at: 260, dur: 200, spread: 400 },
  { sel: '.hero-box', fx: 'resolve', at: 560, dur: 460 },
  { sel: '.hero-say', fx: 'type', at: 1000, dur: 380 },
]

export const stepEnd = (s: Step) => s.at + (s.spread ?? 0) + s.dur
export const bootEnd = (steps: Step[] = STEPS) => Math.max(...steps.map(stepEnd))

// Delay of the i-th of n elements in a step.
export const delayOf = (s: Step, i: number, n: number) => s.at + (n > 1 ? ((s.spread ?? 0) * i) / (n - 1) : 0)

// Replay flag for recordings: ?boot=1 or ?boot=a plays on every load.
export const REPLAY = ['1', 'a']
export const isReplay = (search: string) => REPLAY.includes(new URLSearchParams(search).get('boot') ?? '')

// The real boot runs once per session. `real: false` turns it off (tests).
export function pickBoot(o: { search: string; path: string; reduced: boolean; seen: boolean; real?: boolean }): boolean {
  if (o.path !== '/' || o.reduced) return false
  if (isReplay(o.search)) return true
  return (o.real ?? true) && !o.seen
}
