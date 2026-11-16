import './boot.css'
import { BUDGET_MS, OPTIONS, SEEN_KEY, delayOf, pickBoot, type BootId, type Fx, type Step } from './plan'

// Runs a boot option with the Web Animations API once the Home and its hero are on screen.
// html[data-boot-wait] hides the app until the first frame of the boot is set.

const EASE = 'cubic-bezier(.2,.7,.2,1)'
// Home stays hidden at most this long; past it the page shows without the boot.
const WAIT_MS = 1000

interface Ctx { cw: string; line: string; panel: string; hero: DOMRect | null }
interface Out { frames: Keyframe[]; ease?: string; cls?: string }

function unfold(el: HTMLElement, hero: DOMRect | null): Keyframe[] {
  const r = el.getBoundingClientRect()
  let axis = 'Y', origin = 'top'
  if (hero) {
    const overlapX = r.left < hero.right && r.right > hero.left
    if (overlapX) origin = r.top + r.height / 2 < hero.top + hero.height / 2 ? 'bottom' : 'top'
    else { axis = 'X'; origin = r.left < hero.left ? 'right' : 'left' }
  }
  return [
    { transform: `scale${axis}(0)`, opacity: 0, transformOrigin: origin },
    { transform: `scale${axis}(1)`, opacity: 1, transformOrigin: origin },
  ]
}

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

const SIZES = ['0 1px, 1px 0, 0 1px, 1px 0', '100% 1px, 1px 0, 0 1px, 1px 0', '100% 1px, 1px 100%, 0 1px, 1px 0',
  '100% 1px, 1px 100%, 100% 1px, 1px 0', '100% 1px, 1px 100%, 100% 1px, 1px 100%']

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
    case 'fill': return { frames: [{ opacity: 0 }, { opacity: 1 }] }
    case 'fade': return { frames: [{ opacity: 0 }, { opacity: 1 }] }
    case 'resolve':
      return { frames: [
        { opacity: 0, filter: 'blur(12px) brightness(2.4)' },
        { opacity: 1, filter: 'blur(5px) brightness(1.6)', offset: 0.35 },
        { opacity: 1, filter: 'blur(0px) brightness(1)' },
      ] }
    case 'emerge':
      return { frames: [
        { opacity: 0, filter: 'blur(12px) brightness(2.4)', transform: 'scale(.82)' },
        { opacity: 1, filter: 'blur(4px) brightness(1.5)', transform: 'scale(.96)', offset: 0.45 },
        { opacity: 1, filter: 'blur(0px) brightness(1)', transform: 'scale(1)' },
      ] }
    case 'type': return typing(el)
    case 'line':
      return { ease: 'linear', frames: [
        { opacity: 1, transform: 'scaleX(0)' },
        { opacity: 1, transform: 'scaleX(1)', offset: 0.25 },
        { opacity: 0.9, transform: 'scaleX(1) scaleY(1)', offset: 0.4 },
        { opacity: 0, transform: 'scaleX(1) scaleY(24)' },
      ] }
    case 'crt':
      return { frames: [
        { transform: 'scaleY(.004)', filter: 'brightness(4)', opacity: 1 },
        { transform: 'scaleY(1)', filter: 'brightness(1.8)', offset: 0.7 },
        { transform: 'scaleY(1)', filter: 'brightness(1)' },
      ] }
    case 'flash': return { frames: [{ borderColor: c.cw, boxShadow: `0 0 12px ${c.cw}` }, { borderColor: c.line, boxShadow: '0 0 0 transparent' }] }
    case 'unfold': return { frames: unfold(el, c.hero) }
    case 'down': return { frames: [{ transform: 'translateY(-100%)', opacity: 0 }, { transform: 'none', opacity: 1 }] }
    case 'up': return { frames: [{ transform: 'translateY(100%)', opacity: 0 }, { transform: 'none', opacity: 1 }] }
  }
}

function targets(s: Step, hero: DOMRect | null): HTMLElement[] {
  const els = [...document.querySelectorAll<HTMLElement>(s.sel)]
  if (s.order !== 'hero' || !hero) return els
  const hx = hero.left + hero.width / 2, hy = hero.top + hero.height / 2
  const d = (el: HTMLElement) => { const r = el.getBoundingClientRect(); return Math.hypot(r.left + r.width / 2 - hx, r.top + r.height / 2 - hy) }
  return els.sort((a, b) => d(a) - d(b))
}

function run(id: BootId) {
  const html = document.documentElement
  const css = getComputedStyle(html)
  const tone = (v: string) => css.getPropertyValue(v).trim()
  const hero = document.querySelector('.hero-box')?.getBoundingClientRect() ?? null
  const c: Ctx = { cw: tone('--c-w'), line: tone('--line'), panel: tone('--panel'), hero }
  const opt = OPTIONS[id]
  const extra: HTMLElement[] = []
  if (opt.steps.some((s) => s.sel === '.boot-line')) {
    const l = document.createElement('div'); l.className = 'boot-line'; l.setAttribute('aria-hidden', 'true')
    document.body.append(l); extra.push(l)
  }
  const anims: Animation[] = [], tagged: [HTMLElement, string][] = []
  for (const s of opt.steps) {
    const els = targets(s, hero)
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
    for (const el of extra) el.remove()
    delete html.dataset.boot
  }
  Promise.all(anims.map((a) => a.finished)).then(done, done)
  const g = globalThis as { __nestBoot?: unknown; __nestBootHold?: boolean }
  // __nestBootHold: the reel script seeks the paused boot frame by frame and finishes it itself.
  if (!g.__nestBootHold) setTimeout(done, BUDGET_MS)
  g.__nestBoot = { id, anims, t0 }
}

export function startBoot() {
  let seen = false
  try { seen = sessionStorage.getItem(SEEN_KEY) === '1' } catch { /* storage blocked: treat as first load */ }
  const id = pickBoot({ search: location.search, path: location.pathname, reduced: matchMedia('(prefers-reduced-motion: reduce)').matches, seen })
  if (!id) return
  if (!new URLSearchParams(location.search).has('boot')) {
    try { sessionStorage.setItem(SEEN_KEY, '1') } catch { /* storage blocked: boot may replay */ }
  }
  const html = document.documentElement
  html.dataset.boot = id
  html.dataset.bootWait = ''
  const start = performance.now()
  const ready = () => !!document.querySelector('.home-ph, .home-lp') && !!document.querySelector('.hero-box')
    && !!document.querySelector('.hero-say')?.textContent?.trim()
  const tick = () => {
    if (performance.now() - start > WAIT_MS) { delete html.dataset.boot; delete html.dataset.bootWait; return }
    if (!ready()) { requestAnimationFrame(tick); return }
    requestAnimationFrame(() => requestAnimationFrame(() => run(id)))
  }
  document.fonts.ready.then(tick, tick)
}
