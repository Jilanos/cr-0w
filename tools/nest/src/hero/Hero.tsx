import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react'
import type { UiState } from '../data/state'
import { lastRun, openInbox } from '../data/state'
import type { InboxItem, Mission, SectionBody, SectionName } from '../data/types'
import { ago, title } from '../format'
import { navigate } from '../router'
import { Glyph } from '../ui/Glyph'
import { useMedia } from '../ui/useMedia'
import { heroLiveOf, heroModel, type HeroAgent } from './model'
import { declutterDom, type Box } from './declutter'
import { DEG_PER_WIDTH, detent, liftCurve, spinToFront, step, stepTo, type Spin } from './motion'
import type { Heads, Palette, PlanetLabel, SceneOut } from './scene'
import { drawScene, TABLE_FX } from './scene'
import { createHead, liveHeadOk, type HeadGL } from './gl/head'
import { bakeLook, CHARACTER, faceOf, HeadCtl, lookAt, PITCH_MAX, type Look } from './headCtl'

// Holotable hero (item_162, item_158): ASCII galaxy map of projects with the option B head above
// the lens. Drag spins the planets, hover lifts one and shows its moons, click focuses then opens.
// The frame loop only runs while something moves; otherwise it sleeps (0 fps).

type RGB = [number, number, number]
const VARS: Record<UiState, string> = { needs: '--c-n', working: '--c-w', failed: '--c-f', sleeping: '--c-s', queued: '--c-q', done: '--c-d' }
const PULSE_MS = 2400
const PULSE_FRAME_MS = 100
// With the live head the table no longer draws head glyphs, so its idle tick can run at 15 fps.
const TABLE_FRAME_MS = 66
// Live head: 30 fps while springs or beats move, 20 fps when settled (breathing only).
const HEAD_IDLE_MS = 50, HEAD_AMBIENT_MS = 33, HEAD_LIVE_MS = 1500
const RIPPLE_MS = 700
// Idle scan sweep round the table rim (item_197): one turn per SWEEP_MS, on the slow tick.
const SWEEP_MS = 12000
// Gaze during a drag and its coast (item_201): max head turn (deg), look down at the table (deg), and the
// table angle (deg) over which the head reaches most of its turn.
const GAZE_MAX = 14, GAZE_DOWN = -PITCH_MAX, GAZE_TURN = 40
const LIFT_MS = 420
const GLITCH_MS = 180
const HOVER_MS = 200
const DRAG_PX = 6

function readPalette(el: Element): Palette {
  const cs = getComputedStyle(el)
  const ctx = document.createElement('canvas').getContext('2d')
  const rgb = (name: string, fb: RGB): RGB => {
    const v = cs.getPropertyValue(name).trim()
    if (!v || !ctx) return fb
    ctx.fillStyle = '#000'; ctx.fillStyle = v
    const s = ctx.fillStyle
    if (s.startsWith('#')) { const n = parseInt(s.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255] }
    const m = s.match(/[\d.]+/g)
    return m ? [+m[0], +m[1], +m[2]] : fb
  }
  const state = {} as Record<UiState, RGB>
  const FB: Record<UiState, RGB> = { needs: [255, 184, 0], working: [46, 242, 255], failed: [255, 46, 99], sleeping: [111, 134, 184], queued: [138, 160, 200], done: [95, 120, 168] }
  for (const k of Object.keys(VARS) as UiState[]) state[k] = rgb(VARS[k], FB[k])
  return { ring: rgb('--c-w', [79, 195, 255]), dim: rgb('--dim', [95, 120, 168]), fg: rgb('--fg', [216, 230, 255]), accent: rgb('--accent', [192, 92, 255]), state }
}

const hit = (out: SceneOut | undefined, x: number, y: number): PlanetLabel | undefined => {
  if (!out) return undefined
  let best: PlanetLabel | undefined, d = Infinity
  for (const p of out.planets) {
    const dd = Math.hypot(x - p.cx, y - p.cy)
    if (dd < p.rad + 8 && dd < d) { d = dd; best = p }
  }
  return best
}
const onHead = (out: SceneOut | undefined, x: number, y: number) =>
  !!out && x > out.head.left + 30 && x < out.head.right - 30 && y > out.head.top && y < out.lens.y + 10

export const missionsHref = (project: string) => `/missions?project=${encodeURIComponent(project)}`

