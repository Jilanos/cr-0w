// Scan line boot (item_166, owner pick 2026-11-16). Plays on the first Home load of a session.
// Each step animates every element matching `sel`; delays spread over `spread` ms, so the end
// time does not depend on how many panels a screen has.

export const BUDGET_MS = 1500
export const SEEN_KEY = 'nest.boot'

export type Fx =
  | 'line' // a scan line opens across the screen
  | 'crt' // the app opens vertically from the scan line
  | 'flash' // borders flash the accent then settle
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
  { sel: '.boot-line', fx: 'line', at: 0, dur: 560 },
  { sel: '.app', fx: 'crt', at: 140, dur: 420 },
  { sel: FRAMES, fx: 'flash', at: 420, dur: 480 },
  { sel: '.hero-box', fx: 'resolve', at: 380, dur: 520 },
  { sel: '.hero-say', fx: 'type', at: 880, dur: 420 },
]

export const stepEnd = (s: Step) => s.at + (s.spread ?? 0) + s.dur
export const bootEnd = (steps: Step[] = STEPS) => Math.max(...steps.map(stepEnd))

// Delay of the i-th of n elements in a step.
export const delayOf = (s: Step, i: number, n: number) => s.at + (n > 1 ? ((s.spread ?? 0) * i) / (n - 1) : 0)

// Replay flag for recordings: ?boot=1 or ?boot=b plays on every load.
export const REPLAY = ['1', 'b']
export const isReplay = (search: string) => REPLAY.includes(new URLSearchParams(search).get('boot') ?? '')

// The real boot runs once per session. `real: false` turns it off (tests).
export function pickBoot(o: { search: string; path: string; reduced: boolean; seen: boolean; real?: boolean }): boolean {
  if (o.path !== '/' || o.reduced) return false
  if (isReplay(o.search)) return true
  return (o.real ?? true) && !o.seen
}
