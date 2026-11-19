import { useEffect, useRef, useState } from 'react'
import { createHead, liveHeadOk, type HeadGL } from './gl/head'
import { CHARACTER, faceOf, HeadCtl } from './headCtl'
import { watchActive } from './active'
import type { Mood } from './model'

type RGB = [number, number, number]

// Head grid of the bake plus its margins (gl/head.ts BAKE and MARGIN), cell ratio 4:7.
const COLS = 216 + 2 * 10
const FONT_PER_CW = 6.65 / 4
const IDLE_MS = 50, AMBIENT_MS = 33

function cssRgb(name: string, fb: RGB): RGB {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  const ctx = document.createElement('canvas').getContext('2d')
  if (!v || !ctx) return fb
  ctx.fillStyle = '#000'; ctx.fillStyle = v
  const s = ctx.fillStyle
  if (s.startsWith('#')) { const n = parseInt(s.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255] }
  const m = s.match(/[\d.]+/g)
  return m ? [+m[0], +m[1], +m[2]] : fb
}

// The droid head alone, for the butler rail (item_176). Same renderer and controller as the
// Home hero, no table: it idles, blinks, and nods when a new ask lands. Without WebGL or with
// reduced motion it shows nothing and the rail keeps its mood diamond. It stops while off screen,
// in a hidden tab or an unfocused window.
export function RailHead({ mood, working, asks }: { mood: Mood; working: boolean; asks: number }) {
  const box = useRef<HTMLDivElement>(null)
  const cv = useRef<HTMLCanvasElement>(null)
  const [on, setOn] = useState(false)
  const cur = useRef({ mood, working, asks })
  cur.current = { mood, working, asks }

  useEffect(() => {
    const c = cv.current, el = box.current
    if (!c || !el || !liveHeadOk()) return
    let gl: HeadGL | null = createHead(c, () => { gl = null; setOn(false) })
    if (!gl) return
    setOn(true)
    const ctl = new HeadCtl(CHARACTER.lively)
    let raf = 0, timer = 0, last = 0, seen = -1, lay = ''
    let pal = { fail: cssRgb('--c-f', [255, 46, 99]), run: cssRgb('--c-w', [46, 242, 255]) }

    const place = () => {
      if (!gl) return
      const w = el.clientWidth
      const cw = w / COLS, dpr = window.devicePixelRatio || 1
      const k = `${w},${dpr}`
      if (k === lay) return
      lay = k
      const L = gl.layout({ cw, ch: (cw * 7) / 4, font: cw * FONT_PER_CW, dpr })
      c.style.width = `${L.w}px`; c.style.height = `${L.h}px`
      // Full height with the bake margins: the fin and the waving hands reach into them.
      c.style.left = `${-L.ox}px`; c.style.top = '0px'
      el.style.height = `${L.h}px`
    }
    const frame = (t: number) => {
      if (!gl || gl.lost()) return false
      const dt = last ? Math.min(t - last, 100) : 16
      last = t
      const s = cur.current
      if (seen >= 0 && s.asks > seen) ctl.ask(t)
      seen = s.asks
      const face = faceOf(s.mood, s.working)
      const eye = face === 'fail' ? pal.fail : face === 'run' ? pal.run : undefined
      const { frame: f, busy } = ctl.step({ t, dt, glances: [], face, eye, tip: pal.run })
      gl.render(f, t / 1000)
      return busy
    }
    const kick = () => {
      if (!gl || raf) return
      if (timer) { clearTimeout(timer); timer = 0 }
      raf = requestAnimationFrame((t) => {
        raf = 0
        if (!act.on()) { frame(t); last = 0; return }
        const busy = frame(t)
        timer = window.setTimeout(() => { timer = 0; kick() }, busy ? AMBIENT_MS : IDLE_MS)
      })
    }
    const ro = new ResizeObserver(() => { place(); kick() })
    ro.observe(el)
    const mo = new MutationObserver(() => {
      pal = { fail: cssRgb('--c-f', pal.fail), run: cssRgb('--c-w', pal.run) }
    })
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    const act = watchActive(el, (on) => {
      if (on) { kick(); return }
      cancelAnimationFrame(raf); clearTimeout(timer); raf = 0; timer = 0; last = 0
    })
    place()
    kick()
    return () => {
      cancelAnimationFrame(raf); clearTimeout(timer)
      ro.disconnect(); mo.disconnect()
      act.stop()
      gl?.dispose(); gl = null
      setOn(false)
    }
  }, [])

  return (
    <div ref={box} className={`rail-head${on ? ' on' : ''}`} aria-hidden="true">
      <canvas ref={cv} />
    </div>
  )
}
