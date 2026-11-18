// Keeps a scroll box on its last line while the owner has not scrolled up: on new content
// (call `follow`) and when the box itself resizes (the rail head lays out after the first
// render and shrinks the log).
export interface Box {
  scrollTop: number
  readonly scrollHeight: number
  readonly clientHeight: number
  addEventListener(t: 'scroll', f: () => void): void
  removeEventListener(t: 'scroll', f: () => void): void
}
type RO = { observe(el: never): void; disconnect(): void }
type ROCtor = new (cb: () => void) => RO

const SLACK = 24

export function stickBottom(el: Box, Observer: ROCtor | undefined = globalThis.ResizeObserver as ROCtor | undefined) {
  let stuck = true
  const toEnd = () => { el.scrollTop = el.scrollHeight }
  const onScroll = () => { stuck = el.scrollHeight - el.clientHeight - el.scrollTop <= SLACK }
  const ro = Observer ? new Observer(() => { if (stuck) toEnd() }) : null
  ro?.observe(el as never)
  el.addEventListener('scroll', onScroll)
  toEnd()
  return {
    // New content: follow it only when the box was at the bottom.
    follow: () => { if (stuck) toEnd() },
    stop: () => { ro?.disconnect(); el.removeEventListener('scroll', onScroll) },
  }
}
