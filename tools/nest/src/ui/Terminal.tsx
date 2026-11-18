import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import type { Screen, TermKey } from '../data/live'
import { useSource } from '../data/useData'
import { keyOf, merge, runsOf, type Style } from './ansi'

// Terminal tab of a session in tmux (item_240): the pane's screen polled about once a
// second, keys typed while the box has focus sent through, the pane sized to the box.

const POLL_MS = 1000
const AFTER_KEYS_MS = 120
const FLUSH_MS = 50

const css = (s: Style): CSSProperties | undefined => {
  if (!s.fg && !s.bg && !s.bold && !s.dim && !s.italic && !s.underline && !s.reverse) return undefined
  const fg = s.reverse ? s.bg ?? 'var(--tty-bg)' : s.fg
  const bg = s.reverse ? s.fg ?? 'var(--tty-fg)' : s.bg
  return {
    color: fg, background: bg, fontWeight: s.bold ? 700 : undefined, opacity: s.dim ? 0.6 : undefined,
    fontStyle: s.italic ? 'italic' : undefined, textDecoration: s.underline ? 'underline' : undefined,
  }
}

function Lines({ screen }: { screen: Screen }) {
  let carry: Style = {}
  return (
    <>
      {screen.lines.map((line, i) => {
        const { runs, end } = runsOf(line, carry)
        carry = end
        return <div key={i} className="ln">{runs.length ? runs.map((r, j) => <span key={j} style={css(r.style)}>{r.text}</span>) : ' '}</div>
      })}
    </>
  )
}

export function Terminal({ pid }: { pid: number }) {
  const act = useSource().actions
  const [screen, setScreen] = useState<Screen | null>(null)
  const [error, setError] = useState('')
  const [focused, setFocused] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const probe = useRef<HTMLSpanElement>(null)
  const [cell, setCell] = useState({ w: 0, h: 0 })

  const load = useCallback(() => {
    act.screen(pid).then((s) => { setScreen(s); setError('') }, (e: unknown) => setError(e instanceof Error ? e.message : String(e)))
  }, [act, pid])

  // Poll while the page is visible; one call in flight at a time.
  useEffect(() => {
    let busy = false
    const tick = () => {
      if (busy || document.hidden) return
      busy = true
      act.screen(pid).then((s) => { setScreen(s); setError('') }, (e: unknown) => setError(e instanceof Error ? e.message : String(e))).finally(() => { busy = false })
    }
    tick()
    const t = setInterval(tick, POLL_MS)
    return () => clearInterval(t)
  }, [act, pid])

  // Keys wait FLUSH_MS so a burst of typing goes in one call; the screen reloads right after.
  const queue = useRef<TermKey[]>([])
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const send = useCallback((k: TermKey) => {
    queue.current.push(k)
    timer.current ??= setTimeout(() => {
      timer.current = null
      const keys = merge(queue.current.splice(0)).slice(0, 200)
      act.keys(pid, keys).then(() => setTimeout(load, AFTER_KEYS_MS), (e: unknown) => setError(e instanceof Error ? e.message : String(e)))
    }, FLUSH_MS)
  }, [act, pid, load])
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  // Size the pane to the box: whole cells, changes only, after the box settles.
  useLayoutEffect(() => {
    const p = probe.current
    if (p) setCell({ w: p.getBoundingClientRect().width / 10, h: p.getBoundingClientRect().height })
  }, [])
  const sized = useRef('')
  useEffect(() => {
    const el = box.current
    if (!el || !cell.w || !cell.h || typeof ResizeObserver === 'undefined') return
    let t: ReturnType<typeof setTimeout> | undefined
    const ro = new ResizeObserver(() => {
      clearTimeout(t)
      t = setTimeout(() => {
        const cs = getComputedStyle(el)
        const w = el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)
        const h = el.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom)
        const cols = Math.max(20, Math.min(400, Math.floor(w / cell.w)))
        const rows = Math.max(5, Math.min(200, Math.floor(h / cell.h)))
        const key = `${cols}x${rows}`
        if (key === sized.current) return
        sized.current = key
        act.resize(pid, cols, rows).then(() => setTimeout(load, AFTER_KEYS_MS), () => { sized.current = '' })
      }, 250)
    })
    ro.observe(el)
    return () => { ro.disconnect(); clearTimeout(t) }
  }, [act, pid, cell, load])

  const c = screen?.cursor
  return (
    <div
      ref={box} className={`tty${focused ? ' on' : ''}`} tabIndex={0} role="textbox" aria-label="Session terminal" aria-multiline="true"
      onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
      onKeyDown={(e) => {
        const k = keyOf(e)
        if (!k) return
        e.preventDefault()
        send(k)
      }}
      onPaste={(e) => {
        const text = e.clipboardData.getData('text')
        e.preventDefault()
        if (text) send({ text: text.slice(0, 4000) })
      }}
    >
      <span ref={probe} className="probe" aria-hidden="true">MMMMMMMMMM</span>
      {screen ? <Lines screen={screen} /> : !error && <div className="sm">Loading the screen…</div>}
      {screen && c?.shown && focused && cell.w > 0 && (
        <span className="cur" aria-hidden="true" style={{ left: `calc(var(--tty-pad) + ${c.x * cell.w}px)`, top: `calc(var(--tty-pad) + ${c.y * cell.h}px)`, width: cell.w, height: cell.h }} />
      )}
      {error && <div className="msg cr f">{error}</div>}
      {!focused && screen && <span className="hint">Click to type</span>}
    </div>
  )
}
