// Animation gate for the hero and the rail head: the tab is visible, the window has focus and the
// element is on screen. onChange fires on every flip; the loops stop while off and restart on on.
export interface Active { on: () => boolean; stop: () => void }

export function watchActive(el: Element, onChange: (on: boolean) => void): Active {
  let seen = true, focused = document.hasFocus(), last: boolean | undefined
  const on = () => seen && focused && document.visibilityState === 'visible'
  const fire = () => { const v = on(); if (v !== last) { last = v; onChange(v) } }
  const io = typeof IntersectionObserver === 'undefined' ? undefined : new IntersectionObserver(([e]) => { seen = e.isIntersecting; fire() })
  io?.observe(el)
  const focus = () => { focused = true; fire() }
  const blur = () => { focused = false; fire() }
  window.addEventListener('focus', focus)
  window.addEventListener('blur', blur)
  document.addEventListener('visibilitychange', fire)
  last = on()
  return {
    on,
    stop: () => {
      io?.disconnect()
      window.removeEventListener('focus', focus)
      window.removeEventListener('blur', blur)
      document.removeEventListener('visibilitychange', fire)
    },
  }
}