// Detail card for the focused planet: open missions, what waits on you, last run.
// Small heroes (phone, inner panel) get a compact card: one ask, two missions.
function Card({ project, missions, inbox, agents, now, at, w }: { project: string; missions: Mission[]; inbox: InboxItem[]; agents: HeroAgent[]; now: Date; at: PlanetLabel; w: number }) {
  const nA = w < 760 ? 1 : 2, nM = w < 760 ? 2 : 4
  const ms = missions.filter((m) => m.project === project && m.state !== 'done' && m.state !== 'cancelled')
  const asks = openInbox(inbox).filter((r) => r.project === project && r.type !== 'fyi')
  const runs = missions.filter((m) => m.project === project).flatMap((m) => m.runs.map((r) => ({ r, m }))).sort((a, b) => b.r.started.localeCompare(a.r.started))
  const last = runs[0]
  const left = Math.max(8, Math.min(w - 248, at.cx - 120))
  const lastTxt = last && `Last run ${last.r.ended ? ago(last.r.ended, now) : 'live'}${last.r.cause && last.r.cause !== 'done' ? ` · ${last.r.cause}${last.r.exit ? ` (exit ${last.r.exit})` : ''}` : ''}`
  // Phone: one line docked at the hero bottom keeps the head and planets clear.
  if (w < 480) {
    const ask = asks[0], top = ms[0], ag = agents[0]
    const detail = ask ? `Your move · ${ask.ask}` : top ? `${ms.length} open · ${title(top)}` : ag ? `${agentWord(ag)} · ${ag.title}` : lastTxt
    return (
      <button type="button" className="hero-card strip" data-prio={1} data-fixed onClick={() => navigate(missionsHref(project))} aria-label={`Open ${project} missions`}>
        <span className="hc-h"><Glyph state={at.state} /> {project.toUpperCase()}
          {detail && <span className={`hc-t hc-n${ask ? ' c-n' : ''}`}>{detail}</span>}
          <span className="hc-go">open →</span></span>
      </button>
    )
  }
  return (
    <button type="button" className="hero-card" data-prio={1} data-up={2 * at.rad + 28} style={{ left, top: at.cy + at.rad + 14, '--cx': `${at.cx}px`, '--cy': `${at.cy}px`, '--r': `${at.rad}px` } as CSSProperties} onClick={() => navigate(missionsHref(project))} aria-label={`Open ${project} missions`}>
      <span className="hc-h"><Glyph state={at.state} /> {project.toUpperCase()}<span className="hc-go">open →</span></span>
      {asks.slice(0, nA).map((r) => <span key={r.id} className="hc-r c-n"><span className="hc-t">Your move · {r.ask}</span></span>)}
      {agents.slice(0, nM).map((a) => <span key={a.pid} className={`hc-r${a.state === 'needs' ? ' c-n' : ''}`}><Glyph state={a.state} /> <span className="hc-t">{agentWord(a)} · {a.title}</span></span>)}
      {ms.slice(0, Math.max(0, nM - agents.length)).map((m) => <span key={m.id} className="hc-r"><Glyph state={stateOf(m)} /> <span className="hc-t">{title(m)}</span></span>)}
      {(ms.length + agents.length > nM || asks.length > nA) && <span className="hc-r dim">+{Math.max(0, ms.length + agents.length - nM) + Math.max(0, asks.length - nA)} more</span>}
      {last && (
        <span className={`hc-r dim${at.state === 'failed' ? ' c-f' : ''}`}>
          {lastTxt}
        </span>
      )}
    </button>
  )
}
const agentWord = (a: HeroAgent) => (a.state === 'needs' ? 'Waits on you' : a.kind === 'run' ? 'Run' : 'Session')
const stateOf = (m: Mission): UiState =>
  m.state === 'failed' ? 'failed' : m.state === 'waiting' || m.state === 'review' ? 'needs' : m.state === 'queued' ? (lastRun(m)?.cause === 'usage_limit' ? 'sleeping' : 'queued') : m.state === 'done' ? 'done' : 'working'

