// Boot sequence options (item_166). Three prototypes behind ?boot=a|b|c on the Home screen.
// Each step animates every element matching `sel`; delays spread over `spread` ms, so the end
// time does not depend on how many panels a screen has.

export type BootId = 'a' | 'b' | 'c'
export const BOOT_IDS: readonly BootId[] = ['a', 'b', 'c']
export const BUDGET_MS = 1500
export const SEEN_KEY = 'nest.boot'

export type Fx =
  | 'trace' // frame lines draw clockwise, then the fill and border settle
  | 'fill' // content fades in
  | 'fade'
  | 'resolve' // blurred and bright, then sharp
  | 'emerge' // resolve plus a small scale up
  | 'type' // text reveals one character at a time
  | 'line' // a scan line opens across the screen
  | 'crt' // the app opens vertically from the scan line
  | 'flash' // borders flash the accent then settle
  | 'unfold' // the element unfolds from the side that faces the hero
  | 'down' // slides in from above
  | 'up' // slides in from below

export interface Step {
  sel: string
  fx: Fx
  at: number
  dur: number
  spread?: number
  // hero: stagger by distance from the hero centre instead of DOM order.
  order?: 'dom' | 'hero'
}

export interface Option { id: BootId; name: string; note: string; steps: Step[] }

const FRAMES = '.pn, .hq'

export const OPTIONS: Record<BootId, Option> = {
  a: {
    id: 'a',
    name: 'Trace',
    note: 'Panel frames trace one after another, the hero resolves, then the prompt types in.',
    steps: [
      { sel: '.top, .tabbar', fx: 'fade', at: 0, dur: 220 },
      { sel: FRAMES, fx: 'trace', at: 40, dur: 380, spread: 320 },
      { sel: '.pn > *, .hq > *', fx: 'fill', at: 260, dur: 200, spread: 400 },
      { sel: '.hero-box', fx: 'resolve', at: 560, dur: 460 },
      { sel: '.hero-say', fx: 'type', at: 1000, dur: 380 },
    ],
  },
  b: {
    id: 'b',
    name: 'Scan line',
    note: 'One scan line opens the whole screen at once, frames flash, the hero sharpens, the prompt types.',
    steps: [
      { sel: '.boot-line', fx: 'line', at: 0, dur: 560 },
      { sel: '.app', fx: 'crt', at: 140, dur: 420 },
      { sel: FRAMES, fx: 'flash', at: 420, dur: 480 },
      { sel: '.hero-box', fx: 'resolve', at: 380, dur: 520 },
      { sel: '.hero-say', fx: 'type', at: 880, dur: 420 },
    ],
  },
  c: {
    id: 'c',
    name: 'Unfold',
    note: 'The hero appears first and types its line; panels unfold outward from it, header and tabs last.',
    steps: [
      { sel: '.hero-box', fx: 'emerge', at: 0, dur: 480 },
      { sel: '.hero-say', fx: 'type', at: 300, dur: 400 },
      { sel: '.hrow, .pn', fx: 'unfold', at: 420, dur: 360, spread: 380, order: 'hero' },
      { sel: '.top', fx: 'down', at: 760, dur: 320 },
      { sel: '.tabbar', fx: 'up', at: 760, dur: 320 },
    ],
  },
}

export const stepEnd = (s: Step) => s.at + (s.spread ?? 0) + s.dur
export const optionEnd = (o: Option) => Math.max(...o.steps.map(stepEnd))

// Delay of the i-th of n elements in a step.
export const delayOf = (s: Step, i: number, n: number) => s.at + (n > 1 ? ((s.spread ?? 0) * i) / (n - 1) : 0)

// The real boot is unset until the owner picks an option.
export const REAL_BOOT: BootId | null = null

// ?boot=x replays on every load (try-out flag). The real boot runs once per session.
export function pickBoot(o: { search: string; path: string; reduced: boolean; seen: boolean; real?: BootId | null }): BootId | null {
  if (o.path !== '/' || o.reduced) return null
  const flag = new URLSearchParams(o.search).get('boot')
  if (flag) return (BOOT_IDS as readonly string[]).includes(flag) ? (flag as BootId) : null
  const real = o.real === undefined ? REAL_BOOT : o.real
  return real && !o.seen ? real : null
}
