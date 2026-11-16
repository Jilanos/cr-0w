import './boot.css'
import { BUDGET_MS, SEEN_KEY, STEPS, delayOf, isReplay, pickBoot, type Fx } from './plan'

// Runs the trace boot with the Web Animations API once the Home and its hero are on screen.
// html[data-boot-wait] hides the app until the first frame of the boot is set.

const EASE = 'cubic-bezier(.2,.7,.2,1)'
// Home stays hidden at most this long; past it the page shows without the boot.
const WAIT_MS = 1000

interface Ctx { cw: string; line: string; panel: string }
interface Out { frames: Keyframe[]; ease?: string; cls?: string }

const SIZES = ['0 1px, 1px 0, 0 1px, 1px 0', '100% 1px, 1px 0, 0 1px, 1px 0', '100% 1px, 1px 100%, 0 1px, 1px 0',
  '100% 1px, 1px 100%, 100% 1px, 1px 0', '100% 1px, 1px 100%, 100% 1px, 1px 100%']

function typing(el: HTMLElement): Out {
  const range = document.createRange()
  range.selectNodeContents(el)
  const t = range.getBoundingClientRect(), b = el.getBoundingClientRect()
  const left = Math.max(0, t.left - b.left), end = Math.max(0, b.width - left - t.width)
  const n = Math.max(1, (el.textContent ?? '').trim().length)
  return {
    frames: [{ clipPath: `inset(-12px ${b.width - left}px -12px 0)` }, { clipPath: `inset(-12px ${end}px -12px 0)` }],
    ease: `steps(${n}, end)`,
  }
}

function fx(kind: Fx, el: HTMLElement, c: Ctx): Out {
  switch (kind) {
    case 'trace':
      return {
        cls: 'boot-tr', ease: 'linear',
        frames: [
          ...SIZES.map((s, i) => ({ backgroundSize: s, offset: i * 0.2, '--boot-c': c.cw, backgroundColor: 'transparent' })),
          { backgroundSize: SIZES[4], '--boot-c': c.line, backgroundColor: c.panel },
        ],
      }
    case 'fade':
    case 'fill': return { frames: [{ opacity: 0 }, { opacity: 1 }] }
    case 'resolve':
      return { frames: [
        { opacity: 0, filter: 'blur(12px) brightness(2.4)' },
        { opacity: 1, filter: 'blur(5px) brightness(1.6)', offset: 0.35 },
        { opacity: 1, filter: 'blur(0px) brightness(1)' },
      ] }
    case 'type': return typing(el)
  }
}

function run() {
  const html = document.documentElement
  const css = getComputedStyle(html)
  const tone = (v: string) => css.getPropertyValue(v).trim()
  const c: Ctx = { cw: tone('--c-w'), line: tone('--line'), panel: tone('--panel') }
  const anims: Animation[] = [], tagged: [HTMLElement, string][] = []
  for (const s of STEPS) {
    const els = [...document.querySelectorAll<HTMLElement>(s.sel)]
    els.forEach((el, i) => {
      const o = fx(s.fx, el, c)
      if (o.cls) { el.classList.add(o.cls); tagged.push([el, o.cls]) }
      anims.push(el.animate(o.frames, { delay: delayOf(s, i, els.length), duration: s.dur, easing: o.ease ?? EASE, fill: 'backwards' }))
    })
  }
  const t0 = performance.now()
  delete html.dataset.bootWait
  let over = false
  const done = () => {
    if (over) return
    over = true
    html.dataset.bootMs = String(Math.round(performance.now() - t0))
    for (const a of anims) a.cancel()
    for (const [el, k] of tagged) el.classList.remove(k)
    delete html.dataset.boot
  }
  Promise.all(anims.map((a) => a.finished)).then(done, done)
  const g = globalThis as { __nestBoot?: unknown; __nestBootHold?: boolean }
  // __nestBootHold: the reel script seeks the paused boot frame by frame and finishes it itself.
  if (!g.__nestBootHold) setTimeout(done, BUDGET_MS)
  g.__nestBoot = { anims, t0 }
}

export function startBoot() {
  let seen = false
  try { seen = sessionStorage.getItem(SEEN_KEY) === '1' } catch { /* storage blocked: treat as first load */ }
  const replay = isReplay(location.search)
  if (!pickBoot({ search: location.search, path: location.pathname, reduced: matchMedia('(prefers-reduced-motion: reduce)').matches, seen })) return
  if (!replay) {
    try { sessionStorage.setItem(SEEN_KEY, '1') } catch { /* storage blocked: boot may replay */ }
  }
  const html = document.documentElement
  html.dataset.boot = 'trace'
  html.dataset.bootWait = ''
  const start = performance.now()
  const ready = () => !!document.querySelector('.home-ph, .home-lp') && !!document.querySelector('.hero-box')
    && !!document.querySelector('.hero-say')?.textContent?.trim()
  const tick = () => {
    if (performance.now() - start > WAIT_MS) { delete html.dataset.boot; delete html.dataset.bootWait; return }
    if (!ready()) { requestAnimationFrame(tick); return }
    requestAnimationFrame(() => requestAnimationFrame(run))
  }
  document.fonts.ready.then(tick, tick)
}