// say replaces the model's line (phone Home counts sessions and checks too).
// sections: the live script sections (projects, dispatch, sessions) the planets read besides missions.
export function Hero({ missions, inbox, now, say, sections }: { missions: Mission[]; inbox: InboxItem[]; now: Date; say?: string; sections?: Partial<Record<SectionName, SectionBody>> }) {
  const liveIn = useMemo(() => heroLiveOf(sections), [sections])
  const m = useMemo(() => heroModel(missions, inbox, liveIn, now), [missions, inbox, liveIn, now])
  const reduced = useMedia('(prefers-reduced-motion: reduce)')
  const box = useRef<HTMLDivElement>(null)
  const cv = useRef<HTMLCanvasElement>(null)
  const [heads, setHeads] = useState<Heads>()
  const [size, setSize] = useState<{ w: number; h: number }>()
  const [theme, setTheme] = useState(() => document.documentElement.dataset.theme)
  const [out, setOut] = useState<SceneOut>()
  const [turn, setTurn] = useState<{ l: Heads; r: Heads }>()
  const [focus, setFocus] = useState<string>()

  // Mutable frame state: read by the loop without re-rendering.
  const st = useRef({
    spin: { spin: 0, vel: 0 } as Spin, drag: undefined as undefined | { id: number; x0: number; x: number; t: number; spin0: number; moved: boolean },
    hover: undefined as undefined | { name: string; k: number; dir: 1 | -1 }, look: undefined as number | undefined,
    lift: {} as Record<string, number>, glitch: {} as Record<string, number>, prev: undefined as Map<string, UiState> | undefined,
    raf: 0, timer: 0, last: 0, pal: undefined as Palette | undefined, out: undefined as SceneOut | undefined,
    ptr: undefined as { x: number; y: number } | undefined, coast: false, grab: undefined as number | undefined, ripple: undefined as { name: string; k: number } | undefined,
  })
  const gcv = useRef<HTMLCanvasElement>(null)
  // Live head state: the GL renderer, its controller and its own loop (item_156/196/198).
  const hd = useRef({
    gl: null as HeadGL | null, ctl: new HeadCtl(CHARACTER.lively),
    raf: 0, timer: 0, last: 0, lay: '', asks: -1, input: -1e9,
  })
  const [glOn, setGlOn] = useState(false)

  useEffect(() => {
    let live = true
    import('./heads.json').then((d) => live && setHeads(d.default as unknown as Heads))
    // Same head turned 20 degrees, to look toward a planet.
    Promise.all([import('./heads-l.json'), import('./heads-r.json')]).then(([l, r]) => live && setTurn({ l: l.default as unknown as Heads, r: r.default as unknown as Heads }))
    return () => { live = false }
  }, [])

  useEffect(() => {
    const el = box.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setSize({ w: Math.round(e.contentRect.width), h: Math.round(e.contentRect.height) }))
    ro.observe(el)
    const mo = new MutationObserver(() => setTheme(document.documentElement.dataset.theme))
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => { ro.disconnect(); mo.disconnect(); cancelAnimationFrame(st.current.raf); clearTimeout(st.current.timer) }
  }, [])

  // Live head: created once when the device can run it; a lost context falls back to the bake.
  useEffect(() => {
    const c = gcv.current
    if (!c || reduced || !liveHeadOk()) return
    const h = hd.current
    h.gl = createHead(c, () => { h.gl = null; setGlOn(false) })
    setGlOn(!!h.gl)
    return () => { cancelAnimationFrame(h.raf); clearTimeout(h.timer); h.raf = 0; h.timer = 0; h.gl?.dispose(); h.gl = null; h.lay = ''; setGlOn(false) }
  }, [reduced])

  const live = m.projects.some((p) => p.state === 'working')
  const a0s = () => (st.current.out?.planets ?? []).map((p) => p.a0)

  // One frame. Returns true when another frame is needed now (not the slow pulse).
  const frame = (t: number) => {
    const s = st.current
    if (!cv.current || !box.current || !size || size.w < 50) return false
    const dt = s.last ? Math.min(t - s.last, 64) : 16
    s.last = t
    let busy = false
    if (!s.drag && (s.spin.vel !== 0 || s.spin.to !== undefined)) {
      if (reduced) { s.spin.vel = 0; if (s.spin.to !== undefined) { s.spin.spin = s.spin.to; s.spin.to = undefined } }
      else busy = step(s.spin, dt, a0s()) || busy
    }
    if (s.drag) busy = true
    if (!s.drag?.moved && !s.coast) s.grab = undefined
    // Coast after a drag: the gaze keeps following the spin until the table settles (item_201).
    if (s.coast) {
      if (s.drag || (s.spin.vel === 0 && s.spin.to === undefined)) s.coast = false
      else { hd.current.input = t; headKick() }
    }
    if (s.hover) {
      const k = Math.max(0, Math.min(1, s.hover.k + (reduced ? s.hover.dir : (s.hover.dir * dt) / HOVER_MS)))
      s.hover.k = k
      if (k === 0 && s.hover.dir < 0) s.hover = undefined
      else if (k > 0 && k < 1) busy = true
    }
    if (s.ripple) { s.ripple.k += dt / RIPPLE_MS; if (s.ripple.k >= 1) s.ripple = undefined; else busy = true }
    // Bake fallback: the turned bake from a continuous yaw, with hysteresis so it never flips back and forth.
    if (!glOn) { const y = want()?.yaw; s.look = y === undefined ? undefined : bakeLook(y, s.look ?? 0) }
    for (const [map, ms] of [[s.lift, LIFT_MS], [s.glitch, GLITCH_MS]] as const) {
      for (const n of Object.keys(map)) {
        map[n] += dt / ms
        if (map[n] >= 1) delete map[n]
        else busy = true
      }
    }
    s.pal ??= readPalette(box.current)
    const lift: Record<string, number> = {}
    for (const n of Object.keys(s.lift)) lift[n] = liftCurve(s.lift[n])
    const glitch: Record<string, number> = {}
    for (const n of Object.keys(s.glitch)) glitch[n] = 1 - s.glitch[n]
    const o = drawScene(cv.current, size.w, size.h, window.devicePixelRatio || 1, m, heads, s.pal, turn, {
      now, spin: s.spin.spin, hover: s.hover && { name: s.hover.name, k: s.hover.k },
      look: s.look, pulse: live && !reduced ? (t % PULSE_MS) / PULSE_MS : undefined, lift, glitch,
      sweep: reduced ? undefined : (t % SWEEP_MS) / SWEEP_MS,
      t: reduced ? 0 : t, fx: reduced ? {} : TABLE_FX, ripple: s.ripple, live: glOn,
    })
    s.out = o
    placeHead(o)
    setOut(o)
    return busy
  }

  // Where the head wants to look: the drag direction, the hovered planet, then the pointer.
  // undefined = idle (the controller rests on the target planet and glances at the others).
  const headLook = (x: number, y: number) => {
    const o = st.current.out!
    return lookAt(x, y, size!.w, size!.h, o.head.top + o.head.hh * 0.45)
  }
  // Drag and coast gaze (item_201): the head looks down at the table and turns with it, a few degrees at
  // most, then eases back once the table stops. Spin up moves the front planets left; negative yaw looks left.
  const spinGaze = (): Look => {
    const s = st.current
    s.grab ??= s.spin.spin
    return { yaw: -GAZE_MAX * Math.tanh((s.spin.spin - s.grab) / GAZE_TURN), pitch: GAZE_DOWN }
  }
  const want = (): Look | undefined => {
    const s = st.current, o = s.out
    if (!o || !size) return undefined
    // Drag and coast: the gaze follows the spin, not the hand (item_201).
    if (s.drag?.moved || s.coast) return spinGaze()
    const hv = s.hover && s.hover.dir > 0 ? o.planets.find((p) => p.name === s.hover!.name) : undefined
    if (hv) return headLook(hv.cx, hv.cy)
    if (s.ptr && glOn) return headLook(s.ptr.x, s.ptr.y)
    return undefined
  }

  // Head canvas placement: the bake's cell grid, under the table canvas.
  const placeHead = (o: SceneOut) => {
    const h = hd.current, c = gcv.current
    if (!h.gl || !c) return
    const dpr = window.devicePixelRatio || 1, k = `${o.head.cw},${o.head.font},${dpr}`
    const L = h.gl.layout({ cw: o.head.cw, ch: o.head.ch, font: o.head.font, dpr })
    if (h.lay !== k) { h.lay = k; c.style.width = `${L.w}px`; c.style.height = `${L.h}px` }
    c.style.left = `${o.head.left - L.ox}px`; c.style.top = `${o.head.top - L.oy}px`
    headKick()
  }

  // One head frame. Returns true while springs or beats move.
  const headFrame = (t: number) => {
    const h = hd.current, s = st.current, o = s.out
    if (!h.gl || h.gl.lost() || !o || !size) return false
    const dt = h.last ? Math.min(t - h.last, 100) : 16
    h.last = t
    if (h.asks >= 0 && m.asks > h.asks) h.ctl.ask(t)
    h.asks = m.asks
    const tgt = o.planets.find((p) => p.target)
    const pal = s.pal, face = faceOf(m.mood, live)
    // Fail and run eyes take their mood colour (red, cyan); calmer faces take the watched planet's state.
    const eye = !pal ? undefined : face === 'fail' ? pal.state.failed : face === 'run' ? pal.state.working : tgt && pal.state[tgt.state]
    const { frame: f, busy } = h.ctl.step({
      t, dt, look: want(), rest: tgt ? headLook(tgt.cx, tgt.cy) : undefined,
      glances: o.planets.filter((p) => !p.hidden && p !== tgt).map((p) => headLook(p.cx, p.cy)),
      face, eye, tip: pal?.state.working ?? [46, 242, 255],
      hover: !!s.hover && s.hover.dir > 0, drag: s.drag?.moved ? s.spin.vel : undefined,
    })
    h.gl.render(f, t / 1000)
    return busy
  }
  // The loops outlive a render (a pending rAF or timer keeps the closure it was made in), so they
  // call the latest frame functions and flags through this ref, never a stale size or glOn.
  const cur = useRef({ frame, headFrame, reduced, glOn })
  cur.current = { frame, headFrame, reduced, glOn }
  // Head loop: every display frame while it answers an input, 30 fps for ambient moves (drift, blinks),
  // 20 fps settled, stopped while the page is hidden.
  const headKick = () => {
    const h = hd.current
    if (!h.gl || h.raf) return
    // An input wakes the head on the next display frame, not after the idle tick.
    if (h.timer) { clearTimeout(h.timer); h.timer = 0 }
    h.raf = requestAnimationFrame((t) => {
      h.raf = 0
      if (document.visibilityState !== 'visible') { h.last = 0; return }
      const busy = cur.current.headFrame(t)
      if (busy && t - h.input < HEAD_LIVE_MS) headKick()
      else h.timer = window.setTimeout(() => { h.timer = 0; headKick() }, busy ? HEAD_AMBIENT_MS : HEAD_IDLE_MS)
    })
  }
  useEffect(() => {
    const v = () => { if (document.visibilityState === 'visible') { kick(); headKick() } }
    document.addEventListener('visibilitychange', v)
    return () => document.removeEventListener('visibilitychange', v)
  })

  // Wake the loop. Fast frames while busy; a slow tick for the sweep and the working pulse.
  const kick = () => {
    const s = st.current
    clearTimeout(s.timer)
    if (s.raf) return
    const loop = (t: number) => {
      s.raf = 0
      const c = cur.current
      if (c.frame(t)) { s.raf = requestAnimationFrame(loop); return }
      s.last = 0
      if (!c.reduced && document.visibilityState === 'visible') s.timer = window.setTimeout(() => kick(), c.glOn ? TABLE_FRAME_MS : PULSE_FRAME_MS)
    }
    s.raf = requestAnimationFrame(loop)
  }

  // Data changes: start a lift (entered needs you) or a glitch (entered failed), then redraw.
  const minute = Math.floor(now.getTime() / 60000)
  const key = JSON.stringify([m.mood, minute, m.projects.map((p) => [p.name, p.state, p.open, p.wait, p.runFrom, p.cause])])
  useLayoutEffect(() => {
    const s = st.current
    const cur = new Map(m.projects.map((p) => [p.name, p.state]))
    if (s.prev && !reduced) for (const [n, state] of cur) {
      if (s.prev.get(n) === state) continue
      if (state === 'needs') s.lift[n] = 0
      if (state === 'failed') s.glitch[n] = 0
    }
    s.prev = cur
    s.pal = undefined
    document.fonts.ready.then(kick)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, size, theme, heads, turn, live, reduced, glOn])

  // Turn to a planet: ease (or step) the spin so it sits at the front.
  const bring = (name: string) => {
    const s = st.current, p = s.out?.planets.find((q) => q.name === name)
    if (!p) return
    s.spin.vel = 0
    s.spin.to = spinToFront(p.a0, s.spin.spin)
    if (reduced) { s.spin.spin = s.spin.to; s.spin.to = undefined }
    kick()
  }
  const setHover = (name: string | undefined) => {
    const s = st.current
    if (s.hover && name === s.hover.name && s.hover.dir > 0) return
    if (name) s.hover = { name, k: s.hover?.name === name ? s.hover.k : 0, dir: 1 }
    else if (s.hover) s.hover.dir = -1
    // The head looks at the hovered planet (want()); on leave it turns back to the longest wait.
    kick(); headKick()
  }
  const select = (name: string) => {
    if (focus === name) { navigate(missionsHref(name)); return }
    setFocus(name); setHover(name); bring(name)
    // Acknowledge: nod and present toward the planet; a ripple runs from its footprint.
    if (!reduced) { st.current.ripple = { name, k: 0 }; hd.current.input = performance.now(); hd.current.ctl.present(performance.now()); headKick() }
  }
  const clear = () => { setFocus(undefined); setHover(undefined) }

  const local = (e: PointerEvent) => { const r = box.current!.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top } }
  const down = (e: PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('.hero-card, .hero-chip')) return
    const s = st.current
    s.drag = { id: e.pointerId, x0: e.clientX, x: e.clientX, t: e.timeStamp, spin0: s.spin.spin, moved: false }
    s.spin.vel = 0; s.spin.to = undefined
  }
  const move = (e: PointerEvent<HTMLDivElement>) => {
    const s = st.current, d = s.drag
    hd.current.input = performance.now()
    if (d && d.id === e.pointerId) {
      if (!d.moved && Math.abs(e.clientX - d.x0) > DRAG_PX) { d.moved = true; box.current?.setPointerCapture(e.pointerId) }
      if (d.moved && size) {
        const dt = Math.max(1, e.timeStamp - d.t)
        const v = (((e.clientX - d.x) / size.w) * DEG_PER_WIDTH) / dt
        s.spin.vel = 0.6 * v + 0.4 * s.spin.vel
        d.x = e.clientX; d.t = e.timeStamp
        s.spin.spin = d.spin0 + ((e.clientX - d.x0) / size.w) * DEG_PER_WIDTH
        s.ptr = local(e)
        kick(); headKick()
        return
      }
    }
    if (e.pointerType !== 'mouse' || d?.moved) return
    const { x, y } = local(e)
    s.ptr = { x, y }; headKick()
    // Over a moon of the hovered planet: keep the hover.
    if (st.current.out?.moons.some((o) => Math.hypot(x - o.x, y - o.y) < o.r + 4)) return
    const p = hit(st.current.out, x, y)
    if (p?.name !== st.current.hover?.name || !p) { if (!focus || p) setHover(p?.name ?? focus) }
    if (box.current) box.current.style.cursor = p || onHead(st.current.out, x, y) ? 'pointer' : 'grab'
  }
  const up = (e: PointerEvent<HTMLDivElement>) => {
    const s = st.current, d = s.drag
    if (!d || d.id !== e.pointerId) return
    s.drag = undefined
    if (d.moved) {
      s.coast = true
      // Release: inertia then detent; the head turns back to the longest wait.
      if (e.timeStamp - d.t > 80) s.spin.vel = 0
      if (reduced) s.spin.vel = 0
      if (s.spin.vel === 0) s.spin.to = detent(a0s(), s.spin.spin)
      kick()
      return
    }
    const { x, y } = local(e)
    const p = hit(s.out, x, y)
    if (p) select(p.name)
    else if (onHead(s.out, x, y)) navigate('/desk')
    else clear()
  }
  const cancel = () => { const s = st.current; if (s.drag?.moved) { s.spin.vel = 0; s.spin.to = detent(a0s(), s.spin.spin); kick() } s.drag = undefined }
  const leave = (e: PointerEvent<HTMLDivElement>) => { st.current.ptr = undefined; if (e.pointerType === 'mouse' && !st.current.drag) setHover(focus) }

  const key2 = (e: KeyboardEvent<HTMLDivElement>) => {
    const ps = st.current.out?.planets ?? []
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault()
      const n = stepTo(ps, st.current.spin.spin, focus, e.key === 'ArrowRight' ? 1 : -1)
      if (n) { setFocus(n); setHover(n); bring(n) }
    } else if (e.key === 'Enter' && focus) { e.preventDefault(); navigate(missionsHref(focus)) }
    else if (e.key === 'Escape' && focus) { e.preventDefault(); clear() }
  }

  // Measured overlay layout: nothing over the head, the planets, the moons or another label.
  useLayoutEffect(() => {
    if (!box.current || !out) return
    const disc = (x: number, y: number, r: number): Box => ({ x: x - r, y: y - r, w: 2 * r, h: 2 * r })
    const head: Box = { x: out.head.left + 30, y: out.head.top, w: Math.max(0, out.head.right - out.head.left - 60), h: 2 * (out.head.y - out.head.top) }
    const root = box.current, obs = [head, ...out.planets.map((p) => p.hidden ? disc(-99, -99, 0) : disc(p.cx, p.cy, p.rad)), ...out.moons.map((o) => disc(o.x, o.y, o.r + 6))]
    declutterDom(root, obs)
    // Web fonts change label widths: measure again once they are in.
    let on = true
    document.fonts?.ready.then(() => { if (on) declutterDom(root, obs) })
    return () => { on = false }
  })

  const fp = focus ? out?.planets.find((p) => p.name === focus) : undefined
  const hname = st.current.hover?.name
  const hp = hname ? out?.planets.find((p) => p.name === hname) : undefined
  return (
    <div ref={box} className="hero-box" tabIndex={0} role="group" aria-roledescription="holotable"
      aria-label={`CR-0W: ${say ?? m.line}. Left and Right pick a project, Enter opens its missions.`}
      style={out ? ({ '--lens-y': `${out.lens.y}px` } as CSSProperties) : undefined}
      onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={cancel} onPointerLeave={leave} onKeyDown={key2}>
      <canvas ref={gcv} className="hero-gl" aria-hidden="true" style={glOn ? undefined : { display: 'none' }} />
      <canvas ref={cv} className="hero-cv" aria-hidden="true" />
      <div className="hero-say" data-prio={0} data-fixed aria-hidden="true"><b>CR-0W ›</b> {say ?? m.line}<i className="hero-cur" /></div>
      {out?.planets.map((p, i) => (
        <Fragment key={p.name}>
          {!p.hidden && (
            <div className={`hero-pl ${p.side}${p.target || p.name === focus ? ' on' : ''}`} style={{ left: p.x, top: p.y }} data-c={`${Math.round(p.cx)},${Math.round(p.cy)}`} data-prio={p.name === focus ? 2 : 4} data-own={1 + i} aria-hidden="true">
              {p.name.toUpperCase()}
              {p.note && <span style={{ color: `var(${VARS[p.state]})` }}> · {p.note}</span>}
            </div>
          )}
        </Fragment>
      ))}
      {out?.more && <div className="hero-rim" style={{ left: out.more.x, top: out.more.y }} data-prio={7} data-hide aria-hidden="true">+{out.more.n}</div>}
      {hp && out?.moons.map((o) => {
        const l = o.x < hp.cx
        return (
          <div key={o.id} className={`hero-ml${l ? ' l' : ''}`} style={{ left: o.x + (l ? -1 : 1) * (o.r + 12), top: o.y }} data-prio={2.5} data-hide aria-hidden="true">
            <Glyph state={o.state} size={11} /> <span>{o.title}</span>
          </div>
        )
      })}
      {m.asks > 0 && out && (
        <div className="hero-chip" data-prio={0} data-fixed style={{ left: Math.min(out.head.right - 40, (size?.w ?? 0) - 60), top: out.head.top + 40 }} aria-hidden="true">
          {m.asks} {m.asks === 1 ? 'ASK' : 'ASKS'}
        </div>
      )}
      {fp && size && <Card project={fp.name} missions={missions} inbox={inbox} agents={m.projects.find((p) => p.name === fp.name)?.agents ?? []} now={now} at={fp} w={size.w} />}
      {/* Screen readers and keyboard users get the planets as a plain list. */}
      <ul className="vh">
        {m.projects.map((p) => (
          <li key={p.name}><a href={missionsHref(p.name)} onClick={(e) => { e.preventDefault(); navigate(missionsHref(p.name)) }}>
            {p.name}: {p.state === 'needs' ? 'needs you' : p.state}, {p.open} open
          </a></li>
        ))}
      </ul>
    </div>
  )
}
