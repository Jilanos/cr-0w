import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'

// Butler rail width on laptop (item_256), remembered per device like nest.rail.
export const RAIL_W_KEY = 'nest.railw'
export const RAIL_W = 320
export const RAIL_MIN = 280
export const RAIL_MAX_RATIO = 0.6
export const RAIL_STEP = 24

type Store = Pick<Storage, 'getItem' | 'setItem'>
const local = (): Store | undefined => (typeof localStorage === 'undefined' ? undefined : localStorage)
const winW = () => (typeof window === 'undefined' ? Infinity : window.innerWidth)

// Width kept between 280px and 60% of the window.
export function clampRail(w: number, win: number): number {
  const max = Math.max(RAIL_MIN, Math.floor(win * RAIL_MAX_RATIO))
  return Math.round(Math.min(Math.max(w, RAIL_MIN), max))
}

// The saved width; 320 when nothing valid is saved or storage is blocked.
export function readRailWidth(store: Store | undefined = local()): number {
  try {
    const v = Number(store?.getItem(RAIL_W_KEY))
    return Number.isFinite(v) && v >= RAIL_MIN ? v : RAIL_W
  } catch {
    return RAIL_W
  }
}

export function saveRailWidth(w: number, store: Store | undefined = local()) {
  try { store?.setItem(RAIL_W_KEY, String(Math.round(w))) } catch { /* storage blocked: the width stays per visit */ }
}

// Grip on the rail's left edge: drag, Left and Right by 24px, double-click back to 320px.
// The width lands in --rail-w on the root, read by the rail and the app grid.
export function useRailWidth() {
  const [w, setW] = useState(() => readRailWidth())
  const drag = useRef<{ x0: number; w0: number } | null>(null)
  useEffect(() => { document.documentElement.style.setProperty('--rail-w', `${w}px`) }, [w])
  const set = (next: number, save = true) => {
    const c = clampRail(next, winW())
    setW(c)
    if (save) saveRailWidth(c)
  }
  const grip = {
    role: 'separator',
    'aria-orientation': 'vertical' as const,
    'aria-label': 'Resize CR-0W',
    'aria-valuenow': clampRail(w, winW()),
    'aria-valuemin': RAIL_MIN,
    'aria-valuemax': clampRail(Infinity, winW()),
    tabIndex: 0,
    title: 'Drag to resize, double-click for 320px',
    onPointerDown: (e: PointerEvent<HTMLElement>) => {
      e.preventDefault()
      e.currentTarget.setPointerCapture(e.pointerId)
      drag.current = { x0: e.clientX, w0: clampRail(w, winW()) }
    },
    onPointerMove: (e: PointerEvent<HTMLElement>) => {
      const d = drag.current
      if (d) set(d.w0 + d.x0 - e.clientX, false)
    },
    onPointerUp: (e: PointerEvent<HTMLElement>) => {
      const d = drag.current
      drag.current = null
      if (d) set(d.w0 + d.x0 - e.clientX)
    },
    onPointerCancel: () => { drag.current = null },
    onDoubleClick: () => set(RAIL_W),
    onKeyDown: (e: KeyboardEvent<HTMLElement>) => {
      const dir = e.key === 'ArrowLeft' ? 1 : e.key === 'ArrowRight' ? -1 : 0
      if (!dir) return
      e.preventDefault()
      set(clampRail(w, winW()) + dir * RAIL_STEP)
    },
  }
  return grip
}
