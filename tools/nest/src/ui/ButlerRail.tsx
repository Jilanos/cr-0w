import { useEffect, useMemo, useRef, useState } from 'react'
import { isCommand, type ButlerMsg } from '../data/butler'
import { accountsOf } from '../data/live'
import { useButler } from '../data/useButler'
import type { Snapshot } from '../data/useData'
import { time } from '../format'
import { heroLiveOf, heroModel, type HeroModel } from '../hero/model'
import { RailHead } from '../hero/RailHead'
import { Link, navigate } from '../router'
import { enterSubmits, rowsOf } from './keys'

const FOLD_KEY = 'nest.rail'

function useFold(): [boolean, () => void] {
  const [folded, setFolded] = useState(() => {
    try { return localStorage.getItem(FOLD_KEY) === 'folded' } catch { return false }
  })
  const toggle = () => setFolded((f) => {
    try { localStorage.setItem(FOLD_KEY, f ? 'open' : 'folded') } catch { /* storage off: fold lasts the visit */ }
    return !f
  })
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.code === 'KeyB') { e.preventDefault(); toggle() }
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [])
  return [folded, toggle]
}

// Mood label subject: the failed project, the first one asking, or the live count.
export function railLabel(m: HeroModel): string {
  const by = (st: string) => m.projects.find((p) => p.state === st)
  if (m.mood === 'fail') return `fail · ${by('failed')?.name ?? 'run'}`
  if (m.mood === 'ask') return `ask · ${by('needs')?.name ?? `${m.asks} waiting`}`
  if (m.mood === 'run') return `run · ${m.projects.filter((p) => p.state === 'working').length} live`
  return 'idle'
}

const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1)

function Msg({ m }: { m: ButlerMsg }) {
  if (m.role === 'tool' || m.role === 'note') return <li className={`rl-msg ${m.role}`}>{m.text}</li>
  const you = m.role === 'you'
  return (
    <li className={`rl-msg ${you ? 'you' : 'cr'}`}>
      <span className="rl-who">{you ? '' : <i className="dot" aria-hidden="true" />}{you ? 'you' : 'cr-0w'} · {time(m.ts)}</span>
      <p>{m.text}</p>
      {m.chips?.length ? (
        <span className="rl-chips">{m.chips.map((c) => <Link key={c.href + c.label} href={c.href} className="rl-chip">{c.label}</Link>)}</span>
      ) : null}
    </li>
  )
}

// Butler rail (item_176, board desk-rail-a): CR-0W on the right of every laptop screen.
// Hero on top (none on Home, which has its own), the hero line, the conversation, then the
// account and the input. Ctrl+B folds it to a strip. Pinned (Home, where the rail is the right
// column): always open, no fold key, and no hero line (the hero says it already).
export function ButlerRail({ snap, head = true, pinned = false }: { snap: Snapshot; head?: boolean; pinned?: boolean }) {
  const b = useButler()
  const [folded, fold] = useFold()
  const m = useMemo(() => heroModel(snap.missions, snap.inbox, heroLiveOf(snap.sections), snap.now), [snap])
  const working = m.projects.some((p) => p.state === 'working')

  if (!b) return null
  const label = railLabel(m)

  if (folded && !pinned) {
    return (
      <aside className="b-rail folded" aria-label="CR-0W">
        <button type="button" className="rl-strip" onClick={fold} title="Open CR-0W (Ctrl+B)" aria-expanded="false">
          <i className={`dia m-${m.mood}`} aria-hidden="true" />
          <span className="rl-kbd">Ctrl B</span>
          <span className="rl-vert">{label}</span>
          {b.busy && <i className="rl-busy" aria-label="CR-0W is answering" />}
        </button>
      </aside>
    )
  }

  return (
    <aside className="b-rail" aria-label="CR-0W">
      <div className="rl-top">
        <span className={`rl-mood m-${m.mood}`}><i className="dia" aria-hidden="true" />{label}</span>
        {!pinned && <button type="button" className="rl-kbd" onClick={fold} title="Fold (Ctrl+B)" aria-expanded="true">Ctrl B</button>}
      </div>
      {head && <RailHead mood={m.mood} working={working} asks={m.asks} />}
      {!pinned && <p className="rl-line"><b>cr-0w</b> › {lower(m.line)}<span className="cur" aria-hidden="true">▌</span></p>}
      <ButlerChat snap={snap} fold={pinned ? undefined : fold} />
    </aside>
  )
}

// The conversation and its input (the rail body).
export function ButlerChat({ snap, fold }: { snap: Snapshot; fold?: () => void }) {
  const b = useButler()
  const [text, setText] = useState('')
  const [acct, setAcct] = useState<string | null>(null)
  const log = useRef<HTMLOListElement>(null)
  const accounts = useMemo(() => accountsOf(snap.sections.accounts), [snap.sections.accounts])
  const n = b?.messages.length ?? 0

  useEffect(() => {
    const el = log.current
    if (el) el.scrollTop = el.scrollHeight
  }, [n, b?.partial])

  if (!b) return null
  const send = () => {
    const t = text.trim()
    if (!t) return
    setText('')
    if (isCommand(t)) return navigate(`/desk?cmd=${encodeURIComponent(t)}`)
    void b.say(t, 'nest', acct ?? undefined)
  }

  return (
    <>
      <ol className="rl-log" ref={log} aria-live="polite">
        {b.messages.map((x) => <Msg key={x.seq} m={x} />)}
        {b.busy && (
          <li className="rl-msg cr typing">
            <span className="rl-who"><i className="dot" aria-hidden="true" />cr-0w</span>
            <p>{b.partial || '…'}</p>
          </li>
        )}
      </ol>
      {b.error && <p className="rl-err c-f" role="alert">{b.error}</p>}
      <form className="rl-foot" onSubmit={(e) => { e.preventDefault(); send() }}>
        <div className="rl-meta">
          <label>account
            <select value={acct ?? b.account} onChange={(e) => setAcct(e.target.value)}>
              <option value="">auto</option>
              {accounts.map((a) => <option key={a.name} value={a.name}>{a.name}</option>)}
            </select>
          </label>
          {fold && <button type="button" className="bare sm" onClick={fold}>Ctrl B fold</button>}
        </div>
        <div className="rl-in">
          <textarea value={text} rows={rowsOf(text, 4)} placeholder="Talk to CR-0W, or /dispatch…" aria-label="Message CR-0W"
            onChange={(e) => setText(e.target.value)} onKeyDown={enterSubmits} />
          <button type="submit" disabled={!text.trim()}>Send</button>
        </div>
      </form>
    </>
  )
}

