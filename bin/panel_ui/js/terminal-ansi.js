// Ported from tools/nest/src/ui/ansi.ts (upstream Terminal tab).


// The Terminal tab (item_240): tmux capture lines with SGR codes turned into styled runs,
// and browser key events turned into tmux keys.













// Colors 0-15 use the theme's terminal palette (CSS variables), the rest are computed.
const base = (n        ) => `var(--ansi-${n})`

export function color256(n        )         {
  if (n < 16) return base(n)
  if (n < 232) {
    const c = n - 16
    const v = (x        ) => (x ? 55 + x * 40 : 0)
    return `rgb(${v(Math.floor(c / 36))},${v(Math.floor(c / 6) % 6)},${v(c % 6)})`
  }
  const g = 8 + (n - 232) * 10
  return `rgb(${g},${g},${g})`
}

// Applies one SGR parameter list to a style; returns the new style.
export function sgr(style       , params          )        {
  let s = { ...style }
  const p = params.length ? params : [0]
  for (let i = 0; i < p.length; i++) {
    const n = p[i]
    if (n === 0) s = {}
    else if (n === 1) s.bold = true
    else if (n === 2) s.dim = true
    else if (n === 3) s.italic = true
    else if (n === 4) s.underline = true
    else if (n === 7) s.reverse = true
    else if (n === 22) { s.bold = false; s.dim = false }
    else if (n === 23) s.italic = false
    else if (n === 24) s.underline = false
    else if (n === 27) s.reverse = false
    else if (n >= 30 && n <= 37) s.fg = base(n - 30)
    else if (n === 39) delete s.fg
    else if (n >= 40 && n <= 47) s.bg = base(n - 40)
    else if (n === 49) delete s.bg
    else if (n >= 90 && n <= 97) s.fg = base(n - 90 + 8)
    else if (n >= 100 && n <= 107) s.bg = base(n - 100 + 8)
    else if (n === 38 || n === 48) {
      const key = n === 38 ? 'fg' : 'bg'
      if (p[i + 1] === 5 && p[i + 2] !== undefined) { s[key] = color256(p[i + 2]); i += 2 }
      else if (p[i + 1] === 2 && p[i + 4] !== undefined) { s[key] = `rgb(${p[i + 2]},${p[i + 3]},${p[i + 4]})`; i += 4 }
    }
  }
  return s
}

// eslint-disable-next-line no-control-regex
// CSI (SGR kept), OSC such as 8 hyperlinks (dropped, their text stays), charset and keypad modes.
const ESC = /\x1b\[([0-9;:?]*)([A-Za-z])|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b[()][0-9A-Za-z]|\x1b[=>]/g

// One line into runs. The style carries over from the line before, as tmux only emits
// changes; the returned style is the one at the end of the line.
export function runsOf(line        , start        = {})                              {
  const runs        = []
  let style = start
  let at = 0
  const push = (text        ) => {
    if (!text) return
    const last = runs[runs.length - 1]
    if (last && last.style === style) last.text += text
    else runs.push({ text, style })
  }
  for (const m of line.matchAll(ESC)) {
    push(line.slice(at, m.index))
    at = m.index + m[0].length
    if (m[2] === 'm') style = sgr(style, m[1] ? m[1].split(/[;:]/).map((x) => Number(x) || 0) : [])
  }
  push(line.slice(at))
  return { runs, end: style }
}

const NAMED                         = {
  Enter: 'Enter', Escape: 'Escape', Backspace: 'BSpace', Tab: 'Tab', Delete: 'DC', Insert: 'IC',
  ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right',
  Home: 'Home', End: 'End', PageUp: 'PPage', PageDown: 'NPage',
}

// A keydown into a tmux key, or null when the browser keeps it (Ctrl+V paste, Alt, Meta, F-keys).
export function keyOf(e                                                                            )                 {
  if (e.metaKey || e.altKey) return null
  if (e.ctrlKey) {
    const k = e.key.toLowerCase()
    if (k === 'v') return null
    return /^[a-z]$/.test(k) ? { key: `C-${k}` } : null
  }
  if (e.key === 'Tab' && e.shiftKey) return { key: 'BTab' }
  if (NAMED[e.key]) return { key: NAMED[e.key] }
  if (e.key === ' ') return { text: ' ' }
  return e.key.length === 1 ? { text: e.key } : null
}

// Joins neighbouring text keys so a burst of typing is one send.
export function merge(keys           )            {
  const out            = []
  for (const k of keys) {
    const last = out[out.length - 1]
    if ('text' in k && last && 'text' in last && last.text.length + k.text.length <= 4000) out[out.length - 1] = { text: last.text + k.text }
    else out.push(k)
  }
  return out
}
